// ADR-0010: files are addressed by opaque keys; callers never build paths. An S3-compatible
// implementation can replace LocalStorage without touching callers.
export type StorageErrorCode = "INVALID_KEY" | "NOT_FOUND" | "FAILED";

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

export interface Storage {
  /** Stores the bytes under `key` (atomically: a failed write leaves nothing behind). */
  put(key: string, data: Uint8Array): Promise<void>;
  /** Streams the object; rejects with StorageError NOT_FOUND when absent. */
  get(key: string): Promise<ReadableStream<Uint8Array>>;
  /** Reads the whole object (for hashing / verification). */
  read(key: string): Promise<Uint8Array>;
  exists(key: string): Promise<boolean>;
  /** Idempotent: deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
}

/** Key format `yyyy/mm/<id>` where <id> is a cuid-like token. */
export const KEY_PATTERN = /^\d{4}\/\d{2}\/[a-z0-9]{8,40}$/;

export function newStorageKey(id: string, at: Date = new Date()): string {
  const yyyy = String(at.getUTCFullYear());
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0");
  const key = `${yyyy}/${mm}/${id}`;
  if (!KEY_PATTERN.test(key)) throw new StorageError("INVALID_KEY", "Invalid storage key");
  return key;
}
