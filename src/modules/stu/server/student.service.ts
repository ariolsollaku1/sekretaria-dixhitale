import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { linkAccountByEmail, personsUsing } from "@/lib/people";
import { getYear } from "@/modules/org";
import type { EnrollmentInput, PersonalInput, YearRegistrationInput } from "../domain/schemas";
import { isOpenStatus, validateYearRegistration } from "../domain/student-rules";
import { runEnrollmentOpenedHandlers } from "./status-hooks";
import { fullView, getStudentRow, type StudentView } from "./student.queries";

type Ctx = ActionContext;
const date = (day: string) => new Date(`${day}T00:00:00Z`);
const fail = (field: string, code: string): never => {
  throw new DomainError("VALIDATION", "Check the fields", { [field]: [code] });
};
const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/** Flat shape for audit diffs; sensitive values are masked by the audit layer (AC-6). */
const personalSnapshot = (v: Omit<StudentView, "id" | "personId" | "studentNumber">) => ({ ...v });
const fromInput = (i: PersonalInput) =>
  personalSnapshot({
    nim: i.nim,
    firstName: i.firstName,
    lastName: i.lastName,
    fatherName: i.fatherName,
    gender: i.gender,
    birthDate: i.birthDate,
    nationalId: i.nationalId,
    address: i.address,
    phone: i.phone,
    email: i.email,
    birthPlace: i.birthPlace,
    residence: i.residence,
  });

async function assertNimFree(ctx: Ctx, nim: string | null, exceptStudentId?: string) {
  if (!nim) return;
  const clash = await ctx.db.student.findFirst({
    where: { nim, ...(exceptStudentId ? { id: { not: exceptStudentId } } : {}) },
    select: { id: true },
  });
  if (clash) fail("nim", "nimTaken");
}

/** AC-2..AC-4: creates the enrollment and its first history row. */
export async function addEnrollment(ctx: Ctx, studentId: string, input: EnrollmentInput) {
  const program = await ctx.db.studyProgram.findUnique({
    where: { id: input.programId },
    select: { id: true, active: true },
  });
  if (!program) fail("programId", "unknownProgram");
  if (!program!.active) throw new DomainError("CONFLICT", "PROGRAM_INACTIVE");
  const cohort = await ctx.db.cohort.findUnique({
    where: { id: input.cohortId },
    select: { id: true, programId: true, active: true },
  });
  if (!cohort || cohort.programId !== input.programId || !cohort.active)
    fail("cohortId", "cohortMismatch");
  const open = await ctx.db.enrollment.findFirst({
    where: { studentId, programId: input.programId, status: { in: ["ACTIVE", "SUSPENDED"] } },
    select: { id: true },
  });
  if (open) fail("programId", "alreadyEnrolled");

  try {
    const enrollment = await ctx.db.enrollment.create({
      data: {
        studentId,
        programId: input.programId,
        cohortId: input.cohortId,
        registrationType: input.registrationType,
        startedAt: date(input.startedAt),
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
        history: {
          create: {
            fromStatus: null,
            toStatus: "ACTIVE",
            effectiveDate: date(input.startedAt),
            createdById: ctx.user.id,
          },
        },
      },
    });
    await ctx.audit({
      action: "stu.enrollment.create",
      entityType: "Enrollment",
      entityId: enrollment.id,
      before: null,
      after: { studentId, ...input, status: "ACTIVE" },
    });
    const owner = await ctx.db.student.findUniqueOrThrow({
      where: { id: studentId },
      select: { personId: true },
    });
    await runEnrollmentOpenedHandlers(ctx, {
      enrollmentId: enrollment.id,
      studentId,
      personId: owner.personId,
      programId: input.programId,
    });
    return { enrollmentId: enrollment.id };
  } catch (error) {
    if (isUnique(error)) return fail("programId", "alreadyEnrolled");
    throw error;
  }
}

/** AC-1, AC-4..AC-5: person (new or attached), student, optional first enrollment. */
export async function registerStudent(
  ctx: Ctx,
  input: PersonalInput & { enrollment: EnrollmentInput | null },
) {
  const { enrollment, ...personal } = input;
  await assertNimFree(ctx, personal.nim);
  const matches = await personsUsing(ctx.db, personal);
  let personId: string;
  if (matches.length > 1) {
    return fail(
      matches[0]!.nationalId === personal.nationalId && personal.nationalId
        ? "nationalId"
        : "email",
      "personConflict",
    );
  } else if (matches.length === 1) {
    const person = matches[0]!;
    // a person who is a student already is a duplicate; a person who is only staff is attached
    if (person.student)
      return fail(
        person.nationalId && person.nationalId === personal.nationalId ? "nationalId" : "email",
        "alreadyStudent",
      );
    personId = person.id;
  } else {
    const person = await ctx.db.person.create({
      data: {
        firstName: personal.firstName,
        lastName: personal.lastName,
        fatherName: personal.fatherName,
        gender: personal.gender,
        birthDate: date(personal.birthDate),
        nationalId: personal.nationalId,
        phone: personal.phone,
        email: personal.email,
        address: personal.address,
        birthPlace: personal.birthPlace,
        residence: personal.residence,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    personId = person.id;
  }

  let student;
  try {
    student = await ctx.db.student.create({
      data: { personId, nim: personal.nim, createdById: ctx.user.id, updatedById: ctx.user.id },
    });
  } catch (error) {
    if (isUnique(error)) return fail("nim", "nimTaken");
    throw error;
  }
  await linkAccountByEmail(ctx.db, personal.email, personId);
  await ctx.audit({
    action: "stu.student.create",
    entityType: "Student",
    entityId: student.id,
    before: null,
    after: { studentNumber: student.studentNumber, ...fromInput(personal) },
  });
  const enrolled = enrollment ? await addEnrollment(ctx, student.id, enrollment) : null;
  return {
    studentId: student.id,
    studentNumber: student.studentNumber,
    enrollmentId: enrolled?.enrollmentId ?? null,
  };
}

/** AC-6 */
export async function updateStudent(ctx: Ctx, studentId: string, input: PersonalInput) {
  const row = await getStudentRow(studentId, ctx.db);
  if (!row) throw new DomainError("NOT_FOUND", "Student not found");
  const before = fullView(row);
  await assertNimFree(ctx, input.nim, studentId);
  const clash = (await personsUsing(ctx.db, input, row.personId))[0];
  if (clash)
    fail(
      clash.nationalId && clash.nationalId === input.nationalId ? "nationalId" : "email",
      "alreadyUsed",
    );

  await ctx.db.person.update({
    where: { id: row.personId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      fatherName: input.fatherName,
      gender: input.gender,
      birthDate: date(input.birthDate),
      nationalId: input.nationalId,
      phone: input.phone,
      email: input.email,
      address: input.address,
      birthPlace: input.birthPlace,
      residence: input.residence,
      updatedById: ctx.user.id,
    },
  });
  try {
    await ctx.db.student.update({
      where: { id: studentId },
      data: { nim: input.nim, updatedById: ctx.user.id },
    });
  } catch (error) {
    if (isUnique(error)) return fail("nim", "nimTaken");
    throw error;
  }
  await ctx.audit({
    action: "stu.student.update",
    entityType: "Student",
    entityId: studentId,
    before: personalSnapshot(stripIds(before)),
    after: fromInput(input),
  });
  return { studentId };
}

const stripIds = ({ id: _id, personId: _p, studentNumber: _n, ...rest }: StudentView) => {
  void _id;
  void _p;
  void _n;
  return rest;
};

async function loadEnrollment(ctx: Ctx, enrollmentId: string) {
  const enrollment = await ctx.db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: { program: { select: { durationYears: true } } },
  });
  if (!enrollment) throw new DomainError("NOT_FOUND", "Enrollment not found");
  return enrollment;
}

/** AC-7 */
export async function registerYear(ctx: Ctx, input: YearRegistrationInput) {
  const enrollment = await loadEnrollment(ctx, input.enrollmentId);
  const year = await getYear(input.academicYearId, ctx.db);
  if (!year) return fail("academicYearId", "unknownYear");
  const group = await ctx.db.studentGroup.findUnique({ where: { id: input.groupId } });
  const errors = validateYearRegistration({
    yearOfStudy: input.yearOfStudy,
    durationYears: enrollment.program.durationYears,
    enrollmentStatus: enrollment.status,
    yearStatus: year.status,
    group,
    enrollment,
    academicYearId: input.academicYearId,
  });
  if (Object.keys(errors).length > 0)
    throw new DomainError(
      "VALIDATION",
      "Check the registration",
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v!]])),
    );
  try {
    const created = await ctx.db.yearRegistration.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "stu.year_registration.create",
      entityType: "YearRegistration",
      entityId: created.id,
      before: null,
      after: { ...input },
    });
    return { yearRegistrationId: created.id };
  } catch (error) {
    if (isUnique(error)) return fail("academicYearId", "alreadyRegistered");
    throw error;
  }
}

/** AC-8: another group of the same cohort, academic year and year of study. */
export async function changeGroup(ctx: Ctx, yearRegistrationId: string, groupId: string) {
  const reg = await ctx.db.yearRegistration.findUnique({
    where: { id: yearRegistrationId },
    include: { enrollment: true, academicYear: { select: { status: true } } },
  });
  if (!reg) throw new DomainError("NOT_FOUND", "Registration not found");
  const group = await ctx.db.studentGroup.findUnique({ where: { id: groupId } });
  const errors = validateYearRegistration({
    yearOfStudy: reg.yearOfStudy,
    durationYears: Number.MAX_SAFE_INTEGER,
    enrollmentStatus: reg.enrollment.status,
    yearStatus: reg.academicYear.status,
    group,
    enrollment: reg.enrollment,
    academicYearId: reg.academicYearId,
  });
  if (Object.keys(errors).length > 0)
    throw new DomainError(
      "VALIDATION",
      "Check the group",
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v!]])),
    );
  if (reg.groupId === groupId) return { yearRegistrationId };
  await ctx.db.yearRegistration.update({
    where: { id: reg.id },
    data: { groupId, updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "stu.year_registration.update_group",
    entityType: "YearRegistration",
    entityId: reg.id,
    before: { groupId: reg.groupId },
    after: { groupId },
  });
  return { yearRegistrationId };
}

export { isOpenStatus };
