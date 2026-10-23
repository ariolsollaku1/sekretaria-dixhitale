import { describe, expect, it } from "vitest";
import {
  assertValidShape,
  nextSort,
  parseTableParams,
  toQueryString,
  visibleColumns,
} from "./params";
import type { TableShape } from "./types";

const shape: TableShape = {
  columns: [
    { key: "name", labelKey: "n", type: "text", sortable: true, alwaysVisible: true },
    { key: "email", labelKey: "e", type: "text", sortable: true },
    { key: "city", labelKey: "c", type: "text", defaultVisible: false },
    { key: "joined", labelKey: "j", type: "date", sortable: true },
  ],
  filters: [
    { key: "q", labelKey: "q", type: "text" },
    {
      key: "status",
      labelKey: "s",
      type: "select",
      options: [
        { value: "active", labelKey: "a" },
        { value: "inactive", labelKey: "i" },
      ],
    },
    { key: "from", labelKey: "f", type: "date" },
  ],
  defaultSort: { key: "name", dir: "asc" },
};

describe("parseTableParams (AC-2, AC-3)", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseTableParams({}, shape)).toEqual({
      page: 1,
      pageSize: 25,
      sort: { key: "name", dir: "asc" },
      filters: {},
      columns: [],
    });
  });

  it("accepts valid values", () => {
    const p = parseTableParams(
      {
        page: "3",
        size: "50",
        sort: "email:desc",
        q: " ana ",
        status: "active",
        from: "2026-02-03",
        cols: "name,city",
      },
      shape,
    );
    expect(p).toEqual({
      page: 3,
      pageSize: 50,
      sort: { key: "email", dir: "desc" },
      filters: { q: "ana", status: "active", from: "2026-02-03" },
      columns: ["name", "city"],
    });
  });

  it.each([
    ["unknown sort column", { sort: "password:asc" }, { sort: { key: "name", dir: "asc" } }],
    ["non-sortable sort column", { sort: "city:asc" }, { sort: { key: "name", dir: "asc" } }],
    [
      "bad direction becomes asc",
      { sort: "email:sideways" },
      { sort: { key: "email", dir: "asc" } },
    ],
    ["page size not offered", { size: "7" }, { pageSize: 25 }],
    ["huge page size", { size: "100000" }, { pageSize: 25 }],
    ["page zero", { page: "0" }, { page: 1 }],
    ["negative page", { page: "-4" }, { page: 1 }],
    ["fractional page is floored", { page: "2.9" }, { page: 2 }],
    ["non-numeric page", { page: "abc" }, { page: 1 }],
    ["absurd page is capped", { page: "99999999999" }, { page: 1_000_000 }],
    ["unknown select value", { status: "hacked" }, { filters: {} }],
    ["impossible date", { from: "2026-02-31" }, { filters: {} }],
    ["malformed date", { from: "03/02/2026" }, { filters: {} }],
    ["blank text filter", { q: "   " }, { filters: {} }],
    ["unknown filter keys are ignored", { evil: "1", __proto__: "x" }, { filters: {} }],
    [
      "unknown columns are dropped",
      { cols: "name,secret,city,city" },
      { columns: ["name", "city"] },
    ],
  ])("%s", (_name, input, expected) => {
    expect(parseTableParams(input as Record<string, string>, shape)).toMatchObject(expected);
  });

  it("takes the first value of repeated parameters and truncates very long text", () => {
    expect(parseTableParams({ q: ["a", "b"] }, shape).filters.q).toBe("a");
    expect(parseTableParams({ q: "x".repeat(500) }, shape).filters.q).toHaveLength(200);
  });
});

describe("visibleColumns (AC-5)", () => {
  it("shows the default columns when nothing is chosen, always-visible ones included", () => {
    expect(visibleColumns(shape, []).map((c) => c.key)).toEqual(["name", "email", "joined"]);
  });
  it("shows exactly the chosen columns plus the always-visible ones, in definition order", () => {
    expect(visibleColumns(shape, ["joined", "city"]).map((c) => c.key)).toEqual([
      "name",
      "city",
      "joined",
    ]);
  });
});

describe("toQueryString", () => {
  const base = parseTableParams({}, shape);
  it("is empty for defaults", () => {
    expect(toQueryString(base, shape)).toBe("");
  });
  it("round-trips non-default state", () => {
    const params = parseTableParams(
      { page: "2", size: "10", sort: "joined:desc", q: "ana", status: "inactive", cols: "city" },
      shape,
    );
    const qs = toQueryString(params, shape, { page: true });
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual({
      q: "ana",
      status: "inactive",
      sort: "joined:desc",
      size: "10",
      cols: "city",
      page: "2",
    });
    expect(parseTableParams(Object.fromEntries(new URLSearchParams(qs)), shape)).toEqual(params);
  });
  it("leaves out the page unless asked, and applies overrides", () => {
    const params = parseTableParams({ page: "5", q: "x" }, shape);
    expect(toQueryString(params, shape)).toBe("q=x");
    expect(toQueryString(params, shape, { overrides: { page: "6", q: undefined } })).toBe("page=6");
  });
});

describe("nextSort", () => {
  it("starts ascending on a new column and toggles on the same one", () => {
    expect(nextSort({ key: "name", dir: "asc" }, "email")).toEqual({ key: "email", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "name")).toEqual({ key: "name", dir: "desc" });
    expect(nextSort({ key: "name", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });
});

describe("assertValidShape", () => {
  it("accepts a good shape", () => {
    expect(() => assertValidShape(shape)).not.toThrow();
  });
  it("rejects reserved or duplicate keys and a non-sortable default sort", () => {
    expect(() =>
      assertValidShape({ ...shape, filters: [{ key: "page", labelKey: "x", type: "text" }] }),
    ).toThrow(/reserved/);
    expect(() =>
      assertValidShape({ ...shape, filters: [shape.filters[0]!, shape.filters[0]!] }),
    ).toThrow(/Duplicate filter/);
    expect(() =>
      assertValidShape({ ...shape, columns: [shape.columns[0]!, shape.columns[0]!] }),
    ).toThrow(/Duplicate column/);
    expect(() => assertValidShape({ ...shape, defaultSort: { key: "city", dir: "asc" } })).toThrow(
      /sortable/,
    );
  });
});
