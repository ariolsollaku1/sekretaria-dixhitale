import { describe, expect, it, vi } from "vitest";
import { runSearch, type SearchSource } from "./registry";

const hit = (n: number) => ({ id: `h${n}`, title: `T${n}`, href: `/x/${n}` });
const source = (id: string, permission: string, hits = [hit(1)]): SearchSource => ({
  id,
  groupKey: id,
  permission,
  run: async () => hits,
});
const user = { id: "u1" };

describe("runSearch", () => {
  it("omits sources the user may not read (AC-4)", async () => {
    const run = vi.fn(async () => [hit(1)]);
    const groups = await runSearch("ana", user, {
      can: async (_u, p) => p === "a.read",
      sources: [source("a", "a.read"), { ...source("b", "b.read"), run }],
    });
    expect(groups.map((g) => g.id)).toEqual(["a"]);
    expect(run).not.toHaveBeenCalled();
  });

  it("isolates a failing source and reports only its id (AC-5, AC-8)", async () => {
    const onError = vi.fn();
    const boom: SearchSource = {
      ...source("b", "p"),
      run: async () => Promise.reject(new Error("db")),
    };
    const groups = await runSearch("ana", user, {
      can: async () => true,
      sources: [boom, source("a", "p")],
      onError,
    });
    expect(groups.map((g) => g.id)).toEqual(["a"]);
    expect(onError).toHaveBeenCalledWith("b");
  });

  it("caps each group at 5 and drops empty groups (AC-3)", async () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map(hit);
    const groups = await runSearch("ana", user, {
      can: async () => true,
      sources: [source("a", "p", many), source("empty", "p", [])],
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.hits).toHaveLength(5);
  });

  it("ignores queries that are too short or too long", async () => {
    const deps = { can: async () => true, sources: [source("a", "p")] };
    expect(await runSearch("a", user, deps)).toEqual([]);
    expect(await runSearch(" a ", user, deps)).toEqual([]);
    expect(await runSearch("x".repeat(81), user, deps)).toEqual([]);
  });
});
