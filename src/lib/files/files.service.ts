import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { ActionContext } from "@/lib/actions";
import { createAuditor, getRequestContext } from "@/lib/audit";
import { can as canDefault } from "@/lib/authz/guard";
import { db, withTransaction } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import { StorageError, newStorageKey, type Storage } from "@/lib/storage/storage";
import { checkMime, sanitizeFileName } from "./mime";
import { getFilePurpose, type FilePurpose, type FileView } from "./purposes";

export type FileErrorCode =
  | "UNKNOWN_PURPOSE"
  | "FORBIDDEN"
  | "TOO_LARGE"
  | "EMPTY"
  | "UNSUPPORTED_TYPE"
  | "TYPE_MISMATCH"
  | "NOT_FOUND"
  | "ALREADY_ATTACHED";

export class FileError extends Error {
  constructor(
    readonly code: FileErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "FileError";
  }
}

type Deps = {
  storage: Storage;
  can: (user: { id: string }, permission: string) => Promise<boolean>;
};
const defaults = (): Deps => ({ storage: getStorage(), can: canDefault });

export type UploadInput = {
  user: { id: string };
  purpose: string;
  fileName: string;
  declaredType?: string | null;
  bytes: Uint8Array;
};

export type UploadResult = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  sha256: string;
};

/** AC-3/4/5/6: validate, hash, store the bytes, then the row + audit in one transaction. */
export async function storeUpload(
  input: UploadInput,
  deps: Deps = defaults(),
): Promise<UploadResult> {
  const purpose = getFilePurpose(input.purpose);
  if (!purpose) throw new FileError("UNKNOWN_PURPOSE");
  if (!(await deps.can(input.user, purpose.uploadPermission))) throw new FileError("FORBIDDEN");
  if (input.bytes.length > purpose.maxBytes) throw new FileError("TOO_LARGE");
  const checked = checkMime(input.bytes, input.declaredType, purpose.mimeTypes);
  if (!checked.ok) throw new FileError(checked.reason);

  const id = randomBytes(12).toString("hex"); // 24 lowercase hex chars: a valid storage key id
  const storageKey = newStorageKey(id);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const fileName = sanitizeFileName(input.fileName);
  const request = await getRequestContext();

  await deps.storage.put(storageKey, input.bytes);
  try {
    await withTransaction(async (tx) => {
      await tx.storedFile.create({
        data: {
          id,
          storageKey,
          purpose: purpose.id,
          fileName,
          mimeType: checked.mimeType,
          size: input.bytes.length,
          sha256,
          uploadedById: input.user.id,
        },
      });
      await createAuditor(
        tx,
        { type: "USER", userId: input.user.id },
        request,
      )({
        action: "plt.file.upload",
        entityType: "StoredFile",
        entityId: id,
        before: null,
        after: {
          purpose: purpose.id,
          fileName,
          mimeType: checked.mimeType,
          size: input.bytes.length,
          sha256,
        },
      });
    });
  } catch (error) {
    // The row did not commit: remove the object again so it is not an orphan on the volume.
    await deps.storage
      .delete(storageKey)
      .catch(() => logger.error("orphan object after failed upload", { fileId: id }));
    throw error;
  }
  return { id, fileName, mimeType: checked.mimeType, size: input.bytes.length, sha256 };
}

type AttachCtx = Pick<ActionContext, "db" | "audit">;

/** AC-9: bind a pending file to a record, inside the caller's transaction. One winner per file. */
export async function attachFile(
  ctx: AttachCtx,
  fileId: string,
  target: { entityType: string; entityId: string },
): Promise<void> {
  const result = await ctx.db.storedFile.updateMany({
    where: { id: fileId, status: "PENDING", deletedAt: null },
    data: {
      status: "ATTACHED",
      entityType: target.entityType,
      entityId: target.entityId,
      attachedAt: new Date(),
    },
  });
  if (result.count === 0) {
    const existing = await ctx.db.storedFile.findUnique({
      where: { id: fileId },
      select: { status: true, deletedAt: true },
    });
    throw new FileError(existing && !existing.deletedAt ? "ALREADY_ATTACHED" : "NOT_FOUND");
  }
  await ctx.audit({
    action: "plt.file.attach",
    entityType: "StoredFile",
    entityId: fileId,
    before: { status: "PENDING" },
    after: { status: "ATTACHED", entityType: target.entityType, entityId: target.entityId },
  });
}

/** AC-10: soft delete; the bytes stay (no hard deletes of business data). */
export async function removeFile(
  ctx: Pick<ActionContext, "db" | "audit" | "user">,
  fileId: string,
  reason: string,
): Promise<void> {
  const result = await ctx.db.storedFile.updateMany({
    where: { id: fileId, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: ctx.user.id },
  });
  if (result.count === 0) throw new FileError("NOT_FOUND");
  await ctx.audit({
    action: "plt.file.remove",
    entityType: "StoredFile",
    entityId: fileId,
    before: { deleted: false },
    after: { deleted: true },
    reason,
  });
}

/** AC-7: the stream and metadata if this user may read the file, else null (callers answer 404). */
export async function openFile(
  user: { id: string },
  fileId: string,
  deps: Pick<Deps, "storage"> = { storage: getStorage() },
) {
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file || file.deletedAt) return null;
  const view: FileView = {
    id: file.id,
    purpose: file.purpose,
    status: file.status,
    entityType: file.entityType,
    entityId: file.entityId,
    uploadedById: file.uploadedById,
  };
  const purpose: FilePurpose | undefined = getFilePurpose(file.purpose);
  const ownPending = file.status === "PENDING" && file.uploadedById === user.id;
  const allowed =
    ownPending || (!!purpose && file.status === "ATTACHED" && (await purpose.canRead(user, view)));
  if (!allowed) return null;
  try {
    return { file, stream: await deps.storage.get(file.storageKey) };
  } catch (error) {
    if (error instanceof StorageError && error.code === "NOT_FOUND") {
      logger.error("file row without object", { fileId });
      return null;
    }
    throw error;
  }
}

/** AC-13: do the stored bytes still match the recorded SHA-256? */
export async function verifyFile(
  fileId: string,
  deps: Pick<Deps, "storage"> = { storage: getStorage() },
): Promise<boolean> {
  const file = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!file) throw new FileError("NOT_FOUND");
  try {
    return (
      createHash("sha256")
        .update(await deps.storage.read(file.storageKey))
        .digest("hex") === file.sha256
    );
  } catch (error) {
    if (error instanceof StorageError && error.code === "NOT_FOUND") return false;
    throw error;
  }
}

/** AC-11: purge PENDING files older than the threshold (default 24 h). PLT-12 schedules this. */
export async function cleanupOrphans(
  options: { olderThan?: Date; now?: Date } = {},
  deps: Pick<Deps, "storage"> = { storage: getStorage() },
): Promise<number> {
  const now = options.now ?? new Date();
  const cutoff = options.olderThan ?? new Date(now.getTime() - 24 * 3_600_000);
  const stale = await db.storedFile.findMany({
    where: { status: "PENDING", deletedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
  });
  let removed = 0;
  for (const file of stale) {
    try {
      // Claim the row first: if the file was attached in the meantime nothing matches and its
      // bytes are untouched. Only then delete the object.
      const claimed = await db.storedFile.deleteMany({ where: { id: file.id, status: "PENDING" } });
      if (claimed.count === 0) continue;
      removed += 1;
      await deps.storage
        .delete(file.storageKey)
        .catch(() => logger.error("orphan object left on the volume", { fileId: file.id }));
    } catch {
      logger.error("orphan cleanup failed", { fileId: file.id });
    }
  }
  if (removed > 0) {
    await createAuditor(db, { type: "SYSTEM" })({
      action: "plt.file.cleanup",
      entityType: "StoredFile",
      after: { removed },
    });
  }
  return removed;
}
