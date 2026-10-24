import { describe, expect, it } from "vitest";
import { matchMenu, normalize } from "./menu";

const items = [
  { id: "stu", label: "Studentët", href: "/stu/students", section: "Studentët" },
  { id: "hr", label: "Stafi", href: "/hr/staff", section: "Burimet njerëzore" },
  { id: "apps", label: "Aplikimet", href: "/adm/applications", section: "Administrim" },
  { id: "adm", label: "Përdoruesit", href: "/admin/users", section: "Sistemi" },
];

describe("normalize", () => {
  it("drops accents and case", () => {
    expect(normalize("  Studentët ")).toBe("studentet");
    expect(normalize("Çlirim")).toBe("clirim");
  });
});

describe("matchMenu", () => {
  it("matches without accents", () => {
    expect(matchMenu(items, "student").map((i) => i.id)).toEqual(["stu"]);
    expect(matchMenu(items, "perdorues").map((i) => i.id)).toEqual(["adm"]);
  });
  it("matches the section heading and ranks label hits first", () => {
    expect(matchMenu(items, "administrim").map((i) => i.id)).toEqual(["apps"]);
    // label hits (Stafi, Studentët) before section-only hits (Administrim, Sistemi)
    expect(matchMenu(items, "st").map((i) => i.id)).toEqual(["hr", "stu", "apps", "adm"]);
  });
  it("needs every word and returns nothing for an empty query", () => {
    expect(matchMenu(items, "stafi zzz")).toEqual([]);
    expect(matchMenu(items, "   ")).toEqual([]);
  });
  it("respects the limit", () => {
    expect(matchMenu(items, "s", 2)).toHaveLength(2);
  });
});
