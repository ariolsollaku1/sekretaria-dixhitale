import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { linkAccountByEmail, personsUsing } from "@/lib/people";
import type { StaffInput } from "../domain/schemas";
import { fullView, getStaffRow, type StaffView } from "./staff.queries";

type Ctx = ActionContext;
const date = (day: string) => new Date(`${day}T00:00:00Z`);

/** Flat shape for audit diffs; sensitive values are masked by the audit layer (AC-6). */
const snapshot = (v: Omit<StaffView, "id" | "personId" | "departmentName">) => ({ ...v });
const fromInput = (i: StaffInput, active: boolean) =>
  snapshot({
    firstName: i.firstName,
    lastName: i.lastName,
    fatherName: i.fatherName,
    gender: i.gender,
    birthDate: i.birthDate,
    nationalId: i.nationalId,
    address: i.address,
    phone: i.phone,
    email: i.email,
    kind: i.kind,
    category: i.category,
    degree: i.degree,
    title: i.title,
    departmentId: i.departmentId,
    retired: i.retired,
    primaryEmployer: i.primaryEmployer,
    contractStart: i.contractStart,
    contractEnd: i.contractEnd,
    active,
  });

async function checkDepartment(ctx: Ctx, departmentId: string | null) {
  if (!departmentId) return;
  const d = await ctx.db.department.findFirst({
    where: { id: departmentId, active: true },
    select: { id: true },
  });
  if (!d)
    throw new DomainError("VALIDATION", "Check the department", {
      departmentId: ["unknownDepartment"],
    });
}

const fail = (field: string, code: string): never => {
  throw new DomainError("VALIDATION", "Check the fields", { [field]: [code] });
};

/** AC-1..AC-5 */
export async function createStaff(ctx: Ctx, input: StaffInput) {
  await checkDepartment(ctx, input.departmentId);
  const matches = await personsUsing(ctx.db, input);
  let personId: string;

  if (matches.length > 1) {
    return fail(
      matches[0]!.nationalId === input.nationalId ? "nationalId" : "email",
      "personConflict",
    );
  } else if (matches.length === 1) {
    const person = matches[0]!;
    // AC-3: a person with a staff record is a duplicate; one without (e.g. a student) is attached
    if (person.staff)
      return fail(
        person.nationalId === input.nationalId && input.nationalId ? "nationalId" : "email",
        "alreadyStaff",
      );
    personId = person.id;
  } else {
    const person = await ctx.db.person.create({
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
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    personId = person.id;
  }

  const staff = await ctx.db.staff.create({
    data: {
      personId,
      kind: input.kind,
      category: input.category,
      degree: input.degree,
      title: input.title,
      departmentId: input.departmentId,
      retired: input.retired,
      primaryEmployer: input.primaryEmployer,
      contractStart: date(input.contractStart),
      contractEnd: input.contractEnd ? date(input.contractEnd) : null,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });

  // AC-5: a login account with the same e-mail and no person yet becomes this person's account.
  await linkAccountByEmail(ctx.db, input.email, personId);

  await ctx.audit({
    action: "hr.staff.create",
    entityType: "Staff",
    entityId: staff.id,
    before: null,
    after: fromInput(input, true),
  });
  return { staffId: staff.id };
}

export async function updateStaff(ctx: Ctx, staffId: string, input: StaffInput) {
  const row = await getStaffRow(staffId, ctx.db);
  if (!row) throw new DomainError("NOT_FOUND", "Staff member not found");
  const before = fullView(row);
  await checkDepartment(ctx, input.departmentId);
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
      updatedById: ctx.user.id,
    },
  });
  await ctx.db.staff.update({
    where: { id: staffId },
    data: {
      kind: input.kind,
      category: input.category,
      degree: input.degree,
      title: input.title,
      departmentId: input.departmentId,
      retired: input.retired,
      primaryEmployer: input.primaryEmployer,
      contractStart: date(input.contractStart),
      contractEnd: input.contractEnd ? date(input.contractEnd) : null,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "hr.staff.update",
    entityType: "Staff",
    entityId: staffId,
    before: snapshot(stripIds(before)),
    after: fromInput(input, before.active),
  });
  return { staffId };
}

const stripIds = ({ id: _id, personId: _p, departmentName: _d, ...rest }: StaffView) => {
  void _id;
  void _p;
  void _d;
  return rest;
};

/** AC-7: ends or resumes employment; the record stays. */
export async function setStaffActive(ctx: Ctx, staffId: string, active: boolean) {
  const row = await getStaffRow(staffId, ctx.db);
  if (!row) throw new DomainError("NOT_FOUND", "Staff member not found");
  if (row.active === active)
    throw new DomainError("CONFLICT", active ? "ALREADY_ACTIVE" : "ALREADY_INACTIVE");
  await ctx.db.staff.update({ where: { id: staffId }, data: { active, updatedById: ctx.user.id } });
  await ctx.audit({
    action: active ? "hr.staff.reactivate" : "hr.staff.deactivate",
    entityType: "Staff",
    entityId: staffId,
    before: { active: row.active },
    after: { active },
    reason: ctx.reason,
  });
  return { staffId };
}
