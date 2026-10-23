import { describe, expect, it } from "vitest";
import { parseEnv } from "./parse-env";

const valid = { APP_URL: "http://localhost:3100", DATABASE_URL: "postgresql://u:p@localhost:5432/d" };

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    expect(parseEnv(valid).APP_URL).toBe("http://localhost:3100");
  });

  it("names a missing variable", () => {
    expect(() => parseEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: valid.APP_URL })).toThrow(/DATABASE_URL/);
  });

  it("names a malformed variable", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not-a-url" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...valid, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
