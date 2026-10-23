import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createAction, type ActionContext, type ActionResult } from "@/lib/actions";
import { db, withTransaction } from "@/lib/db";
import * as defs from "./definition.service";
import { getPublishedForm, listAuthenticatedForms } from "./queries";

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

const definition = (title = "Kërkesë") =>
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
const draft = (key = "kerkese", over: Partial<defs.DraftInput> = {}) =>
  run((ctx) =>
    defs.createDraft(ctx, key, {
      audience: "PUBLIC",
      ownerRoles: ["secretary"],
      definition: definition(),
      ...over,
    }),
  );

beforeEach(async () => {
  // published/archived definitions are frozen, so tests clean up with the trigger switched off
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" DISABLE TRIGGER USER');
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "audit_logs", "form_submission_events", "form_submissions", "form_definitions" CASCADE',
  );
  await db.$executeRawUnsafe('ALTER TABLE "form_definitions" ENABLE TRIGGER USER');
});

describe("drafts (AC-1, AC-2, AC-11)", () => {
  it("creates versioned drafts and audits", async () => {
    expect(ok(await draft())).toMatchObject({ version: 1 });
    expect(ok(await draft())).toMatchObject({ version: 2 });
    expect(ok(await draft("other"))).toMatchObject({ version: 1 });
    expect(await db.auditLog.count({ where: { action: "plt.form_definition.create" } })).toBe(3);
  });

  it("refuses bad keys, bad JSON, invalid definitions (with paths) and unknown roles", async () => {
    expect(await draft("Bad Key")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await draft("kerkese", { definition: "{nope" })).toMatchObject({
      ok: false,
      error: { fieldErrors: { definition: ["invalidJson"] } },
    });
    const bad = JSON.parse(definition());
    bad.fields.push({ key: "name", type: "text", label: { sq: "Dyfishi" } });
    const r = await draft("kerkese", { definition: JSON.stringify(bad) });
    expect(r).toMatchObject({
      ok: false,
      error: { fieldErrors: { definition: ["fields.1.key:duplicateKey"] } },
    });
    expect(await draft("kerkese", { ownerRoles: ["wizard"] })).toMatchObject({
      ok: false,
      error: { fieldErrors: { ownerRoles: ["unknownRole"] } },
    });
    expect(
      await draft("kerkese", {
        definition: definition().replace('"type":"text"', '"type":"file"'),
      }),
    ).toMatchObject({ ok: false });
    expect(await db.formDefinition.count()).toBe(0);
  });

  it("edits a draft and deletes it", async () => {
    const { definitionId } = ok(await draft());
    ok(
      await run((ctx) =>
        defs.updateDraft(ctx, definitionId, {
          audience: "AUTHENTICATED",
          ownerRoles: ["hr"],
          definition: definition("Ndryshuar"),
        }),
      ),
    );
    expect(
      await db.formDefinition.findUniqueOrThrow({ where: { id: definitionId } }),
    ).toMatchObject({ audience: "AUTHENTICATED", ownerRoles: ["hr"] });
    ok(await run((ctx) => defs.deleteDraft(ctx, definitionId)));
    expect(await db.formDefinition.count()).toBe(0);
  });
});

describe("publish and archive (AC-1, AC-3, AC-4)", () => {
  it("serves the published version, archives the previous one and freezes both", async () => {
    const v1 = ok(await draft()).definitionId;
    expect(await getPublishedForm("kerkese")).toBeNull(); // a draft is not served
    ok(await run((ctx) => defs.publish(ctx, v1)));
    expect(await getPublishedForm("kerkese")).toMatchObject({ version: 1, audience: "PUBLIC" });

    const v2 = ok(await draft("kerkese", { definition: definition("V2") })).definitionId;
    ok(await run((ctx) => defs.publish(ctx, v2)));
    expect(await getPublishedForm("kerkese")).toMatchObject({ version: 2 });
    expect((await db.formDefinition.findUniqueOrThrow({ where: { id: v1 } })).status).toBe(
      "ARCHIVED",
    );
    expect(await db.formDefinition.count({ where: { key: "kerkese", status: "PUBLISHED" } })).toBe(
      1,
    );

    // services refuse edits to non-drafts
    expect(
      await run((ctx) =>
        defs.updateDraft(ctx, v2, { audience: "PUBLIC", ownerRoles: [], definition: definition() }),
      ),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await run((ctx) => defs.deleteDraft(ctx, v1))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(await run((ctx) => defs.publish(ctx, v1))).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("is enforced by the database: one published per key and frozen content", async () => {
    const v1 = ok(await draft()).definitionId;
    ok(await run((ctx) => defs.publish(ctx, v1)));
    await expect(
      db.formDefinition.update({ where: { id: v1 }, data: { definition: {} } }),
    ).rejects.toThrow(/frozen/);
    await expect(
      db.formDefinition.update({ where: { id: v1 }, data: { audience: "AUTHENTICATED" } }),
    ).rejects.toThrow(/frozen/);
    await expect(db.formDefinition.delete({ where: { id: v1 } })).rejects.toThrow(/frozen/);
    const v2 = ok(await draft()).definitionId;
    await expect(
      db.formDefinition.update({ where: { id: v2 }, data: { status: "PUBLISHED" } }),
    ).rejects.toThrow();
  });

  it("takes a form out of service with a reason", async () => {
    const v1 = ok(await draft()).definitionId;
    ok(await run((ctx) => defs.publish(ctx, v1)));
    ok(await run((ctx) => defs.archive(ctx, v1), "Replaced by the website form"));
    expect(await getPublishedForm("kerkese")).toBeNull();
    expect(
      (await db.auditLog.findFirstOrThrow({ where: { action: "plt.form_definition.archive" } }))
        .reason,
    ).toBe("Replaced by the website form");
    expect(await run((ctx) => defs.archive(ctx, v1), "x")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
  });

  it("lists the published authenticated forms only", async () => {
    const pub = ok(await draft("a-public")).definitionId;
    const auth = ok(await draft("b-auth", { audience: "AUTHENTICATED" })).definitionId;
    ok(await draft("c-draft", { audience: "AUTHENTICATED" }));
    ok(await run((ctx) => defs.publish(ctx, pub)));
    ok(await run((ctx) => defs.publish(ctx, auth)));
    expect((await listAuthenticatedForms()).map((f) => f.key)).toEqual(["b-auth"]);
  });
});
