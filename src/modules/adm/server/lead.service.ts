import "server-only";
import { createTranslator } from "next-intl";
import { DomainError, type ActionContext } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { env } from "@/lib/env";
import { enqueue } from "@/lib/jobs";
import { renderMessage } from "@/lib/notify/render";
import en from "../../../../messages/en.json";
import sq from "../../../../messages/sq.json";
import {
  canTransition,
  inviteBlocker,
  matchProgram,
  parseLeadCsv,
  type ProgramRef,
} from "../domain/lead-rules";
import type { CreateLeadInput, UpdateLeadInput } from "../domain/lead-schemas";

type Ctx = ActionContext;

// Audit entries carry ids, states and field NAMES only — never the prospect's personal data (AC-9).

async function loadLead(ctx: Ctx, leadId: string) {
  const lead = await ctx.db.lead.findUnique({ where: { id: leadId } });
  if (!lead) throw new DomainError("NOT_FOUND", "Lead not found");
  return lead;
}

async function activeProgram(ctx: Ctx, programId: string | null) {
  if (!programId) return null;
  const program = await ctx.db.studyProgram.findUnique({
    where: { id: programId },
    select: { id: true, active: true },
  });
  if (!program) throw new DomainError("NOT_FOUND", "Program not found");
  if (!program.active)
    throw new DomainError("VALIDATION", "Check the lead", { programId: ["inactive"] });
  return program.id;
}

/** AC-3: enter a lead by hand. */
export async function createLead(ctx: Ctx, input: CreateLeadInput) {
  const programId = await activeProgram(ctx, input.programId);
  const lead = await ctx.db.lead.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      programId,
      programNote: input.programNote,
      message: input.message,
      source: input.source,
      sourceNote: input.sourceNote,
      consent: input.consent,
      consentAt: input.consent ? new Date() : null,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
      events: { create: { kind: "CREATED", actorId: ctx.user.id } },
    },
  });
  await ctx.audit({
    action: "adm.lead.create",
    entityType: "Lead",
    entityId: lead.id,
    before: null,
    after: { source: lead.source, programId, status: lead.status },
  });
  return { leadId: lead.id };
}

/** AC-7: change contact data, program and source. Consent is not editable (it is the prospect's act). */
export async function updateLead(ctx: Ctx, input: UpdateLeadInput) {
  const lead = await loadLead(ctx, input.leadId);
  const programId = await activeProgram(ctx, input.programId);
  const data = {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    programId,
    programNote: input.programNote,
    message: input.message,
    source: input.source,
    sourceNote: input.sourceNote,
  };
  const changed = (Object.keys(data) as (keyof typeof data)[]).filter(
    (k) => (lead[k] ?? null) !== data[k],
  );
  if (changed.length === 0) return { leadId: lead.id };
  await ctx.db.lead.update({ where: { id: lead.id }, data: { ...data, updatedById: ctx.user.id } });
  await ctx.db.leadEvent.create({
    data: { leadId: lead.id, kind: "EDITED", body: changed.join(", "), actorId: ctx.user.id },
  });
  await ctx.audit({
    action: "adm.lead.update",
    entityType: "Lead",
    entityId: lead.id,
    before: null,
    after: { changedFields: changed },
  });
  return { leadId: lead.id };
}

/** AC-6 */
export async function changeLeadStatus(
  ctx: Ctx,
  input: { leadId: string; to: "NEW" | "CONTACTED" | "APPLIED" | "LOST"; reason: string | null },
) {
  const lead = await loadLead(ctx, input.leadId);
  if (!canTransition(lead.status, input.to))
    throw new DomainError("CONFLICT", "TRANSITION_NOT_ALLOWED");
  if (input.to === "LOST" && !input.reason)
    throw new DomainError("VALIDATION", "Check the lead", { reason: ["required"] });
  await ctx.db.lead.update({
    where: { id: lead.id },
    data: {
      status: input.to,
      lostReason: input.to === "LOST" ? input.reason : null,
      updatedById: ctx.user.id,
    },
  });
  await ctx.db.leadEvent.create({
    data: {
      leadId: lead.id,
      kind: "STATUS",
      fromStatus: lead.status,
      toStatus: input.to,
      body: input.to === "LOST" ? input.reason : null,
      actorId: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "adm.lead.change_status",
    entityType: "Lead",
    entityId: lead.id,
    before: { status: lead.status },
    after: { status: input.to },
    reason: input.reason,
  });
  return { leadId: lead.id, status: input.to };
}

/** AC-7: the assignee must be an active user who can work leads. */
export async function assignLead(ctx: Ctx, leadId: string, assigneeId: string | null) {
  const lead = await loadLead(ctx, leadId);
  if (assigneeId) {
    const user = await ctx.db.user.findUnique({
      where: { id: assigneeId },
      select: { active: true },
    });
    if (!user?.active || !(await can({ id: assigneeId }, "adm.lead.write")))
      throw new DomainError("VALIDATION", "Check the assignee", {
        assigneeId: ["assigneeCannotWork"],
      });
  }
  if (lead.assigneeId === assigneeId) return { leadId };
  await ctx.db.lead.update({
    where: { id: leadId },
    data: { assigneeId, updatedById: ctx.user.id },
  });
  await ctx.db.leadEvent.create({
    data: { leadId, kind: "ASSIGNED", body: assigneeId, actorId: ctx.user.id },
  });
  await ctx.audit({
    action: "adm.lead.assign",
    entityType: "Lead",
    entityId: leadId,
    before: { assigneeId: lead.assigneeId },
    after: { assigneeId },
  });
  return { leadId };
}

/** AC-7: notes are append-only. */
export async function addLeadNote(ctx: Ctx, leadId: string, body: string) {
  await loadLead(ctx, leadId);
  await ctx.db.leadEvent.create({ data: { leadId, kind: "NOTE", body, actorId: ctx.user.id } });
  await ctx.audit({
    action: "adm.lead.note",
    entityType: "Lead",
    entityId: leadId,
    before: null,
    after: null,
  });
  return { leadId };
}

const CATALOGS = { sq, en } as const;

/** Q-138: the invitation text (Albanian); no link until ADM-02 has an application page. */
export function renderInvitation(lead: { firstName: string; programName: string | null }) {
  const t = createTranslator({
    locale: "sq",
    messages: CATALOGS.sq as never,
    namespace: "adm.invite" as never,
    onError: (error) => {
      throw error;
    },
  }) as unknown as (key: string, values?: Record<string, string>) => string;
  const values = { name: lead.firstName, program: lead.programName ?? "" };
  const subject = t("subject", values);
  const body = t(lead.programName ? "bodyProgram" : "body", values);
  return renderMessage({
    type: "adm.lead-invitation",
    params: {},
    locale: "sq",
    messages: CATALOGS.sq,
    appUrl: env.APP_URL,
    link: null,
    raw: { title: subject, body, subject },
  });
}

/** AC-8: queue the invitation e-mail through the outbox of PLT-11 (no user account involved). */
export async function inviteLead(ctx: Ctx, leadId: string) {
  const lead = await ctx.db.lead.findUnique({
    where: { id: leadId },
    include: { program: { select: { name: true } } },
  });
  if (!lead) throw new DomainError("NOT_FOUND", "Lead not found");
  const blocker = inviteBlocker(lead);
  if (blocker) throw new DomainError("CONFLICT", blocker);

  const rendered = renderInvitation({
    firstName: lead.firstName,
    programName: lead.program?.name ?? null,
  });
  const outbox = await ctx.db.emailOutbox.create({
    data: {
      toAddress: lead.email!,
      type: "adm.lead-invitation",
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
  });
  ctx.afterCommit(async () => {
    await enqueue("plt.mail.send", { outboxId: outbox.id }, { key: `mail:${outbox.id}` });
  });

  const now = new Date();
  await ctx.db.lead.update({
    where: { id: lead.id },
    data: {
      invitedAt: now,
      invitedById: ctx.user.id,
      status: lead.status === "NEW" ? "CONTACTED" : lead.status,
      updatedById: ctx.user.id,
    },
  });
  await ctx.db.leadEvent.create({
    data: {
      leadId: lead.id,
      kind: "INVITED",
      fromStatus: lead.status === "NEW" ? "NEW" : null,
      toStatus: lead.status === "NEW" ? "CONTACTED" : null,
      actorId: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "adm.lead.invite",
    entityType: "Lead",
    entityId: lead.id,
    before: { status: lead.status },
    after: { status: lead.status === "NEW" ? "CONTACTED" : lead.status, outboxId: outbox.id },
  });
  return { leadId: lead.id, outboxId: outbox.id };
}

export type ImportResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; fileError: string }
  | { ok: false; errors: { line: number; code: string }[] };

/** AC-4: all valid rows or none; rows with a known e-mail are skipped. */
export async function importLeads(
  ctx: Ctx,
  input: {
    csv: string;
    source: "WEBSITE" | "CAMPAIGN" | "EVENT" | "OTHER";
    sourceNote: string | null;
  },
): Promise<ImportResult> {
  const parsed = parseLeadCsv(input.csv);
  if (!parsed.ok) return parsed;

  const emails = parsed.rows.flatMap((r) => (r.email ? [r.email] : []));
  const known = new Set(
    (
      await ctx.db.lead.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      })
    ).map((l) => l.email!),
  );
  const programs: ProgramRef[] = await ctx.db.studyProgram.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true, nameEn: true },
  });

  let skipped = 0;
  const seen = new Set<string>();
  const now = new Date();
  const rows = parsed.rows.filter((r) => {
    if (r.email && (known.has(r.email) || seen.has(r.email))) {
      skipped++;
      return false;
    }
    if (r.email) seen.add(r.email);
    return true;
  });
  if (rows.length > 0) {
    const created = await ctx.db.lead.createManyAndReturn({
      data: rows.map((r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        programId: matchProgram(r.program, programs),
        programNote: r.program,
        source: input.source,
        sourceNote: input.sourceNote,
        consent: r.consent,
        consentAt: r.consent ? now : null,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      })),
      select: { id: true },
    });
    await ctx.db.leadEvent.createMany({
      data: created.map((l) => ({ leadId: l.id, kind: "CREATED" as const, actorId: ctx.user.id })),
    });
  }
  await ctx.audit({
    action: "adm.lead.import",
    entityType: "Lead",
    entityId: null,
    before: null,
    after: { imported: rows.length, skipped, source: input.source },
  });
  return { ok: true, imported: rows.length, skipped };
}
