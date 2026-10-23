import { describe, expect, it } from "vitest";
import { isLocale, resolveLocale } from "./config";

describe("resolveLocale (AC-4)", () => {
  it("prefers the user's stored locale over the cookie", () => {
    expect(resolveLocale({ user: "en", cookie: "sq", fallback: "sq" })).toBe("en");
  });
  it("falls back to the cookie, then to the configured default", () => {
    expect(resolveLocale({ user: null, cookie: "en", fallback: "sq" })).toBe("en");
    expect(resolveLocale({ user: undefined, cookie: undefined, fallback: "sq" })).toBe("sq");
    expect(resolveLocale({ fallback: "en" })).toBe("en");
  });
  it("ignores unsupported values", () => {
    expect(resolveLocale({ user: "de", cookie: "fr", fallback: "sq" })).toBe("sq");
    expect(isLocale("sq")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
