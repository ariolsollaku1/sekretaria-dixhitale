import { beforeEach, describe, expect, it } from "vitest";
import {
  allChecklistItems,
  registerYearChecklistItem,
  resetChecklist,
  visibleChecklist,
  type ChecklistItem,
} from "./rollover";

const item = (over: Partial<ChecklistItem> & Pick<ChecklistItem, "id">): ChecklistItem => ({
  labelKey: over.id,
  href: `/${over.id}`,
  order: 10,
  ...over,
});

beforeEach(resetChecklist);

describe("year rollover checklist (AC-11)", () => {
  it("is empty until modules register steps", () => {
    expect(visibleChecklist(allChecklistItems(), new Set())).toEqual([]);
  });
  it("shows only the steps the user may use, in order, ties by id", () => {
    registerYearChecklistItem(item({ id: "calendar", order: 30, permission: "cal.event.write" }));
    registerYearChecklistItem(item({ id: "groups", order: 10, permission: "org.group.write" }));
    registerYearChecklistItem(item({ id: "docs", order: 10 }));
    expect(
      visibleChecklist(allChecklistItems(), new Set(["org.group.write"])).map((i) => i.id),
    ).toEqual(["docs", "groups"]);
    expect(
      visibleChecklist(allChecklistItems(), new Set(["cal.event.write", "org.group.write"])).map(
        (i) => i.id,
      ),
    ).toEqual(["docs", "groups", "calendar"]);
  });
  it("re-registering an id replaces it", () => {
    registerYearChecklistItem(item({ id: "a", order: 5 }));
    registerYearChecklistItem(item({ id: "a", order: 1 }));
    expect(allChecklistItems()).toHaveLength(1);
    expect(allChecklistItems()[0]!.order).toBe(1);
  });
});
