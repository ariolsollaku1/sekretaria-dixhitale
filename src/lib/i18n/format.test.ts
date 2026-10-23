import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatGrade,
  formatMoney,
  formatNumber,
  formatPlainDate,
} from "./format";

describe("formatDateTime (Europe/Tirane)", () => {
  it("applies winter time (UTC+1)", () => {
    expect(formatDateTime("2026-01-15T10:30:00Z", "en")).toMatch(/11:30/);
    expect(formatDateTime("2026-01-15T10:30:00Z", "sq")).toMatch(/11[:.]30/);
  });
  it("applies summer time (UTC+2)", () => {
    expect(formatDateTime("2026-07-15T10:30:00Z", "en")).toMatch(/12:30/);
  });
  it("renders the local calendar day around midnight", () => {
    // 23:30 UTC on 14 Jan is already 15 Jan in Tirane.
    expect(formatDate("2026-01-14T23:30:00Z", "en")).toMatch(/15/);
  });
  it("uses the locale's month names", () => {
    expect(formatDate("2026-03-01T12:00:00Z", "en")).toMatch(/Mar/);
    expect(formatDate("2026-03-01T12:00:00Z", "sq")).not.toMatch(/Mar\b/);
  });
});

describe("formatPlainDate", () => {
  it("never shifts a date-only value, whatever the zone", () => {
    expect(formatPlainDate("2026-03-01", "en")).toMatch(/^1 Mar 2026$/);
    expect(formatPlainDate(new Date("2026-03-01T00:00:00Z"), "en")).toMatch(/^1 Mar 2026$/);
  });
});

describe("numbers and money (AC-6)", () => {
  it("uses the locale's separators", () => {
    expect(formatNumber(12345.5, "en")).toBe("12,345.5");
    expect(formatNumber(12345.5, "sq")).toMatch(/^12\D345,5$/);
  });
  it("formats ALL with two decimals in both locales", () => {
    expect(formatMoney(12345.5, "en")).toMatch(/12,345\.50/);
    expect(formatMoney("12345.5", "sq")).toMatch(/12\D345,50/);
    expect(formatMoney(10, "en", "EUR")).toMatch(/€10\.00/);
  });
  it("formats grades with at most two decimals", () => {
    expect(formatGrade(8, "en")).toBe("8");
    expect(formatGrade(8.456, "en")).toBe("8.46");
    expect(formatGrade(8.5, "sq")).toBe("8,5");
  });
});
