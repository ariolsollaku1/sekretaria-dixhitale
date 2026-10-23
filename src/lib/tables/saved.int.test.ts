import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({
  user: null as { id: string; email: string; name: string; locale: null; personId: null } | null,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => current.user,
  requireUser: async () => current.user,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { db } from "@/lib/db";
import { registerPermissions } from "@/lib/authz/registry";
import { defineTable, registerTable } from "./define";
import { listSavedFilters } from "./saved";
import { deleteFilterAction, saveFilterAction } from "./saved.actions";
import { MAX_SAVED_FILTERS } from "./types";

const table = defineTable({
  id: "test.saved",
  permission: "test.saved.read",
  exportName: "saved",
  rowKey: (r: { id: string }) => r.id,
  columns: [{ key: "name", labelKey: "n", type: "text", sortable: true, alwaysVisible: true }],
  filters: [
    { key: "q", labelKey: "q", type: "text" },
    { key: "status", labelKey: "s", type: "select", options: [{ value: "active", labelKey: "a" }] },
  ],
  defaultSort: { key: "name", dir: "asc" },
  values: { name: () => "x" },
  fetch: async () => ({ rows: [], total: 0 }),
});

async function makeUser(email: string, role: "secretary" | "student" | null = "secretary") {
  const u = await db.user.create({ data: { email, name: email } });
  if (role)
    await db.userRole.create({
      data: { userId: u.id, role, scopeType: role === "student" ? "SELF" : "INSTITUTION" },
    });
  return { id: u.id, email, name: email, locale: null, personId: null } as const;
}

const save = (name: string, query = "q=ana") =>
  saveFilterAction({ tableId: "test.saved", name, query, path: "/x" });

beforeEach(async () => {
  registerPermissions("test", {
    permissions: ["test.saved.read"],
    grants: { secretary: ["test.saved.read"] },
  });
  registerTable(table);
  await db.savedFilter.deleteMany();
  await db.userRole.deleteMany();
  await db.user.deleteMany();
  current.user = await makeUser("a@t.test");
});

describe("saved filters (AC-6)", () => {
  it("stores the canonical query: validated values only, no page", async () => {
    const result = await save(
      "Active Ana",
      "q=ana&status=active&page=4&evil=1&sort=hack:asc&size=77",
    );
    expect(result.ok).toBe(true);
    expect(await listSavedFilters(current.user!.id, "test.saved")).toMatchObject([
      { name: "Active Ana", query: "q=ana&status=active" },
    ]);
  });

  it("lists only the caller's own filters, sorted by name", async () => {
    await save("b");
    await save("a");
    const other = await makeUser("b@t.test");
    current.user = other;
    await save("theirs");
    expect((await listSavedFilters(other.id, "test.saved")).map((f) => f.name)).toEqual(["theirs"]);
    const mine = await db.user.findUniqueOrThrow({ where: { email: "a@t.test" } });
    expect((await listSavedFilters(mine.id, "test.saved")).map((f) => f.name)).toEqual(["a", "b"]);
  });

  it("refuses a duplicate name with a field error, but allows the same name for another user", async () => {
    await save("same");
    expect(await save("same")).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { name: ["nameTaken"] } },
    });
    current.user = await makeUser("b@t.test");
    expect((await save("same")).ok).toBe(true);
  });

  it(`stops at ${MAX_SAVED_FILTERS} filters per table`, async () => {
    for (let i = 0; i < MAX_SAVED_FILTERS; i++) expect((await save(`f${i}`)).ok).toBe(true);
    expect(await save("one too many")).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: "LIMIT_REACHED" },
    });
  });

  it("validates the name and the table", async () => {
    expect(await save("  ")).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await saveFilterAction({ tableId: "nope", name: "x", query: "", path: "/x" }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("does not let a user save views of a table they may not read", async () => {
    current.user = await makeUser("student@t.test", "student");
    expect(await save("sneaky")).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await db.savedFilter.count()).toBe(0);
  });

  it("requires a signed-in user", async () => {
    current.user = null;
    expect(await save("x")).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("deletes your own filter and treats someone else's as unknown", async () => {
    const mine = (await save("mine")) as { ok: true; data: { id: string } };
    const owner = current.user!;
    current.user = await makeUser("b@t.test");
    expect(await deleteFilterAction({ id: mine.data.id, path: "/x" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await db.savedFilter.count()).toBe(1);
    current.user = owner;
    expect((await deleteFilterAction({ id: mine.data.id, path: "/x" })).ok).toBe(true);
    expect(await db.savedFilter.count()).toBe(0);
  });
});
