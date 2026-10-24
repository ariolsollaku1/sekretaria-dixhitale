import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { createAuditor } from "@/lib/audit";
import { db, withTransaction } from "@/lib/db";
import { checkMime, sanitizeFileName } from "@/lib/files/mime";
import { getFilePurpose } from "@/lib/files/purposes";
import { logger } from "@/lib/logger";
import { bucketFor, hit } from "@/lib/ratelimit";
import { getStorage } from "@/lib/storage";
import { newStorageKey } from "@/lib/storage/storage";
import {
  LINK_RATE,
  SUBMIT_RATE,
  TOKEN_PATTERN,
  UPLOAD_RATE,
  emailKey,
  isCycleOpen,
  isTokenExpired,
  makeReference,
  mayUpload,
  missingRequired,
  todayInTirane,
  tokenExpiry,
} from "../domain/application-rules";
import { HONEYPOT_FIELD, applicationSchema, linkRequestSchema } from "../domain/schemas";
import { queueApplicationMail, sendQueued } from "./application-mail";
import { FILE_PURPOSE, registerAdmPurposes } from "./purposes";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const day = (d: Date) => d.toISOString().slice(0, 10);

export type SubmitResult =
  | { ok: true; reference: string; token: string }
  | { ok: false; code: "RATE_LIMITED" }
  | { ok: false; code: "VALIDATION"; errors: Record<string, string> };

function issueErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const i of issues) {
    const key = String(i.path[0] ?? "form");
    errors[key] ??= i.message;
  }
  return errors;
}

/**
 * AC-3..AC-6: a visitor sends the application. A filled honeypot is answered like a success and
 * stores nothing; the rate limit counts per IP hash (the IP is never stored); the e-mail is queued
 * in the same transaction as the application.
 */
export async function submitApplication(
  raw: Record<string, unknown>,
  ip: string | null,
  now = new Date(),
): Promise<SubmitResult> {
  if (typeof raw[HONEYPOT_FIELD] === "string" && raw[HONEYPOT_FIELD].trim() !== "") {
    return {
      ok: true,
      reference: makeReference(randomBytes(8)),
      token: newToken(),
    };
  }
  const limit = await hit(bucketFor("adm:apply", ip), SUBMIT_RATE, now);
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED" };

  const parsed = applicationSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, code: "VALIDATION", errors: issueErrors(parsed.error.issues) };
  const input = parsed.data;

  const [cycle, program] = await Promise.all([
    db.applicationCycle.findUnique({ where: { id: input.cycleId } }),
    db.studyProgram.findUnique({ where: { id: input.programId }, select: { active: true } }),
  ]);
  if (
    !cycle ||
    !isCycleOpen(
      { active: cycle.active, opensOn: day(cycle.opensOn), closesOn: day(cycle.closesOn) },
      todayInTirane(now),
    )
  )
    return { ok: false, code: "VALIDATION", errors: { cycleId: "cycleClosed" } };
  if (!program?.active)
    return { ok: false, code: "VALIDATION", errors: { programId: "programUnavailable" } };

  const key = emailKey(input.email);
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = makeReference(randomBytes(8));
    const token = newToken();
    try {
      const created = await withTransaction(async (tx) => {
        const row = await tx.application.create({
          data: {
            reference,
            cycleId: input.cycleId,
            programId: input.programId,
            locale: input.locale,
            firstName: input.firstName,
            lastName: input.lastName,
            fatherName: input.fatherName,
            gender: input.gender,
            birthDate: new Date(`${input.birthDate}T00:00:00Z`),
            birthPlace: input.birthPlace,
            nationalId: input.nationalId,
            email: input.email,
            emailKey: key,
            phone: input.phone,
            address: input.address,
            residence: input.residence,
            schoolName: input.schoolName,
            schoolCity: input.schoolCity,
            graduationYear: input.graduationYear,
            averageGrade: input.averageGrade.toFixed(2),
            consentAt: now,
            tokenHash: hashToken(token),
            tokenExpiresAt: tokenExpiry(now),
            submittedAt: now,
          },
          select: { id: true },
        });
        await createAuditor(tx, { type: "PUBLIC" })({
          action: "adm.application.submit",
          entityType: "Application",
          entityId: row.id,
          before: null,
          // ids only: no personal data in the audit trail
          after: { reference, cycleId: input.cycleId, programId: input.programId },
        });
        const outboxId = await queueApplicationMail(tx, {
          kind: "adm.application-received",
          to: input.email,
          locale: input.locale,
          name: input.firstName,
          reference,
          token,
        });
        return { outboxId };
      });
      await sendQueued(created.outboxId);
      return { ok: true, reference, token };
    } catch (error) {
      if (!isUnique(error)) throw error;
      // the same e-mail, program and cycle -> refuse; otherwise a reference/token collision: draw again
      const duplicate = await db.application.count({
        where: { cycleId: input.cycleId, programId: input.programId, emailKey: key },
      });
      if (duplicate > 0) return { ok: false, code: "VALIDATION", errors: { email: "duplicate" } };
    }
  }
  throw new Error("could not allocate an application reference");
}

export type ApplicationDocumentView = {
  key: string;
  label: { sq: string; en: string | null };
  required: boolean;
  file: { name: string; uploadedAt: Date } | null;
};

export type StatusView = {
  id: string;
  reference: string;
  status: string;
  locale: string;
  cycle: string;
  program: { code: string; name: string; nameEn: string | null };
  data: {
    firstName: string;
    lastName: string;
    fatherName: string | null;
    gender: string;
    birthDate: string;
    email: string;
    phone: string;
    address: string;
    schoolName: string;
    graduationYear: number;
    averageGrade: string;
  };
  documents: ApplicationDocumentView[];
  missing: string[];
  canUpload: boolean;
};

/** AC-7, AC-8: the application behind a link, or null (malformed, unknown, expired). */
export async function getApplicationByToken(
  token: string,
  now = new Date(),
): Promise<StatusView | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const app = await db.application.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      cycle: { include: { documents: { orderBy: { sequence: "asc" } } } },
      program: { select: { code: true, name: true, nameEn: true } },
      documents: { where: { voidedAt: null } },
    },
  });
  if (!app || isTokenExpired(app.tokenExpiresAt, now)) return null;
  const files = await db.storedFile.findMany({
    where: { id: { in: app.documents.map((d) => d.fileId) } },
    select: { id: true, fileName: true },
  });
  const nameOf = new Map(files.map((f) => [f.id, f.fileName]));
  const documents = app.cycle.documents.map((t) => {
    const doc = app.documents.find((d) => d.documentKey === t.key);
    return {
      key: t.key,
      label: { sq: t.labelSq, en: t.labelEn },
      required: t.required,
      file: doc ? { name: nameOf.get(doc.fileId) ?? "—", uploadedAt: doc.uploadedAt } : null,
    };
  });
  return {
    id: app.id,
    reference: app.reference,
    status: app.status,
    locale: app.locale,
    cycle: app.cycle.name,
    program: app.program,
    data: {
      firstName: app.firstName,
      lastName: app.lastName,
      fatherName: app.fatherName,
      gender: app.gender,
      birthDate: day(app.birthDate),
      email: app.email,
      phone: app.phone,
      address: app.address,
      schoolName: app.schoolName,
      graduationYear: app.graduationYear,
      averageGrade: app.averageGrade.toFixed(2),
    },
    documents,
    missing: missingRequired(
      app.cycle.documents,
      app.documents.map((d) => d.documentKey),
    ),
    canUpload: mayUpload(app.status),
  };
}

export type UploadResult =
  | { ok: true; fileName: string }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "RATE_LIMITED"
        | "CLOSED"
        | "UNKNOWN_DOCUMENT"
        | "EMPTY"
        | "TOO_LARGE"
        | "UNSUPPORTED_TYPE"
        | "TYPE_MISMATCH";
    };

/**
 * AC-9: a candidate adds the file of one document type. The earlier file of the type is voided
 * (kept, never deleted); the new one is attached at once. Rate limited per IP hash.
 */
export async function uploadDocument(
  token: string,
  documentKey: string,
  file: { name: string; type: string | null; bytes: Uint8Array },
  ip: string | null,
  now = new Date(),
): Promise<UploadResult> {
  registerAdmPurposes();
  const limit = await hit(bucketFor("adm:upload", ip), UPLOAD_RATE, now);
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED" };
  if (!TOKEN_PATTERN.test(token)) return { ok: false, code: "NOT_FOUND" };
  const app = await db.application.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      status: true,
      tokenExpiresAt: true,
      cycle: { select: { documents: { select: { key: true } } } },
    },
  });
  if (!app || isTokenExpired(app.tokenExpiresAt, now)) return { ok: false, code: "NOT_FOUND" };
  if (!mayUpload(app.status)) return { ok: false, code: "CLOSED" };
  if (!app.cycle.documents.some((d) => d.key === documentKey))
    return { ok: false, code: "UNKNOWN_DOCUMENT" };

  const purpose = getFilePurpose(FILE_PURPOSE)!;
  if (file.bytes.length > purpose.maxBytes) return { ok: false, code: "TOO_LARGE" };
  const checked = checkMime(file.bytes, file.type, purpose.mimeTypes);
  if (!checked.ok) return { ok: false, code: checked.reason };

  const id = randomBytes(12).toString("hex");
  const storageKey = newStorageKey(id, now);
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  const fileName = sanitizeFileName(file.name);
  const storage = getStorage();
  await storage.put(storageKey, file.bytes);
  try {
    await withTransaction(async (tx) => {
      await tx.storedFile.create({
        data: {
          id,
          storageKey,
          purpose: FILE_PURPOSE,
          fileName,
          mimeType: checked.mimeType,
          size: file.bytes.length,
          sha256,
          status: "ATTACHED",
          entityType: "Application",
          entityId: app.id,
          attachedAt: now,
          uploadedById: `application:${app.id}`,
        },
      });
      const voided = await tx.applicationDocument.updateMany({
        where: { applicationId: app.id, documentKey, voidedAt: null },
        data: { voidedAt: now },
      });
      await tx.applicationDocument.create({
        data: { applicationId: app.id, documentKey, fileId: id, uploadedAt: now },
      });
      await createAuditor(tx, { type: "PUBLIC" })({
        action: "adm.application.upload",
        entityType: "Application",
        entityId: app.id,
        before: null,
        after: { documentKey, fileId: id, replaced: voided.count },
      });
    });
  } catch (error) {
    await storage
      .delete(storageKey)
      .catch(() => logger.error("orphan object after failed upload", { fileId: id }));
    throw error;
  }
  return { ok: true, fileName };
}

/**
 * AC-10: the candidate asks for a new link with reference + e-mail. The old link stops working
 * only when both match; the answer never tells whether they did. Rate limited per IP hash.
 */
export async function requestNewLink(
  raw: Record<string, unknown>,
  ip: string | null,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; code: "RATE_LIMITED" | "VALIDATION" }> {
  const limit = await hit(bucketFor("adm:link", ip), LINK_RATE, now);
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED" };
  const parsed = linkRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, code: "VALIDATION" };
  const app = await db.application.findUnique({
    where: { reference: parsed.data.reference.toUpperCase() },
    select: {
      id: true,
      emailKey: true,
      email: true,
      firstName: true,
      locale: true,
      reference: true,
    },
  });
  if (!app || app.emailKey !== emailKey(parsed.data.email)) return { ok: true };

  const token = newToken();
  const outboxId = await withTransaction(async (tx) => {
    await tx.application.update({
      where: { id: app.id },
      data: { tokenHash: hashToken(token), tokenExpiresAt: tokenExpiry(now) },
    });
    await createAuditor(tx, { type: "PUBLIC" })({
      action: "adm.application.relink",
      entityType: "Application",
      entityId: app.id,
      before: null,
      after: { reference: app.reference },
    });
    return queueApplicationMail(tx, {
      kind: "adm.link-reissued",
      to: app.email,
      locale: app.locale,
      name: app.firstName,
      reference: app.reference,
      token,
    });
  });
  await sendQueued(outboxId);
  return { ok: true };
}
