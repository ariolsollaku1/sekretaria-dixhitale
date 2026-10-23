import { beforeEach, describe, expect, it } from "vitest";
import { MIME } from "./mime";
import {
  HARD_MAX_BYTES,
  getFilePurpose,
  registerFilePurpose,
  resetFilePurposes,
  type FilePurpose,
} from "./purposes";

const purpose = (over: Partial<FilePurpose> = {}): FilePurpose => ({
  id: "syllabus",
  uploadPermission: "cur.syllabus.write",
  maxBytes: 1024,
  mimeTypes: [MIME.pdf],
  canRead: async () => true,
  ...over,
});

beforeEach(resetFilePurposes);

describe("file purpose registry (AC-2)", () => {
  it("registers and finds purposes; unregistered ones are undefined", () => {
    registerFilePurpose(purpose());
    expect(getFilePurpose("syllabus")?.maxBytes).toBe(1024);
    expect(getFilePurpose("nope")).toBeUndefined();
  });
  it("rejects bad ids, duplicates, silly limits and empty allow-lists", () => {
    expect(() => registerFilePurpose(purpose({ id: "Bad Id" }))).toThrow(/Invalid file purpose/);
    registerFilePurpose(purpose());
    expect(() => registerFilePurpose(purpose())).toThrow(/Duplicate/);
    expect(() => registerFilePurpose(purpose({ id: "big", maxBytes: HARD_MAX_BYTES + 1 }))).toThrow(
      /maxBytes/,
    );
    expect(() => registerFilePurpose(purpose({ id: "zero", maxBytes: 0 }))).toThrow(/maxBytes/);
    expect(() => registerFilePurpose(purpose({ id: "none", mimeTypes: [] }))).toThrow(
      /allows no types/,
    );
  });
});
