import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { assignRole as assignRoleRow } from "@/lib/authz";
import type { Role } from "@/lib/authz/roles";
import { getStaff } from "@/modules/hr";
import { studentScopeWhere } from "@/modules/stu";
import {
  defaultScope,
  isStaffAccountRole,
  shouldHaveAccess,
  summarize,
  type CohortOutcome,
  type SkipReason,
} from "../domain/account-rules";
import { canDeactivate, canResendActivation, normalizeEmail } from "../domain/rules";
import type { IdentityProviderAdmin } from "./identity-provider";
import * as users from "./user.service";

// IAM-02: the account follows the person (Q-127..Q-130). Everything runs in the action wrapper's
// transaction and reuses the IAM-01 service, so identity-provider compensation is the same.

type Ctx = ActionContext;
const OPEN = ["ACTIVE", "SUSPENDED"] as const;

export const AUTO_DEACTIVATE = "iam.account.auto_deactivate";
export const AUTO_REACTIVATE = "iam.account.auto_reactivate";
const MANUAL_DEACTIVATE = "iam.user.deactivate";

type PersonFacts = { personId: string; email: string | null; firstName: string; lastName: string };
type Assignment = { role: Role; scopeType: ReturnType<typeof defaultScope> };
type Created =
  | { ok: true; userId: string; identity: "created" | "linked" | "adopted" }
  | { ok: false; reason: "hasAccount" | "emailTaken" | "noEmail" | "disabled" };

const refuse = (code: string): never => {
  throw new DomainError("VALIDATION", "Check the account", { account: [code] });
};

/** AC-1..AC-4: creates, links or adopts the login of a person; no writes when it refuses. */
async function createAccountFor(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  person: PersonFacts,
  assignment: Assignment,
  kind: "STUDENT" | "STAFF",
): Promise<Created> {
  if (!person.email) return { ok: false, reason: "noEmail" };
  const email = normalizeEmail(person.email);
  if (await ctx.db.user.findUnique({ where: { personId: person.personId }, select: { id: true } }))
    return { ok: false, reason: "hasAccount" };

  const byEmail = await ctx.db.user.findUnique({
    where: { email },
    include: { roles: { select: { role: true, scopeType: true } } },
  });
  let userId: string;
  let identity: "created" | "linked" | "adopted";
  if (byEmail) {
    // AC-3: a login without a person is adopted; one that belongs to somebody else is not touched.
    if (byEmail.personId) return { ok: false, reason: "emailTaken" };
    if (!byEmail.active) return { ok: false, reason: "disabled" };
    await ctx.db.user.update({ where: { id: byEmail.id }, data: { personId: person.personId } });
    if (
      !byEmail.roles.some((r) => r.role === assignment.role && r.scopeType === assignment.scopeType)
    )
      await users.idpCall(() => assignRoleRow(ctx.db, byEmail.id, assignment, ctx.user.id));
    userId = byEmail.id;
    identity = "adopted";
  } else {
    const created = await users.createUser(ctx, idp, {
      email,
      firstName: person.firstName,
      lastName: person.lastName,
      roles: [assignment],
      linkExisting: true,
    });
    await ctx.db.user.update({
      where: { id: created.userId },
      data: { personId: person.personId },
    });
    userId = created.userId;
    identity = created.identity;
  }
  await ctx.audit({
    action: "iam.account.provision",
    entityType: "User",
    entityId: userId,
    before: null,
    after: { kind, personId: person.personId, role: assignment.role, identity },
  });
  return { ok: true, userId, identity };
}

function unwrap(result: Created) {
  if (result.ok) return result;
  switch (result.reason) {
    case "hasAccount":
      throw new DomainError("CONFLICT", "ACCOUNT_EXISTS");
    case "disabled":
      throw new DomainError("CONFLICT", "ACCOUNT_DISABLED");
    default:
      return refuse(result.reason);
  }
}

// ---- students -----------------------------------------------------------------------------------

async function loadStudent(ctx: Ctx, studentId: string) {
  const student = await ctx.db.student.findFirst({
    where: { AND: [{ id: studentId }, await studentScopeWhere(ctx.user)] },
    select: {
      id: true,
      personId: true,
      person: { select: { firstName: true, lastName: true, email: true, user: true } },
      enrollments: { where: { status: { in: [...OPEN] } }, select: { id: true } },
    },
  });
  if (!student) throw new DomainError("NOT_FOUND", "Student not found");
  return student;
}

type LoadedStudent = Awaited<ReturnType<typeof loadStudent>>;
const studentPerson = (s: LoadedStudent): PersonFacts => ({
  personId: s.personId,
  email: s.person.email,
  firstName: s.person.firstName,
  lastName: s.person.lastName,
});
const STUDENT_ROLE: Assignment = { role: "student", scopeType: "SELF" };

/** AC-1, AC-2, AC-3 */
export async function provisionStudentAccount(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  studentId: string,
) {
  const student = await loadStudent(ctx, studentId);
  if (student.enrollments.length === 0) return refuse("noOpenEnrollment");
  const result = unwrap(
    await createAccountFor(ctx, idp, studentPerson(student), STUDENT_ROLE, "STUDENT"),
  );
  return { userId: result.userId, identity: result.identity };
}

/** AC-9: re-send the activation mail of a student's account that never signed in. */
export async function resendStudentActivation(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  studentId: string,
) {
  const student = await loadStudent(ctx, studentId);
  const user = student.person.user;
  if (!user) throw new DomainError("NOT_FOUND", "The student has no account");
  await users.resendActivation(ctx, idp, user.id);
}

// ---- staff --------------------------------------------------------------------------------------

async function loadStaff(ctx: Ctx, staffId: string) {
  // the staff module owns the scope rule (a head of department sees their department)
  if (!(await getStaff(ctx.user, staffId))) throw new DomainError("NOT_FOUND", "Staff not found");
  const staff = await ctx.db.staff.findUnique({
    where: { id: staffId },
    select: {
      id: true,
      active: true,
      personId: true,
      person: { select: { firstName: true, lastName: true, email: true, user: true } },
    },
  });
  if (!staff) throw new DomainError("NOT_FOUND", "Staff not found");
  return staff;
}

/** AC-4 */
export async function provisionStaffAccount(
  ctx: Ctx,
  idp: IdentityProviderAdmin,
  input: { staffId: string; role: string },
) {
  if (!isStaffAccountRole(input.role))
    throw new DomainError("VALIDATION", "Check the role", { role: ["roleNotAllowed"] });
  const staff = await loadStaff(ctx, input.staffId);
  if (!staff.active) return refuse("notEmployed");
  const person: PersonFacts = {
    personId: staff.personId,
    email: staff.person.email,
    firstName: staff.person.firstName,
    lastName: staff.person.lastName,
  };
  const assignment: Assignment = { role: input.role, scopeType: defaultScope(input.role) };
  const result = unwrap(await createAccountFor(ctx, idp, person, assignment, "STAFF"));
  return { userId: result.userId, identity: result.identity };
}

export async function resendStaffActivation(ctx: Ctx, idp: IdentityProviderAdmin, staffId: string) {
  const staff = await loadStaff(ctx, staffId);
  if (!staff.person.user) throw new DomainError("NOT_FOUND", "The staff member has no account");
  await users.resendActivation(ctx, idp, staff.person.user.id);
}

// ---- cohort (AC-10) -----------------------------------------------------------------------------

export async function provisionCohort(ctx: Ctx, idp: IdentityProviderAdmin, cohortId: string) {
  const cohort = await ctx.db.cohort.findUnique({ where: { id: cohortId }, select: { id: true } });
  if (!cohort) throw new DomainError("NOT_FOUND", "Cohort not found");
  const students = await ctx.db.student.findMany({
    where: {
      AND: [
        await studentScopeWhere(ctx.user),
        { enrollments: { some: { cohortId, status: { in: [...OPEN] } } } },
      ],
    },
    orderBy: { studentNumber: "asc" },
    select: { id: true },
  });

  const outcomes: CohortOutcome[] = [];
  for (const { id } of students) {
    const student = await loadStudent(ctx, id);
    const user = student.person.user;
    if (user) {
      if (canResendActivation(user)) {
        await users.resendActivation(ctx, idp, user.id);
        outcomes.push({ studentId: id, result: "reminded" });
      } else outcomes.push({ studentId: id, result: "skipped", reason: "hasAccount" });
      continue;
    }
    // Skips are decided before any write; every other failure (identity provider down) aborts.
    const created = await createAccountFor(
      ctx,
      idp,
      studentPerson(student),
      STUDENT_ROLE,
      "STUDENT",
    );
    if (created.ok) outcomes.push({ studentId: id, result: "created" });
    else {
      const reason: SkipReason = created.reason === "disabled" ? "emailTaken" : created.reason;
      outcomes.push({ studentId: id, result: "skipped", reason });
    }
  }
  const summary = summarize(outcomes);
  await ctx.audit({
    action: "iam.account.provision_cohort",
    entityType: "Cohort",
    entityId: cohortId,
    before: null,
    after: { created: summary.created, reminded: summary.reminded, skipped: summary.skipped },
  });
  return summary;
}

// ---- lifecycle sync (AC-5..AC-8) ----------------------------------------------------------------

const AUTO_REASON = "Automatic: the person has no open enrollment or active employment";
const AUTO_BACK = "Automatic: the person has an open enrollment or active employment again";

/** AC-7: only an account that the system itself switched off is switched back on. */
async function switchedOffBySystem(ctx: Ctx, userId: string): Promise<boolean> {
  const last = await ctx.db.auditLog.findFirst({
    where: {
      entityType: "User",
      entityId: userId,
      action: { in: [AUTO_DEACTIVATE, MANUAL_DEACTIVATE] },
    },
    orderBy: { at: "desc" },
    select: { action: true },
  });
  return last?.action === AUTO_DEACTIVATE;
}

/**
 * Brings the account of a person in line with their enrollments and employment. Called inside the
 * transaction of the change that may have ended or started access.
 */
export async function syncAccountAccess(ctx: Ctx, idp: IdentityProviderAdmin, personId: string) {
  const user = await ctx.db.user.findUnique({ where: { personId } });
  if (!user) return;
  const [openEnrollments, staff] = await Promise.all([
    ctx.db.enrollment.count({ where: { student: { personId }, status: { in: [...OPEN] } } }),
    ctx.db.staff.findFirst({ where: { personId, active: true }, select: { id: true } }),
  ]);
  const wanted = shouldHaveAccess({ openEnrollments, activeStaff: !!staff });

  if (wanted && !user.active) {
    if (await switchedOffBySystem(ctx, user.id))
      await users.reactivateUser({ ...ctx, reason: AUTO_BACK }, idp, user.id, AUTO_REACTIVATE);
    return;
  }
  if (wanted || !user.active) return;

  const rule = canDeactivate({
    actorId: ctx.user.id,
    targetId: user.id,
    ...(await users.sysadminFacts(ctx.db, user.id)),
  });
  if (!rule.ok) {
    // AC-8: the change itself goes ahead; the account stays and the skip is on record.
    await ctx.audit({
      action: "iam.account.sync_skipped",
      entityType: "User",
      entityId: user.id,
      before: null,
      after: { wanted: false, skipped: rule.reason },
    });
    return;
  }
  await users.deactivateUser({ ...ctx, reason: AUTO_REASON }, idp, user.id, AUTO_DEACTIVATE);
}
