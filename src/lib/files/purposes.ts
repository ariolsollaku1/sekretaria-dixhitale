import type { Permission } from "@/lib/authz/types";
import { MIME } from "./mime";

/** What a reader of a file looks like to a purpose's access rule. */
export type FileView = {
  id: string;
  purpose: string;
  status: "PENDING" | "ATTACHED";
  entityType: string | null;
  entityId: string | null;
  uploadedById: string;
};

export type FilePurpose = {
  /** kebab-case id, stored on every file, e.g. "syllabus". */
  id: string;
  /** Needed to upload with this purpose. */
  uploadPermission: Permission;
  maxBytes: number;
  mimeTypes: readonly string[];
  /**
   * Who may download an ATTACHED file. Usually a permission check, often scoped to the record the
   * file is attached to (entityType/entityId). The uploader may always read their own PENDING file.
   */
  canRead(user: { id: string }, file: FileView): Promise<boolean>;
};

/** Q-27 working assumption; every purpose overrides what it needs. */
export const DEFAULT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: [MIME.pdf, MIME.jpeg, MIME.png] as readonly string[],
};
export const HARD_MAX_BYTES = 100 * 1024 * 1024;

const purposes = new Map<string, FilePurpose>();

export function registerFilePurpose(purpose: FilePurpose): void {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(purpose.id))
    throw new Error(`Invalid file purpose id "${purpose.id}"`);
  if (purposes.has(purpose.id)) throw new Error(`Duplicate file purpose "${purpose.id}"`);
  if (!(purpose.maxBytes > 0) || purpose.maxBytes > HARD_MAX_BYTES) {
    throw new Error(
      `File purpose "${purpose.id}": maxBytes must be between 1 and ${HARD_MAX_BYTES}`,
    );
  }
  if (purpose.mimeTypes.length === 0)
    throw new Error(`File purpose "${purpose.id}" allows no types`);
  purposes.set(purpose.id, purpose);
}

export function getFilePurpose(id: string): FilePurpose | undefined {
  return purposes.get(id);
}

export function resetFilePurposes(): void {
  purposes.clear();
}
