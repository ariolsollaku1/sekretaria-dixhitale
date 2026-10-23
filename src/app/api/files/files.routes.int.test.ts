import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({
  user: null as { id: string; email: string; name: string; locale: null; personId: null } | null,
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => current.user,
  requireUser: async () => current.user,
}));

import { db } from "@/lib/db";
import { registerPlatformPurposes } from "@/lib/files/platform-purposes";
import { LocalStorage } from "@/lib/storage/local";
import { setStorage } from "@/lib/storage";
import { GET } from "./[id]/route";
import { POST } from "./route";

const PDF = new TextEncoder().encode("%PDF-1.7 route test");
let dir: string;

async function makeUser(email: string, sysadmin: boolean) {
  const u = await db.user.create({ data: { email, name: email } });
  if (sysadmin)
    await db.userRole.create({
      data: { userId: u.id, role: "sysadmin", scopeType: "INSTITUTION" },
    });
  return { id: u.id, email, name: email, locale: null, personId: null } as const;
}

function uploadRequest(purpose: string, file: File | null, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.set("file", file);
  return new Request(`http://localhost/api/files?purpose=${purpose}`, {
    method: "POST",
    body: form,
    headers,
  });
}
const pdfFile = (name = "report.pdf", type = "application/pdf") => new File([PDF], name, { type });
const download = (id: string) =>
  GET(new Request(`http://localhost/api/files/${id}`), { params: Promise.resolve({ id }) });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "routes-"));
  setStorage(new LocalStorage(dir));
  registerPlatformPurposes();
  await db.$executeRawUnsafe('TRUNCATE TABLE "audit_logs", "stored_files"');
  await db.userRole.deleteMany();
  await db.user.deleteMany();
});
afterEach(async () => {
  setStorage(undefined);
  await rm(dir, { recursive: true, force: true });
  current.user = null;
});

describe("POST /api/files (AC-3, AC-4, AC-5)", () => {
  it("401 without a session, 403 without the permission; nothing is stored", async () => {
    expect((await POST(uploadRequest("general", pdfFile()))).status).toBe(401);
    current.user = await makeUser("plain@t.test", false);
    const forbidden = await POST(uploadRequest("general", pdfFile()));
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await db.storedFile.count()).toBe(0);
  });

  it("stores a valid upload and returns its id", async () => {
    current.user = await makeUser("admin@t.test", true);
    const res = await POST(uploadRequest("general", pdfFile("Diplomë.pdf")));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      data: { fileName: "Diplomë.pdf", mimeType: "application/pdf", size: PDF.length },
    });
    expect(await db.storedFile.findUniqueOrThrow({ where: { id: body.data.id } })).toMatchObject({
      purpose: "general",
      status: "PENDING",
    });
  });

  it.each([
    ["unknown purpose", "nope", pdfFile(), 400, "UNKNOWN_PURPOSE"],
    ["no file field", "general", null, 400, "BAD_REQUEST"],
    [
      "wrong content",
      "general",
      new File(["<script>alert(1)</script>"], "x.pdf", { type: "application/pdf" }),
      415,
      "UNSUPPORTED_TYPE",
    ],
    [
      "declared type contradicts content",
      "general",
      pdfFile("x.png", "image/png"),
      415,
      "TYPE_MISMATCH",
    ],
    ["empty", "general", new File([], "x.pdf", { type: "application/pdf" }), 400, "EMPTY"],
  ] as const)("rejects: %s", async (_n, purpose, file, status, code) => {
    current.user = await makeUser("admin@t.test", true);
    const res = await POST(uploadRequest(purpose, file));
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
    expect(await db.storedFile.count()).toBe(0);
  });

  it("rejects an oversized upload (413), also before reading the body when Content-Length says so", async () => {
    current.user = await makeUser("admin@t.test", true);
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1).fill(0x25)], "big.pdf", {
      type: "application/pdf",
    });
    expect((await POST(uploadRequest("general", big))).status).toBe(413);
    const header = await POST(
      uploadRequest("general", pdfFile(), { "content-length": String(50 * 1024 * 1024) }),
    );
    expect(header.status).toBe(413);
    expect(await db.storedFile.count()).toBe(0);
  });
});

describe("GET /api/files/[id] (AC-7, AC-8)", () => {
  async function uploaded() {
    current.user = await makeUser("admin@t.test", true);
    const body = await (await POST(uploadRequest("general", pdfFile("Fletë ëçë.pdf")))).json();
    return body.data.id as string;
  }

  it("401 without a session", async () => {
    const id = await uploaded();
    current.user = null;
    expect((await download(id)).status).toBe(401);
  });

  it("streams the bytes with the hardening headers for the uploader", async () => {
    const id = await uploaded();
    const res = await download(id);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-length")).toBe(String(PDF.length));
    expect(res.headers.get("content-disposition")).toContain(
      "filename*=UTF-8''Flet%C3%AB%20%C3%AB%C3%A7%C3%AB.pdf",
    );
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; /);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-security-policy")).toBe("sandbox");
  });

  it("404 for another user's pending file, for unknown ids and for deleted files", async () => {
    const id = await uploaded();
    current.user = await makeUser("other@t.test", false);
    expect((await download(id)).status).toBe(404);
    expect((await download("missing")).status).toBe(404);
    await db.storedFile.update({ where: { id }, data: { deletedAt: new Date() } });
    current.user = await makeUser("admin2@t.test", true);
    expect((await download(id)).status).toBe(404);
  });

  it("lets a permission holder read an attached file", async () => {
    const id = await uploaded();
    await db.storedFile.update({
      where: { id },
      data: { status: "ATTACHED", entityType: "X", entityId: "1" },
    });
    current.user = await makeUser("admin3@t.test", true);
    expect((await download(id)).status).toBe(200);
  });
});

describe("no static exposure (AC-8)", () => {
  it("keeps the files directory outside the app's public folder", () => {
    const configured = resolve(process.env.FILES_DIR ?? "./.data/files");
    expect(configured.startsWith(resolve("public"))).toBe(false);
    expect(configured.startsWith(resolve("src"))).toBe(false);
  });
});
