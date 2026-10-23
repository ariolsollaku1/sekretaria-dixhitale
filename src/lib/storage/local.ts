import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { KEY_PATTERN, StorageError, type Storage } from "./storage";

/** Local filesystem storage rooted at `rootDir` (the `files` Docker volume in production). */
export class LocalStorage implements Storage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  /** The only way a path is made: validated key, then a containment check as a second guard. */
  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new StorageError("INVALID_KEY", "Invalid storage key");
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep))
      throw new StorageError("INVALID_KEY", "Invalid storage key");
    return full;
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const target = this.pathFor(key);
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(temp, data, { flag: "wx", mode: 0o600 });
      await rename(temp, target); // atomic on the same filesystem
    } catch (error) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw new StorageError(
        "FAILED",
        `Could not store object: ${(error as NodeJS.ErrnoException).code ?? "error"}`,
      );
    }
  }

  async get(key: string): Promise<ReadableStream<Uint8Array>> {
    const path = this.pathFor(key);
    if (!(await this.exists(key))) throw new StorageError("NOT_FOUND", "Object not found");
    return Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>;
  }

  async read(key: string): Promise<Uint8Array> {
    const path = this.pathFor(key);
    try {
      return new Uint8Array(await readFile(path));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        throw new StorageError("NOT_FOUND", "Object not found");
      throw new StorageError("FAILED", "Could not read object");
    }
  }

  async exists(key: string): Promise<boolean> {
    const path = this.pathFor(key);
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
