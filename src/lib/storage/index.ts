import "server-only";
import { env } from "@/lib/env";
import { LocalStorage } from "./local";
import type { Storage } from "./storage";

let instance: Storage | undefined;

/** The configured storage (`FILES_DIR`); `setStorage` swaps it in tests. */
export function getStorage(): Storage {
  instance ??= new LocalStorage(env.FILES_DIR);
  return instance;
}

export function setStorage(storage: Storage | undefined): void {
  instance = storage;
}

export { LocalStorage } from "./local";
export { StorageError, newStorageKey, type Storage } from "./storage";
