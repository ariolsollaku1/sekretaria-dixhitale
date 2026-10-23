import { beforeEach, describe, expect, it } from "vitest";
import { db, withTransaction } from "@/lib/db";
import {
  AssignmentError,
  assertCan,
  assignRole,
  can,
  grantScopes,
  permissionsFor,
  revokeRole,
} from "./index";
import { registerPermissions, registerScopeResolver, registerTargetResolver } from "./registry";
import { ForbiddenError } from "./check";
import { PLATFORM_PERMISSIONS } from "./permissions";

async function makeUser(email: string, active = true) {
  return db.user.create({ data: { email, name: email, active } });
}

beforeEach(async () => {
  await db.userRole.deleteMany();
  await db.user.deleteMany();
});

describe("platform permissions (AC-11)", () => {
  it("are granted to sysadmin only", async () => {
    const admin = await makeUser("admin@t.test");
    const sec = await makeUser("sec@t.test");
    await withTransaction(async (tx) => {
      await assignRole(tx, admin.id, { role: "sysadmin", scopeType: "INSTITUTION" });
      await assignRole(tx, sec.id, { role: "secretary", scopeType: "INSTITUTION" });
    });
    // plt.view.save is the exception: every role holds it (PLT-10).
    const everyRole = ["plt.view.save", "plt.notification.use"];
    const sysadminOnly = PLATFORM_PERMISSIONS.filter((p) => !everyRole.includes(p));
    for (const p of sysadminOnly) {
      expect(await can(admin, p)).toBe(true);
      expect(await can(sec, p)).toBe(false);
    }
    for (const p of everyRole) expect(await can(sec, p)).toBe(true);
    expect(await permissionsFor(admin)).toEqual([...PLATFORM_PERMISSIONS].sort());
    expect(await permissionsFor(sec)).toEqual(["plt.notification.use", "plt.view.save"]);
  });
});

describe("role changes apply on the next request (AC-8)", () => {
  it("revoking a role removes access; deactivating the user does too (AC-4)", async () => {
    const user = await makeUser("a@t.test");
    const row = await withTransaction((tx) =>
      assignRole(tx, user.id, { role: "sysadmin", scopeType: "INSTITUTION" }),
    );
    expect(await can(user, "iam.user.read")).toBe(true);

    await withTransaction((tx) => revokeRole(tx, row.id));
    expect(await can(user, "iam.user.read")).toBe(false);

    await withTransaction((tx) =>
      assignRole(tx, user.id, { role: "sysadmin", scopeType: "INSTITUTION" }),
    );
    expect(await can(user, "iam.user.read")).toBe(true);
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await can(user, "iam.user.read")).toBe(false);
  });

  it("a validity window in the past grants nothing", async () => {
    const user = await makeUser("w@t.test");
    await withTransaction((tx) =>
      assignRole(tx, user.id, {
        role: "sysadmin",
        scopeType: "INSTITUTION",
        validFrom: new Date("2020-01-01T00:00:00Z"),
        validTo: new Date("2020-02-01T00:00:00Z"),
      }),
    );
    expect(await can(user, "iam.user.read")).toBe(false);
  });

  it("an unknown user can do nothing", async () => {
    expect(await can({ id: "nobody" }, "iam.user.read")).toBe(false);
    expect(await grantScopes({ id: "nobody" }, "iam.user.read")).toMatchObject({
      institution: false,
    });
    expect(await permissionsFor({ id: "nobody" })).toEqual([]);
  });
});

describe("assigning roles (AC-2, AC-9)", () => {
  it("allows several assignments per user and rejects exact duplicates, also for NULL scope ids", async () => {
    const user = await makeUser("m@t.test");
    await withTransaction(async (tx) => {
      await assignRole(tx, user.id, { role: "secretary", scopeType: "INSTITUTION" });
      await assignRole(tx, user.id, { role: "hr", scopeType: "INSTITUTION" });
    });
    await expect(
      withTransaction((tx) => assignRole(tx, user.id, { role: "hr", scopeType: "INSTITUTION" })),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    expect(await db.userRole.count({ where: { userId: user.id } })).toBe(2);
  });

  it("rejects an id scope without a registered resolver, and an unknown id", async () => {
    const user = await makeUser("d@t.test");
    await expect(
      withTransaction((tx) =>
        assignRole(tx, user.id, {
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: "d1",
        }),
      ),
    ).rejects.toMatchObject({ code: "NO_RESOLVER" });

    registerScopeResolver("DEPARTMENT", {
      exists: async (id) => id === "d1",
      ancestors: async () => ({ facultyId: "fa" }),
    });
    await expect(
      withTransaction((tx) =>
        assignRole(tx, user.id, {
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: "nope",
        }),
      ),
    ).rejects.toBeInstanceOf(AssignmentError);
    await expect(
      withTransaction((tx) =>
        assignRole(tx, user.id, {
          role: "head_of_department",
          scopeType: "DEPARTMENT",
          scopeId: "nope",
        }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_NOT_FOUND" });
    await withTransaction((tx) =>
      assignRole(tx, user.id, {
        role: "head_of_department",
        scopeType: "DEPARTMENT",
        scopeId: "d1",
      }),
    );
    expect(await db.userRole.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rejects a malformed shape before touching the database", async () => {
    const user = await makeUser("s@t.test");
    await expect(
      withTransaction((tx) =>
        assignRole(tx, user.id, { role: "student", scopeType: "INSTITUTION" }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_NOT_ALLOWED" });
  });
});

describe("scoped checks with registered resolvers (AC-3, AC-5, AC-7)", () => {
  beforeEach(() => {
    registerPermissions("stu", {
      permissions: ["stu.student.read"],
      grants: { secretary: ["stu.student.read"], student: ["stu.student.read"] },
    });
    registerScopeResolver("FACULTY", {
      exists: async (id) => ["fa", "fb"].includes(id),
      ancestors: async () => ({}),
    });
    registerScopeResolver("PROGRAM", {
      exists: async () => true,
      ancestors: async (id) =>
        id === "p1"
          ? { departmentId: "d1", facultyId: "fa" }
          : { departmentId: "d2", facultyId: "fb" },
    });
    registerTargetResolver("student", async (id) =>
      id === "s-fa"
        ? { programId: "p1", ownerUserIds: ["student-user"] }
        : id === "s-fb"
          ? { programId: "p2" }
          : null,
    );
  });

  it("a faculty-scoped secretary sees faculty A's students, not B's, and unknown targets are denied", async () => {
    const sec = await makeUser("fac@t.test");
    await withTransaction((tx) =>
      assignRole(tx, sec.id, { role: "secretary", scopeType: "FACULTY", scopeId: "fa" }),
    );
    expect(await can(sec, "stu.student.read", { kind: "student", id: "s-fa" })).toBe(true);
    expect(await can(sec, "stu.student.read", { kind: "student", id: "s-fb" })).toBe(false);
    expect(await can(sec, "stu.student.read", { kind: "student", id: "missing" })).toBe(false);
    expect(await can(sec, "stu.student.read", { kind: "unregistered-kind", id: "x" })).toBe(false);
    expect(await can(sec, "stu.student.read")).toBe(true); // no target: lists use grantScopes
    expect(await grantScopes(sec, "stu.student.read")).toEqual({
      institution: false,
      facultyIds: ["fa"],
      departmentIds: [],
      programIds: [],
      self: false,
    });
  });

  it("SELF scope only matches the owner", async () => {
    const student = await db.user.create({
      data: { id: "student-user", email: "st@t.test", name: "St" },
    });
    await withTransaction((tx) =>
      assignRole(tx, student.id, { role: "student", scopeType: "SELF" }),
    );
    expect(await can(student, "stu.student.read", { kind: "student", id: "s-fa" })).toBe(true);
    expect(await can(student, "stu.student.read", { kind: "student", id: "s-fb" })).toBe(false);
  });
});

describe("assertCan (AC-6)", () => {
  it("throws ForbiddenError without the permission", async () => {
    const user = await makeUser("n@t.test");
    await expect(assertCan(user, "iam.user.read")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
