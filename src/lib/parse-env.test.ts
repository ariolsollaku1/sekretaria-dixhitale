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

describe("mail settings (PLT-11)", () => {
  it("defaults to SMTP on localhost:1025", () => {
    const env = parseEnv(valid);
    expect([env.MAIL_TRANSPORT, env.SMTP_HOST, env.SMTP_PORT, env.SMTP_SECURE]).toEqual([
      "smtp",
      "localhost",
      1025,
      "false",
    ]);
  });
  it("requires the Microsoft app registration for the graph transport", () => {
    expect(() => parseEnv({ ...valid, MAIL_TRANSPORT: "graph" })).toThrow(
      /MS_TENANT_ID.*MS_CLIENT_ID.*MS_CLIENT_SECRET/s,
    );
    expect(
      parseEnv({
        ...valid,
        MAIL_TRANSPORT: "graph",
        MS_TENANT_ID: "t",
        MS_CLIENT_ID: "c",
        MS_CLIENT_SECRET: "s",
      }).MAIL_TRANSPORT,
    ).toBe("graph");
    expect(() => parseEnv({ ...valid, MAIL_TRANSPORT: "carrier-pigeon" })).toThrow(
      /MAIL_TRANSPORT/,
    );
  });
});

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
