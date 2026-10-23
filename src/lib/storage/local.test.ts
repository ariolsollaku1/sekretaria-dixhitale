import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "./local";
import { KEY_PATTERN, StorageError, newStorageKey } from "./storage";

let dir: string;
let storage: LocalStorage;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "storage-"));
  storage = new LocalStorage(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const bytes = (s: string) => new TextEncoder().encode(s);
const streamToString = async (stream: ReadableStream<Uint8Array>) =>
  new TextDecoder().decode(new Uint8Array(await new Response(stream).arrayBuffer()));

describe("keys (AC-1)", () => {
  it("builds yyyy/mm/<id> keys from the UTC date", () => {
    const key = newStorageKey("clx3k2j9a0000abcd1234", new Date("2026-03-05T22:30:00Z"));
    expect(key).toBe("2026/03/clx3k2j9a0000abcd1234");
    expect(KEY_PATTERN.test(key)).toBe(true);
  });
  it("refuses ids that would not make a valid key", () => {
    expect(() => newStorageKey("../etc/passwd")).toThrow(StorageError);
    expect(() => newStorageKey("short")).toThrow(StorageError);
  });
});

describe("LocalStorage (AC-1)", () => {
  const key = "2026/03/clx3k2j9a0000abcd1234";

  it("round-trips put / exists / get / read / delete", async () => {
    expect(await storage.exists(key)).toBe(false);
    await storage.put(key, bytes("hello"));
    expect(await storage.exists(key)).toBe(true);
    expect(await streamToString(await storage.get(key))).toBe("hello");
    expect(new TextDecoder().decode(await storage.read(key))).toBe("hello");
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.delete(key)).resolves.toBeUndefined(); // idempotent
  });

  it("reports missing objects as NOT_FOUND", async () => {
    await expect(storage.get(key)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(storage.read(key)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([
    "../escape",
    "/etc/passwd",
    "2026/03/../../x",
    "2026/03/UPPERCASE12345",
    "2026/3/clx3k2j9a0000abcd1234",
    "",
    "2026/03/clx3k2j9a0000abcd1234/../x",
    "2026/03/a b c d e f g h",
  ])("rejects the key %j everywhere", async (bad) => {
    await expect(storage.put(bad, bytes("x"))).rejects.toMatchObject({ code: "INVALID_KEY" });
    await expect(storage.get(bad)).rejects.toMatchObject({ code: "INVALID_KEY" });
    await expect(storage.read(bad)).rejects.toMatchObject({ code: "INVALID_KEY" });
    await expect(storage.exists(bad)).rejects.toMatchObject({ code: "INVALID_KEY" });
    await expect(storage.delete(bad)).rejects.toMatchObject({ code: "INVALID_KEY" });
  });

  it("leaves no partial file when the write cannot complete", async () => {
    // A key whose directory is occupied by a regular file makes mkdir/write fail.
    await storage.put("2026/03/clx3k2j9a0000abcd1234", bytes("a"));
    const blocked = new LocalStorage(join(dir, "2026/03/clx3k2j9a0000abcd1234")); // root is a file
    await expect(blocked.put("2026/04/clx3k2j9a0000abcd9999", bytes("b"))).rejects.toMatchObject({
      code: "FAILED",
    });
    expect(await readdir(join(dir, "2026/03"))).toEqual(["clx3k2j9a0000abcd1234"]); // no *.tmp left
  });

  it("overwrites atomically on the same key", async () => {
    await storage.put(key, bytes("one"));
    await storage.put(key, bytes("two"));
    expect(new TextDecoder().decode(await storage.read(key))).toBe("two");
    expect((await readdir(join(dir, "2026/03"))).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
