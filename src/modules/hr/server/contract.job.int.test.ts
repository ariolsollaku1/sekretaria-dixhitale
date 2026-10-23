import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import "@/modules/hr";
import { notifyContractExpiry } from "./contract.job";

const now = new Date("2026-10-26T06:00:00Z"); // Monday of ISO week 44
let n = 0;
async function staff(contractEnd: string | null, over: Record<string, unknown> = {}) {
  n += 1;
  const p = await db.person.create({
    data: {
      firstName: `P${n}`,
      lastName: "L",
      gender: "MALE",
      birthDate: new Date("1980-01-01T00:00:00Z"),
    },
  });
  return db.staff.create({
    data: {
      personId: p.id,
      kind: "ACADEMIC",
      category: "PAE",
      contractStart: new Date("2020-01-01T00:00:00Z"),
      contractEnd: contractEnd ? new Date(`${contractEnd}T00:00:00Z`) : null,
      ...over,
    },
  });
}
async function hrUser(id: string, active = true) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, active } });
  await db.userRole.create({ data: { userId: id, role: "hr", scopeType: "INSTITUTION" } });
}

beforeEach(async () => {
  n = 0;
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "notifications", "email_outbox", "staff", "user_roles", "system_settings" CASCADE',
  );
  await db.user.deleteMany();
  await db.person.deleteMany();
  await hrUser("hr1");
  await hrUser("hr2");
  await hrUser("hr-gone", false);
});

describe("notifyContractExpiry (AC-4, AC-5)", () => {
  it("tells every active HR user once per week with the counts, and leaves staff untouched", async () => {
    await staff("2026-10-01"); // ended
    await staff("2026-11-15"); // ending soon (within 60 days)
    await staff("2027-06-01"); // far away
    await staff(null); // open-ended
    await staff("2026-09-01", { active: false }); // no longer employed
    await staff("2026-10-01", { kind: "ADMINISTRATIVE" }); // not academic
    const before = await db.staff.findMany({ orderBy: { createdAt: "asc" } });

    const r = await notifyContractExpiry(now);
    expect(r).toEqual({ ended: 1, soon: 1, notified: 2 });
    const notes = await db.notification.findMany({ orderBy: { userId: "asc" } });
    expect(notes.map((x) => x.userId)).toEqual(["hr1", "hr2"]);
    expect(notes[0]).toMatchObject({ type: "hr.contracts", link: "/hr/contracts" });
    expect(notes[0]!.body).toContain("1");
    expect(await db.staff.findMany({ orderBy: { createdAt: "asc" } })).toEqual(before);

    // a second run in the same week sends nothing; the next week sends again
    expect(await notifyContractExpiry(new Date("2026-10-28T06:00:00Z"))).toMatchObject({
      notified: 0,
    });
    expect(await notifyContractExpiry(new Date("2026-11-02T06:00:00Z"))).toMatchObject({
      notified: 2,
    });
    expect(await db.notification.count()).toBe(4);
  });

  it("does nothing when no contract is due, and respects the configured horizon", async () => {
    await staff("2027-06-01");
    expect(await notifyContractExpiry(now)).toEqual({ ended: 0, soon: 0, notified: 0 });
    expect(await db.notification.count()).toBe(0);
    await db.systemSetting.create({ data: { key: "hr.contractHorizonDays", value: 365 } });
    expect(await notifyContractExpiry(now)).toMatchObject({ soon: 1, notified: 2 });
  });
});
