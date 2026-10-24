import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { personsUsing } from "@/lib/people";
import { addEnrollment, personalSchema, registerStudent, registerYear } from "@/modules/stu";
import { enrollBlocker, personDraft, typeAllowed } from "../domain/enroll-rules";
import type { EnrollInput, EnrollManyInput } from "../domain/enroll-schemas";

type Ctx = ActionContext;

const fail = (field: string, code: string): never => {
  throw new DomainError("VALIDATION", "Check the fields", { [field]: [code] });
};
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The first message of a validation error: a field code the UI can translate. */
const codeOf = (error: unknown): string => {
  if (error instanceof DomainError) {
    const first = error.fieldErrors ? Object.values(error.fieldErrors)[0]?.[0] : undefined;
    return first ?? error.message;
  }
  return "generic";
};

/**
 * AC-2..AC-6: turns one application into a student (or a new enrollment of a known student) in the
 * transaction of the action. `person` holds the data the officer confirmed.
 */
export async function enrollApplication(ctx: Ctx, input: EnrollInput) {
  const application = await ctx.db.application.findUnique({
    where: { id: input.applicationId },
    include: {
      cycle: { select: { documents: { select: { key: true, required: true } } } },
      documents: { where: { voidedAt: null }, select: { documentKey: true } },
    },
  });
  if (!application) throw new DomainError("NOT_FOUND", "Application not found");

  const blocker = enrollBlocker({
    status: application.status,
    documentTypes: application.cycle.documents,
    uploadedKeys: application.documents.map((d) => d.documentKey),
    allowMissingDocuments: input.allowMissingDocuments,
  });
  if (blocker) throw new DomainError("CONFLICT", blocker);

  const parsed = personalSchema.safeParse(input.person);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(String(issue?.path[0] ?? "person"), issue?.message ?? "invalid");
  }
  const person = parsed.data;

  const enrollment = {
    programId: application.programId,
    cohortId: input.cohortId,
    registrationType: input.registrationType,
    startedAt: input.startedAt,
  };
  const group = await ctx.db.studentGroup.findUnique({ where: { id: input.groupId } });
  if (!group) return fail("groupId", "groupMismatch");

  // Q-146: an existing student gets a new enrollment; their personal data stay as they are.
  const known = (await personsUsing(ctx.db, person)).filter((p) => p.student);
  if (known.length > 1) return fail("email", "personConflict");
  const knownStudentId = known[0]?.student?.id ?? null;
  if (!typeAllowed(input.registrationType, knownStudentId !== null))
    return fail("registrationType", "firstTimeKnown");

  let studentId: string;
  let enrollmentId: string;
  let studentNumber: string | null = null;
  if (knownStudentId) {
    studentId = knownStudentId;
    enrollmentId = (await addEnrollment(ctx, studentId, enrollment)).enrollmentId;
  } else {
    const created = await registerStudent(ctx, { ...person, enrollment });
    studentId = created.studentId;
    studentNumber = created.studentNumber;
    enrollmentId = created.enrollmentId!;
  }
  // The year of study and the academic year are those of the group (Q-146).
  await registerYear(ctx, {
    enrollmentId,
    academicYearId: group.academicYearId,
    yearOfStudy: group.yearOfStudy,
    groupId: group.id,
  });

  await ctx.db.application.update({
    where: { id: application.id },
    data: {
      status: "ENROLLED",
      studentId,
      enrollmentId,
      enrolledAt: new Date(),
      enrolledById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "adm.application.enroll",
    entityType: "Application",
    entityId: application.id,
    before: { status: application.status },
    after: {
      status: "ENROLLED",
      studentId,
      enrollmentId,
      existingStudent: knownStudentId !== null,
      allowedMissingDocuments: input.allowMissingDocuments,
    },
  });
  return { applicationId: application.id, studentId, enrollmentId, studentNumber };
}

export type BulkItem =
  | { applicationId: string; reference: string; ok: true; studentId: string }
  | { applicationId: string; reference: string; ok: false; code: string };

/**
 * AC-7: each candidate runs inside a savepoint, so one that fails (data conflict, wrong program)
 * is rolled back alone and reported; the others are enrolled.
 */
export async function enrollMany(ctx: Ctx, input: EnrollManyInput) {
  const apps = await ctx.db.application.findMany({
    where: { id: { in: input.applicationIds } },
  });
  const byId = new Map(apps.map((a) => [a.id, a]));
  const items: BulkItem[] = [];
  let n = 0;
  for (const id of input.applicationIds) {
    const a = byId.get(id);
    if (!a) {
      items.push({ applicationId: id, reference: "—", ok: false, code: "NOT_FOUND" });
      continue;
    }
    const savepoint = `adm_enroll_${n++}`;
    await ctx.db.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
    try {
      const done = await enrollApplication(ctx, {
        applicationId: a.id,
        person: personDraft({ ...a, birthDate: day(a.birthDate) }),
        registrationType: input.registrationType,
        cohortId: input.cohortId,
        groupId: input.groupId,
        startedAt: input.startedAt,
        allowMissingDocuments: input.allowMissingDocuments,
      });
      await ctx.db.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
      items.push({
        applicationId: a.id,
        reference: a.reference,
        ok: true,
        studentId: done.studentId,
      });
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      await ctx.db.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      items.push({ applicationId: a.id, reference: a.reference, ok: false, code: codeOf(error) });
    }
  }
  return {
    enrolled: items.filter((i) => i.ok).length,
    failed: items.filter((i) => !i.ok).length,
    items,
  };
}
