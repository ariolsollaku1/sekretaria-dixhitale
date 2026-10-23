import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { db, withTransaction } from "@/lib/db";
import { createAction, DomainError } from "./action";

const user = { id: "u1", email: "u1@t.test", name: "U One", locale: null, personId: null };
const request = async () => ({ requestId: "req-1", ip: "203.0.113.9", userAgent: "vitest" });

function makeAction(overrides: Partial<Parameters<typeof createAction>[0]> = {}) {
  return createAction({
    getUser: async () => user,
    can: async () => true,
    transaction: withTransaction,
    request,
    ...overrides,
  });
}

const setting = z.object({ key: z.string().min(1), value: z.string() });

beforeEach(async () => {
  // audit_logs rejects DELETE, but TRUNCATE (used by resetDatabase) is allowed.
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "system_settings"');
});

describe("audit in the same transaction (AC-2)", () => {
  it("a failing handler leaves no audit row and no data; a success leaves exactly one", async () => {
    const action = makeAction();
    const create = action({
      permission: "plt.settings.write",
      input: setting,
      handler: async (input, ctx) => {
        await ctx.db.systemSetting.create({ data: { key: input.key, value: input.value } });
        await ctx.audit({
          action: "plt.setting.create",
          entityType: "SystemSetting",
          entityId: input.key,
          before: null,
          after: { value: input.value },
        });
        if (input.value === "boom") throw new Error("boom");
        return input.key;
      },
    });

    expect(await create({ key: "bad", value: "boom" })).toMatchObject({
      ok: false,
      error: { code: "INTERNAL" },
    });
    expect(await db.auditLog.count()).toBe(0);
    expect(await db.systemSetting.count()).toBe(0);

    expect(await create({ key: "good", value: "v" })).toEqual({ ok: true, data: "good" });
    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorType: "USER",
      actorUserId: "u1",
      action: "plt.setting.create",
      entityType: "SystemSetting",
      entityId: "good",
      before: null,
      after: { value: "v" },
      requestId: "req-1",
      ip: "203.0.113.9",
      userAgent: "vitest",
    });
  });

  it("stores only changed fields, masks sensitive ones, and skips no-op updates (AC-3)", async () => {
    const action = makeAction();
    const update = action({
      permission: "plt.settings.write",
      input: z.object({
        before: z.record(z.string(), z.unknown()),
        after: z.record(z.string(), z.unknown()),
      }),
      handler: (input, ctx) =>
        ctx.audit({
          action: "plt.setting.update",
          entityType: "Person",
          entityId: "p1",
          before: input.before,
          after: input.after,
        }),
    });
    await update({
      before: { name: "Ana", nationalId: "J1" },
      after: { name: "Ana", nationalId: "J2" },
    });
    await update({ before: { name: "Ana" }, after: { name: "Ana" } });
    await update({ before: { name: "Ana" }, after: { name: "Eva" } });
    const rows = await db.auditLog.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => [r.before, r.after])).toEqual([
      [{ nationalId: "***" }, { nationalId: "***" }],
      [{ name: "Ana" }, { name: "Eva" }],
    ]);
  });

  it("rejects malformed action names", async () => {
    const bad = makeAction()({
      permission: "plt.settings.write",
      input: z.object({}),
      handler: (_i, ctx) => ctx.audit({ action: "Nope", entityType: "X" }),
    });
    expect(await bad({})).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
  });
});

describe("immutability (AC-4)", () => {
  it("rejects UPDATE and DELETE at the database level", async () => {
    const row = await db.auditLog.create({
      data: { actorType: "SYSTEM", action: "plt.test.run", entityType: "Test" },
    });
    await expect(
      db.auditLog.update({ where: { id: row.id }, data: { reason: "tamper" } }),
    ).rejects.toThrow();
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(db.$executeRaw`UPDATE audit_logs SET action = 'x.y.z'`).rejects.toThrow(
      /append-only/,
    );
    await expect(db.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow();
    expect(await db.auditLog.findMany()).toMatchObject([
      { id: row.id, action: "plt.test.run", reason: null },
    ]);
  });

  it("names the cause in the database error", async () => {
    await db.auditLog.create({
      data: { actorType: "SYSTEM", action: "plt.test.run", entityType: "Test" },
    });
    await expect(db.$executeRaw`DELETE FROM audit_logs`).rejects.toThrow(/append-only/);
  });
});

describe("reason (AC-8)", () => {
  const withReason = () =>
    makeAction()({
      permission: "plt.settings.write",
      input: z.object({ key: z.string() }).strict(),
      requireReason: true,
      handler: async (input, ctx) => {
        await ctx.audit({
          action: "plt.setting.delete",
          entityType: "SystemSetting",
          entityId: input.key,
          reason: ctx.reason,
        });
        return ctx.reason;
      },
    });

  it("rejects a missing or blank reason with a field error and writes nothing", async () => {
    const a = withReason();
    for (const reason of [undefined, "", "   "]) {
      expect(await a({ key: "k", reason })).toMatchObject({
        ok: false,
        error: { code: "VALIDATION", fieldErrors: { reason: [expect.any(String)] } },
      });
    }
    expect(await db.auditLog.count()).toBe(0);
  });

  it("stores the trimmed reason on the entry", async () => {
    expect(await withReason()({ key: "k", reason: "  duplicate record  " })).toEqual({
      ok: true,
      data: "duplicate record",
    });
    expect((await db.auditLog.findFirstOrThrow()).reason).toBe("duplicate record");
  });
});

describe("result shapes", () => {
  const noop = (deps: Parameters<typeof makeAction>[0]) =>
    makeAction(deps)({
      permission: "plt.settings.write",
      input: z.object({ n: z.number() }),
      handler: async (i) => i.n,
    });

  it("UNAUTHENTICATED without a session", async () => {
    expect(await noop({ getUser: async () => null })({ n: 1 })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });
  it("FORBIDDEN without the permission, before looking at the input", async () => {
    expect(await noop({ can: async () => false })({ n: "x" as never })).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
  });
  it("FORBIDDEN when the scoped check on the target fails", async () => {
    const calls: unknown[] = [];
    const a = makeAction({
      can: async (_u, _p, target) => {
        calls.push(target);
        return target === undefined;
      },
    })({
      permission: "plt.settings.write",
      input: z.object({ id: z.string() }),
      target: (i) => ({ kind: "student", id: i.id }),
      handler: async () => "done",
    });
    expect(await a({ id: "s1" })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(calls).toEqual([undefined, { kind: "student", id: "s1" }]);
  });
  it("VALIDATION with field errors", async () => {
    expect(await noop({})({ n: "x" as never })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { n: [expect.any(String)] } },
    });
  });
  it("maps DomainError to its code and keeps the transaction rolled back", async () => {
    const a = makeAction()({
      permission: "plt.settings.write",
      input: z.object({}),
      handler: async (_i, ctx) => {
        await ctx.db.systemSetting.create({ data: { key: "x", value: 1 } });
        throw new DomainError("CONFLICT", "Already exists");
      },
    });
    expect(await a({})).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: "Already exists", fieldErrors: undefined },
    });
    expect(await db.systemSetting.count()).toBe(0);
  });
});

describe("compensation and after-commit hooks", () => {
  const run = (fail: boolean) => {
    const log: string[] = [];
    const a = makeAction()({
      permission: "plt.settings.write",
      input: z.object({}),
      handler: async (_i, ctx) => {
        ctx.onFailure(async () => void log.push("undo-first"));
        ctx.onFailure(async () => {
          log.push("undo-second");
          throw new Error("undo itself failed");
        });
        ctx.afterCommit(async () => void log.push("after-commit"));
        if (fail) throw new DomainError("CONFLICT", "nope");
        return "ok";
      },
    });
    return { a, log };
  };

  it("runs compensations in reverse order when the handler fails, and not the after-commit hooks", async () => {
    const { a, log } = run(true);
    expect(await a({})).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(log).toEqual(["undo-second", "undo-first"]); // a failing undo does not stop the others
  });

  it("runs after-commit hooks only on success, never compensations", async () => {
    const { a, log } = run(false);
    expect(await a({})).toEqual({ ok: true, data: "ok" });
    expect(log).toEqual(["after-commit"]);
  });

  it("compensates when the commit itself fails", async () => {
    const log: string[] = [];
    const a = makeAction({
      transaction: async (fn) => {
        await fn({} as never);
        throw new Error("commit failed");
      },
    })({
      permission: "plt.settings.write",
      input: z.object({}),
      handler: async (_i, ctx) => {
        ctx.onFailure(async () => void log.push("undo"));
        return 1;
      },
    });
    expect(await a({})).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(log).toEqual(["undo"]);
  });
});
