import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import * as defs from "./definition.service";
import { listPublicForms } from "./queries";

const actor = { id: "admin-1", email: "a@t.test", name: "Admin", locale: null, personId: null };
function run<R>(fn: (ctx: ActionContext) => Promise<R>, reason?: string): Promise<ActionResult<R>> {
  const action = createAction({
    getUser: async () => actor,
    can: async () => true,
    transaction: withTransaction,
    request: async () => ({ requestId: "r", ip: null, userAgent: null }),
  });
  return action({
    permission: "plt.form.manage",
    input: z.object({}).passthrough(),
    requireReason: reason !== undefined,
    handler: (_i, ctx) => fn(ctx),
  })({ reason } as never);
}
const ok = <T>(r: ActionResult<T>): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.data;
};

const definition = (title: string) =>
  JSON.stringify({
    title: { sq: title },
    fields: [{ key: "name", type: "text", label: { sq: "Emri" }, required: true }],
    workflow: {
      initial: "new",
      states: [
        { key: "new", label: { sq: "E re" } },
        { key: "done", label: { sq: "Mbyllur" }, final: true },
      ],
      transitions: [{ from: "new", to: "done" }],
    },
  });
const make = async (key: string, audience: "PUBLIC" | "AUTHENTICATED", title = key) =>
  ok(
    await run((ctx) =>
      defs.createDraft(ctx, key, {
        audience,
        ownerRoles: ["secretary"],
        definition: definition(title),
      }),
    ),
  ).definitionId;
const publish = async (id: string) => ok(await run((ctx) => defs.publish(ctx, id)));

beforeEach(async () => {
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "form_submission_events", "form_submissions", "form_definitions" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
});

describe("public forms index (INT-06 AC-1..AC-3)", () => {
  it("lists only published public forms", async () => {
    await publish(await make("interesim", "PUBLIC"));
    await publish(await make("brendshme", "AUTHENTICATED"));
    await make("skice", "PUBLIC"); // draft only
    const archived = await make("arkivuar", "PUBLIC");
    await publish(archived);
    ok(await run((ctx) => defs.archive(ctx, archived), "Out of service"));
    expect((await listPublicForms()).map((f) => f.key)).toEqual(["interesim"]);
  });

  it("keeps the key and serves the new version when republished", async () => {
    await publish(await make("interesim", "PUBLIC", "V1"));
    await publish(await make("interesim", "PUBLIC", "V2"));
    const list = await listPublicForms();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: "interesim", version: 2 });
    expect(list[0]!.definition.title.sq).toBe("V2");
  });

  it("does not list a stored definition that no longer validates", async () => {
    const id = await publish(await make("prishur", "PUBLIC"));
    void id;
    await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
    await db.$executeRawUnsafe(`UPDATE "form_definitions" SET definition = '{}'::jsonb`);
    await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
    expect(await listPublicForms()).toEqual([]);
  });
});
