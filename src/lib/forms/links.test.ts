import { describe, expect, it } from "vitest";
import { formUrl, indexUrl } from "./links";

describe("website links (INT-06 AC-6)", () => {
  it("builds the index and form addresses", () => {
    expect(indexUrl("https://app.logos.test")).toBe("https://app.logos.test/f");
    expect(formUrl("https://app.logos.test", "interesim")).toBe(
      "https://app.logos.test/f/interesim",
    );
  });
  it("tolerates trailing slashes and encodes the key", () => {
    expect(indexUrl("https://app.logos.test//")).toBe("https://app.logos.test/f");
    expect(formUrl("https://app.logos.test/", "a b")).toBe("https://app.logos.test/f/a%20b");
  });
});
