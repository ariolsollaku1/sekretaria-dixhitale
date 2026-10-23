import { beforeEach, describe, expect, it } from "vitest";
import { allNavEntries, registerNav, resetNav, visibleNav, type NavEntry } from "./registry";

const entry = (over: Partial<NavEntry> & Pick<NavEntry, "id">): NavEntry => ({
  labelKey: over.id,
  href: `/${over.id}`,
  icon: "file",
  order: 10,
  ...over,
});

beforeEach(resetNav);

describe("visibleNav (AC-2)", () => {
  it("shows only entries whose permission the user holds; no permission = everyone", () => {
    const list = [
      entry({ id: "home" }),
      entry({ id: "students", permission: "stu.student.read", group: "students" }),
      entry({ id: "users", permission: "iam.user.read", group: "system" }),
    ];
    const sections = visibleNav(list, new Set(["stu.student.read"]));
    expect(sections.flatMap((s) => s.entries.map((e) => e.id))).toEqual(["home", "students"]);
  });

  it("orders ungrouped first, then groups in catalog order, then by `order`", () => {
    const list = [
      entry({ id: "sys", group: "system" }),
      entry({ id: "b", group: "students", order: 20 }),
      entry({ id: "a", group: "students", order: 5 }),
      entry({ id: "home", order: 0 }),
    ];
    const sections = visibleNav(list, new Set());
    expect(sections.map((s) => s.group)).toEqual([null, "students", "system"]);
    expect(sections[1]!.entries.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("breaks ties on id and drops empty groups", () => {
    const list = [entry({ id: "z", group: "hr" }), entry({ id: "y", group: "hr" })];
    expect(visibleNav(list, new Set())[0]!.entries.map((e) => e.id)).toEqual(["y", "z"]);
    expect(visibleNav([], new Set())).toEqual([]);
  });
});

describe("registerNav", () => {
  it("collects entries and rejects duplicate ids", () => {
    registerNav(entry({ id: "x" }));
    expect(allNavEntries()).toHaveLength(1);
    expect(() => registerNav(entry({ id: "x" }))).toThrow(/Duplicate/);
  });
});
