import { describe, expect, it } from "vitest";
import { fillPlaceholders, unknownPlaceholders, valuesForPerson } from "./placeholders";

const values = valuesForPerson({ firstName: "Elira", lastName: "Hoxha" });

describe("placeholders (AC-3)", () => {
  it("accepts the three allowed placeholders and plain text", () => {
    expect(unknownPlaceholders("Përshëndetje {firstName} {lastName} / {fullName}")).toEqual([]);
    expect(unknownPlaceholders("pa shabllone")).toEqual([]);
  });
  it("lists unknown placeholders once each", () => {
    expect(unknownPlaceholders("{studentNumber} {firstName} {studentNumber} {}")).toEqual([
      "{studentNumber}",
      "{}",
    ]);
  });
  it("fills every occurrence and leaves unknown tokens alone", () => {
    expect(fillPlaceholders("{firstName}, {fullName}, {firstName} {x}", values)).toBe(
      "Elira, Elira Hoxha, Elira {x}",
    );
  });
  it("does not interpret replacement patterns inside names", () => {
    const v = valuesForPerson({ firstName: "$&", lastName: "$1" });
    expect(fillPlaceholders("{firstName} {lastName}", v)).toBe("$& $1");
  });
});
