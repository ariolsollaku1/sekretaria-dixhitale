import { describe, expect, it } from "vitest";
import { parseEnv } from "./parse-env";

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    expect(parseEnv({ APP_URL: "http://localhost:3100" }).APP_URL).toBe("http://localhost:3100");
  });

  it("names a missing variable", () => {
    expect(() => parseEnv({})).toThrow(/APP_URL/);
  });

  it("names a malformed variable", () => {
    expect(() => parseEnv({ APP_URL: "not-a-url" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: "http://x", NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
