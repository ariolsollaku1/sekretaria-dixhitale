import { describe, expect, it } from "vitest";
import { parseEnv } from "./parse-env";

const valid = {
  APP_URL: "http://localhost:3100",
  DATABASE_URL: "postgresql://u:p@localhost:5432/d",
  KEYCLOAK_ISSUER: "http://localhost:8080/realms/logos",
  KEYCLOAK_CLIENT_ID: "sekretari-web",
  KEYCLOAK_CLIENT_SECRET: "secret",
  KEYCLOAK_ADMIN_CLIENT_SECRET: "admin-secret",
  BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("accepts a valid environment", () => {
    expect(parseEnv(valid).APP_URL).toBe("http://localhost:3100");
  });

  it("defaults the session lifetimes to 30 min idle and 12 h absolute (AC-6)", () => {
    const env = parseEnv(valid);
    expect([env.SESSION_IDLE_MINUTES, env.SESSION_MAX_HOURS]).toEqual([30, 12]);
    expect(parseEnv({ ...valid, SESSION_IDLE_MINUTES: "10" }).SESSION_IDLE_MINUTES).toBe(10);
  });

  it("names a missing variable", () => {
    expect(() => parseEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: valid.APP_URL })).toThrow(/DATABASE_URL/);
  });

  it("names a malformed variable", () => {
    expect(() => parseEnv({ ...valid, APP_URL: "not-a-url" })).toThrow(/APP_URL/);
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => parseEnv({ ...valid, NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
  });
});
