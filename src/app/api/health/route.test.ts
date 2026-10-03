import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with status, version and time", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string; time: string };
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
