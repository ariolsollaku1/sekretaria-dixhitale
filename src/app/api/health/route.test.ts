import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const reachable = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: {}, isDatabaseReachable: reachable }));

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns 200 with status, db, version and time when the database is up", async () => {
    reachable.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      db: string;
      version: string;
      time: string;
    };
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  it("returns 503 with db: error when the database is down", async () => {
    reachable.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(((await res.json()) as { db: string }).db).toBe("error");
  });
});
