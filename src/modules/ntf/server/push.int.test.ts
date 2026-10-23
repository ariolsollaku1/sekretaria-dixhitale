import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import "@/modules/ntf";
import { pushDueAnnouncements } from "./push";

const past = new Date("2020-01-01T00:00:00Z");
const ann = (over: Record<string, unknown> = {}) =>
  db.announcement.create({
    data: {
      title: "Leksion i hapur",
      body: "b",
      status: "PUBLISHED",
      publishAt: past,
      emailPush: true,
      ...over,
    },
  });
async function user(id: string, role: "lecturer" | "student" | "sysadmin", active = true) {
  await db.user.create({ data: { id, email: `${id}@t.test`, name: id, active } });
  await db.userRole.create({
    data: { userId: id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
  });
}

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "email_outbox", "notifications", "notification_preferences", "announcements", "user_roles" CASCADE',
  );
  await db.user.deleteMany();
  await user("lec", "lecturer");
  await user("stu", "student");
  await user("gone", "lecturer", false);
});

const recipients = async () =>
  (await db.notification.findMany({ select: { userId: true } })).map((n) => n.userId).sort();

describe("pushDueAnnouncements (AC-7, AC-8)", () => {
  it("notifies the audience once, with e-mail, and marks the announcement pushed", async () => {
    const a = await ann({ audience: "ALL" });
    expect(await pushDueAnnouncements()).toBe(1);
    expect(await recipients()).toEqual(["lec", "stu"]); // inactive users are skipped
    expect(await db.emailOutbox.count()).toBe(2);
    expect(
      (await db.announcement.findUniqueOrThrow({ where: { id: a.id } })).pushedAt,
    ).not.toBeNull();
    expect(await db.notification.findFirstOrThrow({ where: { userId: "lec" } })).toMatchObject({
      type: "ntf.announcement",
      link: `/announcements/${a.id}`,
      dedupeKey: `announcement:${a.id}`,
    });

    // a second run does nothing
    expect(await pushDueAnnouncements()).toBe(0);
    expect(await db.notification.count()).toBe(2);
  });

  it("cannot double-notify after a crash before pushedAt was set", async () => {
    const a = await ann({ audience: "ALL" });
    await pushDueAnnouncements();
    await db.announcement.update({ where: { id: a.id }, data: { pushedAt: null } });
    await pushDueAnnouncements();
    expect(await db.notification.count()).toBe(2);
    expect(await db.emailOutbox.count()).toBe(2);
  });

  it("limits STAFF and STUDENTS to their people", async () => {
    await ann({ audience: "STAFF", title: "S" });
    await pushDueAnnouncements();
    expect(await recipients()).toEqual(["lec"]);
    await db.notification.deleteMany();
    await ann({ audience: "STUDENTS", title: "T" });
    await pushDueAnnouncements();
    expect(await recipients()).toEqual(["stu"]);
  });

  it("waits for a future publish time and skips drafts, archived, expired and no-push notices", async () => {
    await ann({ publishAt: new Date("2099-01-01T00:00:00Z") });
    await ann({ status: "DRAFT" });
    await ann({ status: "ARCHIVED" });
    await ann({ expiresAt: new Date("2020-06-01T00:00:00Z") });
    await ann({ emailPush: false });
    expect(await pushDueAnnouncements()).toBe(0);
    expect(await db.notification.count()).toBe(0);
    // ...and fires once the time has come
    expect(await pushDueAnnouncements(new Date("2099-01-02T00:00:00Z"))).toBe(1);
  });

  it("respects a recipient's opt-out for e-mail but still notifies in-app", async () => {
    await db.notificationPreference.create({
      data: { userId: "lec", type: "ntf.announcement", email: false },
    });
    await ann();
    await pushDueAnnouncements();
    expect(await recipients()).toEqual(["lec", "stu"]);
    expect((await db.emailOutbox.findMany()).map((o) => o.userId)).toEqual(["stu"]);
  });
});
