import { beforeEach, describe, expect, it } from "vitest";
import { registerWidget, resetWidgets, visibleWidgets } from "./widgets";

const w = (id: string, order: number, permission?: string) => ({
  id,
  order,
  permission,
  component: () => null,
});

beforeEach(resetWidgets);

describe("widget registry (AC-10)", () => {
  it("returns nothing when no module registered a widget", () => {
    expect(visibleWidgets(new Set())).toEqual([]);
  });
  it("filters by permission and sorts by order then id", () => {
    registerWidget(w("b", 2));
    registerWidget(w("a", 2));
    registerWidget(w("first", 1));
    registerWidget(w("secret", 0, "plt.audit.read"));
    expect(visibleWidgets(new Set()).map((x) => x.id)).toEqual(["first", "a", "b"]);
    expect(visibleWidgets(new Set(["plt.audit.read"]))[0]!.id).toBe("secret");
  });
  it("rejects duplicate ids", () => {
    registerWidget(w("x", 1));
    expect(() => registerWidget(w("x", 1))).toThrow(/Duplicate/);
  });
});
