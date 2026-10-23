import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, withTransaction } from "@/lib/db";
import { MailError, type MailMessage, type MailTransport } from "@/lib/mail";
import { flushStaleOutbox, sendOutboxMessage } from "./jobs";
import { notify } from "./notify";
import { registerNotificationType } from "./types";

let userId: string;
const hooks: (() => Promise<void>)[] = [];
const ctxFor = (tx: Parameters<Parameters<typeof withTransaction>[0]>[0]) => ({
  db: tx,
  afterCommit: (fn: () => Promise<void>) => void hooks.push(fn),
});

async function makeUser(over: { email?: string; locale?: string | null; active?: boolean } = {}) {
  return db.user.create({
    data: {
      email: over.email ?? `u${Math.random().toString(36).slice(2, 7)}@t.test`,
      name: "Ana Hoxha",
      locale: over.locale ?? null,
      active: over.active ?? true,
    },
  });
}

beforeEach(async () => {
  hooks.length = 0;
  registerNotificationType({ type: "plt.test" });
  registerNotificationType({ type: "fin.mandatory", mandatory: true });
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "notifications", "email_outbox", "notification_preferences", "user_roles" CASCADE',
  );
  await db.user.deleteMany();
  userId = (await makeUser({ email: "ana@t.test" })).id;
});

describe("notify (AC-2, AC-3, AC-4)", () => {
  it("creates the notification and the outbox row in the caller's transaction, rendered in the recipient's locale", async () => {
    await db.user.update({ where: { id: userId }, data: { locale: "en" } });
    const result = await withTransaction((tx) =>
      notify(ctxFor(tx), {
        userId,
        type: "plt.test",
        params: { name: "LOGOS" },
        link: "/notifications",
      }),
    );
    expect(result).toMatchObject({ emailQueued: true });
    const n = await db.notification.findFirstOrThrow();
    expect(n).toMatchObject({
      userId,
      type: "plt.test",
      title: "Test notification",
      link: "/notifications",
      readAt: null,
    });
    expect(n.body).toBe(
      "This is a test notification from LOGOS. If you can see it, notifications work.",
    );
    const mail = await db.emailOutbox.findFirstOrThrow();
    expect(mail).toMatchObject({
      toAddress: "ana@t.test",
      status: "QUEUED",
      subject: "Test message from the Digital Secretariat",
      userId,
    });
    expect(mail.text).toContain("Hello LOGOS,");
    expect(mail.html).toContain("/notifications");
    expect(hooks).toHaveLength(1);
  });

  it("falls back to the default locale (sq) when the user has none", async () => {
    await withTransaction((tx) =>
      notify(ctxFor(tx), { userId, type: "plt.test", params: { name: "LOGOS" } }),
    );
    expect((await db.notification.findFirstOrThrow()).title).toBe("Njoftim provë");
  });

  it("a rolled-back caller leaves no notification and no e-mail", async () => {
    await expect(
      withTransaction(async (tx) => {
        await notify(ctxFor(tx), { userId, type: "plt.test", params: { name: "x" } });
        throw new Error("business change failed");
      }),
    ).rejects.toThrow("business change failed");
    expect(await db.notification.count()).toBe(0);
    expect(await db.emailOutbox.count()).toBe(0);
  });

  it("respects optional opt-outs, but not for mandatory types", async () => {
    await db.notificationPreference.create({ data: { userId, type: "plt.test", email: false } });
    await db.notificationPreference.create({
      data: { userId, type: "fin.mandatory", email: false },
    });
    expect(
      await withTransaction((tx) =>
        notify(ctxFor(tx), { userId, type: "plt.test", params: { name: "x" } }),
      ),
    ).toMatchObject({ emailQueued: false });
    expect(await db.emailOutbox.count()).toBe(0);
    expect(await db.notification.count()).toBe(1); // in-app still arrives
  });

  it("sends only in-app to inactive users and refuses unknown types", async () => {
    const off = await makeUser({ active: false });
    expect(
      await withTransaction((tx) =>
        notify(ctxFor(tx), { userId: off.id, type: "plt.test", params: { name: "x" } }),
      ),
    ).toMatchObject({ emailQueued: false });
    expect(await db.notification.count({ where: { userId: off.id } })).toBe(1);
    await expect(
      withTransaction((tx) => notify(ctxFor(tx), { userId, type: "nope.type", params: {} })),
    ).rejects.toThrow(/Unknown notification type/);
  });

  it("ignores unknown users and drops unsafe links", async () => {
    expect(
      await withTransaction((tx) =>
        notify(ctxFor(tx), { userId: "ghost", type: "plt.test", params: { name: "x" } }),
      ),
    ).toEqual({ notificationId: null, emailQueued: false });
    await withTransaction((tx) =>
      notify(ctxFor(tx), {
        userId,
        type: "plt.test",
        params: { name: "x" },
        link: "https://evil.test",
      }),
    );
    expect((await db.notification.findFirstOrThrow()).link).toBeNull();
  });

  it("a repeated dedupeKey creates one notification and one e-mail", async () => {
    const send = () =>
      withTransaction((tx) =>
        notify(ctxFor(tx), {
          userId,
          type: "plt.test",
          params: { name: "x" },
          dedupeKey: "reminder:42",
        }),
      );
    expect(await send()).toMatchObject({ emailQueued: true });
    expect(await send()).toEqual({ notificationId: null, emailQueued: false });
    expect(await db.notification.count()).toBe(1);
    expect(await db.emailOutbox.count()).toBe(1);
    // without a key every call is a new notification
    await withTransaction((tx) =>
      notify(ctxFor(tx), { userId, type: "plt.test", params: { name: "x" } }),
    );
    await withTransaction((tx) =>
      notify(ctxFor(tx), { userId, type: "plt.test", params: { name: "x" } }),
    );
    expect(await db.notification.count()).toBe(3);
  });
});

function fakeTransport(plan: (MailError | "ok")[]) {
  const sent: MailMessage[] = [];
  const transport: MailTransport = {
    async send(message) {
      const next = plan.shift() ?? "ok";
      if (next !== "ok") throw next;
      sent.push(message);
    },
  };
  return { transport, sent };
}

async function queueMail() {
  await withTransaction((tx) =>
    notify(ctxFor(tx), { userId, type: "plt.test", params: { name: "LOGOS" } }),
  );
  return db.emailOutbox.findFirstOrThrow();
}

describe("sending (AC-6, AC-13)", () => {
  it("sends once, marks SENT, and a repeated run does nothing", async () => {
    const mail = await queueMail();
    const { transport, sent } = fakeTransport(["ok"]);
    await sendOutboxMessage(mail.id, 0, transport);
    await sendOutboxMessage(mail.id, 1, transport);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ana@t.test", subject: mail.subject });
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })).toMatchObject({
      status: "SENT",
      attempts: 1,
      lastErrorCode: null,
    });
  });

  it("a transient failure keeps the row queued and rethrows for the job retry; the retry succeeds", async () => {
    const mail = await queueMail();
    const { transport, sent } = fakeTransport([new MailError("UNAVAILABLE", true)]);
    await expect(sendOutboxMessage(mail.id, 0, transport)).rejects.toMatchObject({
      retryable: true,
    });
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })).toMatchObject({
      status: "QUEUED",
      attempts: 1,
      lastErrorCode: "UNAVAILABLE",
    });
    await sendOutboxMessage(mail.id, 1, transport);
    expect(sent).toHaveLength(1);
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })).toMatchObject({
      status: "SENT",
      attempts: 2,
      lastErrorCode: null,
    });
  });

  it("fails at once on a permanent error, without rethrowing", async () => {
    const mail = await queueMail();
    const { transport, sent } = fakeTransport([new MailError("REJECTED", false)]);
    await expect(sendOutboxMessage(mail.id, 0, transport)).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })).toMatchObject({
      status: "FAILED",
      lastErrorCode: "REJECTED",
    });
  });

  it("marks FAILED after the last attempt of transient errors (5 attempts)", async () => {
    const mail = await queueMail();
    const { transport } = fakeTransport(
      Array.from({ length: 5 }, () => new MailError("TIMEOUT", true)),
    );
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(sendOutboxMessage(mail.id, attempt, transport)).rejects.toBeInstanceOf(
        MailError,
      );
      expect((await db.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })).status).toBe(
        "QUEUED",
      );
    }
    await expect(sendOutboxMessage(mail.id, 4, transport)).resolves.toBeUndefined();
    expect(await db.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })).toMatchObject({
      status: "FAILED",
      attempts: 5,
      lastErrorCode: "TIMEOUT",
    });
  });

  it("never logs the recipient's address, and an unknown provider error is stored as a code only", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((l: string) => void lines.push(String(l)));
    vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(String(l)));
    const mail = await queueMail();
    await sendOutboxMessage(mail.id, 0, fakeTransport(["ok"]).transport);
    const raising: MailTransport = {
      send: async () => {
        throw new Error("550 ana@t.test mailbox unavailable");
      },
    };
    const other = await db.emailOutbox.create({
      data: {
        userId,
        toAddress: "ana@t.test",
        type: "plt.test",
        subject: "s",
        html: "h",
        text: "t",
      },
    });
    await expect(sendOutboxMessage(other.id, 0, raising)).rejects.toBeInstanceOf(MailError);
    expect(
      (await db.emailOutbox.findUniqueOrThrow({ where: { id: other.id } })).lastErrorCode,
    ).toBe("UNKNOWN");
    expect(lines.join("\n")).not.toContain("ana@t.test");
    vi.restoreAllMocks();
  });
});

describe("flush (AC-5)", () => {
  it("enqueues only queued rows older than the threshold", async () => {
    const make = (status: "QUEUED" | "SENT", ageMs: number) =>
      db.emailOutbox.create({
        data: {
          toAddress: "x@t.test",
          type: "plt.test",
          subject: "s",
          html: "h",
          text: "t",
          status,
          createdAt: new Date(Date.now() - ageMs),
        },
      });
    const stale = await make("QUEUED", 5 * 60_000);
    await make("QUEUED", 10_000);
    await make("SENT", 10 * 60_000);
    const enqueued: string[] = [];
    expect(await flushStaleOutbox(async (id) => void enqueued.push(id))).toBe(1);
    expect(enqueued).toEqual([stale.id]);
    expect(await flushStaleOutbox(async () => undefined, 60 * 60_000)).toBe(0);
  });
});
