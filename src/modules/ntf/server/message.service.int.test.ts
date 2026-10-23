import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "@/modules/ntf";
import { sendPendingMessages } from "./message.job";
import * as svc from "./message.service";

// A small stand-in list: the persons whose last name contains the `name` filter.
registerTable(
  defineTable<{ id: string; personId: string }>({
    id: "test.people",
    permission: "ntf.announcement.read",
    exportName: "people",
    rowKey: (r) => r.id,
    recipient: (r) => r.personId,
    columns: [{ key: "id", labelKey: "x", type: "text", sortable: true }],
    filters: [{ key: "name", labelKey: "x", type: "text" }],
    defaultSort: { key: "id", dir: "asc" },
    values: { id: (r) => r.id },
    async fetch(params) {
      const where = { lastName: { contains: params.filters.name ?? "" } };
      const [total, rows] = await Promise.all([
        db.person.count({ where }),
        db.person.findMany({ where, orderBy: { id: "asc" }, take: params.pageSize }),
      ]);
      return { total, rows: rows.map((p) => ({ id: p.id, personId: p.id })) };
    },
  }),
);

const actor = { id: "sender", email: "s@t.test", name: "S", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>, user = actor): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => user,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "ntf.message.send",
    input: z.object({}).passthrough(),
    handler: (_i, ctx) => fn(ctx),
  })({} as never);
}

async function person(id: string, lastName: string, withAccount = true) {
  await db.person.create({
    data: {
      id,
      firstName: `F${id}`,
      lastName,
      gender: "FEMALE",
      birthDate: new Date("2000-01-01"),
    },
  });
  if (withAccount)
    await db.user.create({
      data: { id: `u-${id}`, email: `${id}@t.test`, name: id, personId: id },
    });
}

const content = { subject: "Seancë {firstName}", body: "Përshëndetje {fullName}, ejani." };
const send = async (over: Partial<Parameters<typeof svc.sendMessage>[1]> = {}) => {
  const r = await run((ctx) =>
    svc.sendMessage(ctx, { tableId: "test.people", filters: {}, ...content, ...over }),
  );
  return r;
};

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "message_recipients", "messages", "message_templates", "email_outbox", "notifications", "notification_preferences", "user_roles", "persons" CASCADE',
  );
  await db.user.deleteMany();
  // the sender needs to read the source list
  await db.user.create({ data: { id: "sender", email: "sender@t.test", name: "Sender" } });
  await db.userRole.create({
    data: { userId: "sender", role: "secretary", scopeType: "INSTITUTION" },
  });
  await person("p1", "Hoxha");
  await person("p2", "Hoxha");
  await person("p3", "Hoxha", false);
  await person("p4", "Gjika");
});

describe("sendMessage (AC-2, AC-5, AC-10)", () => {
  it("stores the message, a delivery row per person and an audit entry", async () => {
    const r = await send({ filters: { name: "Hoxha" } });
    expect(r.ok && r.data).toMatchObject({ recipientCount: 3, noAccountCount: 1 });
    const message = await db.message.findFirstOrThrow({ include: { recipients: true } });
    expect(message).toMatchObject({
      status: "PENDING",
      sourceTable: "test.people",
      filters: { name: "Hoxha" },
      createdById: "sender",
    });
    expect(message.recipients.map((x) => [x.personId, x.state]).sort()).toEqual([
      ["p1", "QUEUED"],
      ["p2", "QUEUED"],
      ["p3", "NO_ACCOUNT"],
    ]);
    const audit = await db.auditLog.findFirstOrThrow({ where: { action: "ntf.message.send" } });
    expect(audit.after).toMatchObject({ recipientCount: 3, sourceTable: "test.people" });
    expect(JSON.stringify(audit)).not.toContain("@t.test");
  });

  it("refuses unknown lists, tables without recipients, empty lists and users who cannot read the list", async () => {
    const unknown = await send({ tableId: "nope.nothing" });
    expect(!unknown.ok && unknown.error.code).toBe("NOT_FOUND");
    const empty = await send({ filters: { name: "Zzz" } });
    expect(!empty.ok && empty.error.fieldErrors).toEqual({ recipients: ["noRecipients"] });

    await db.user.create({ data: { id: "nobody", email: "n@t.test", name: "N" } });
    const denied = await run(
      (ctx) => svc.sendMessage(ctx, { tableId: "test.people", filters: {}, ...content }),
      { ...actor, id: "nobody" },
    );
    expect(!denied.ok && denied.error.code).toBe("FORBIDDEN");
    expect(await db.message.count()).toBe(0);
  });

  it("marks a message with nobody to reach as sent at once", async () => {
    await db.user.deleteMany({ where: { personId: { in: ["p1", "p2"] } } });
    await send({ filters: { name: "Hoxha" } });
    expect(await db.message.findFirstOrThrow()).toMatchObject({
      status: "SENT",
      recipientCount: 3,
      noAccountCount: 3,
    });
  });
});

describe("sendPendingMessages (AC-3, AC-6, AC-7)", () => {
  it("notifies each account once with the placeholders filled, logs the e-mail, and completes", async () => {
    await send({ filters: { name: "Hoxha" } });
    expect(await sendPendingMessages()).toBe(1);

    const n = await db.notification.findMany({ orderBy: { userId: "asc" } });
    expect(n.map((x) => x.userId)).toEqual(["u-p1", "u-p2"]);
    expect(n[0]).toMatchObject({
      type: "ntf.message",
      title: "Seancë Fp1",
      body: "Përshëndetje Fp1 Hoxha, ejani.",
      link: "/notifications",
    });
    const mail = await db.emailOutbox.findFirstOrThrow({ where: { userId: "u-p1" } });
    expect(mail.subject).toBe("Seancë Fp1");
    expect(mail.text).toContain("Përshëndetje Fp1 Hoxha, ejani.");

    const rows = await db.messageRecipient.findMany({ orderBy: { personId: "asc" } });
    expect(rows.map((r) => r.state)).toEqual(["DELIVERED", "DELIVERED", "NO_ACCOUNT"]);
    expect(rows[0]!.notificationId).toBe(n[0]!.id);
    expect(rows[0]!.emailOutboxId).toBe(mail.id);
    expect(await db.message.findFirstOrThrow()).toMatchObject({ status: "SENT" });
    expect((await db.message.findFirstOrThrow()).completedAt).not.toBeNull();

    // a second run does nothing
    expect(await sendPendingMessages()).toBe(0);
    expect(await db.notification.count()).toBe(2);
  });

  it("does not double-notify after a crash that left the rows queued", async () => {
    await send({ filters: { name: "Hoxha" } });
    await sendPendingMessages();
    const m = await db.message.findFirstOrThrow();
    // simulate: notifications exist, rows and message not updated
    await db.messageRecipient.updateMany({
      where: { state: "DELIVERED" },
      data: { state: "QUEUED" },
    });
    await db.message.update({
      where: { id: m.id },
      data: { status: "PENDING", completedAt: null },
    });
    await sendPendingMessages();
    expect(await db.notification.count()).toBe(2);
    expect(await db.message.findFirstOrThrow()).toMatchObject({ status: "SENT" });
  });

  it("works in batches larger than 200", async () => {
    const extra = Array.from({ length: 205 }, (_, i) => `b${i}`);
    for (const id of extra) await person(id, "Batch");
    await send({ filters: { name: "Batch" } });
    await sendPendingMessages();
    expect(await db.messageRecipient.count({ where: { state: "DELIVERED" } })).toBe(205);
    expect(await db.notification.count()).toBe(205);
  });

  it("skips the e-mail when the recipient switched it off but still notifies in the app", async () => {
    await db.notificationPreference.create({
      data: { userId: "u-p1", type: "ntf.message", email: false },
    });
    await send({ filters: { name: "Hoxha" } });
    await sendPendingMessages();
    expect(await db.notification.count({ where: { userId: "u-p1" } })).toBe(1);
    expect(await db.emailOutbox.count({ where: { userId: "u-p1" } })).toBe(0);
    expect(
      (await db.messageRecipient.findFirstOrThrow({ where: { personId: "p1" } })).emailOutboxId,
    ).toBeNull();
  });
});

describe("templates (AC-4, AC-10)", () => {
  it("creates and archives with audit, never deleting", async () => {
    const created = await run((ctx) =>
      svc.createTemplate(ctx, { name: "Kujtesë seance", ...content }),
    );
    if (!created.ok) throw new Error("create failed");
    const id = created.data.templateId;
    expect((await run((ctx) => svc.archiveTemplate(ctx, id))).ok).toBe(true);
    expect(
      (await db.messageTemplate.findUniqueOrThrow({ where: { id } })).archivedAt,
    ).not.toBeNull();
    const again = await run((ctx) => svc.archiveTemplate(ctx, id));
    expect(!again.ok && again.error.code).toBe("NOT_FOUND");
    expect(
      (await db.auditLog.findMany({ where: { action: { startsWith: "ntf.template." } } }))
        .map((a) => a.action)
        .sort(),
    ).toEqual(["ntf.template.archive", "ntf.template.create"]);
  });
});
