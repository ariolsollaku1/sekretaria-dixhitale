import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from "fflate";
import { Prisma } from "@/generated/prisma/client";
import { createAuditor } from "@/lib/audit";
import { db, withTransaction, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getStorage } from "@/lib/storage";
import type { Storage } from "@/lib/storage/storage";
import { version } from "@/lib/version";
import { csvRow } from "./csv";
import { EXPORTS_FOLDER, KEEP_EXPORTS } from "./constants";
import { buildManifest, README, zipFilePath, type FileEntry, type TableEntry } from "./manifest";
import { selectPurge } from "./retention";
import { exportableTables } from "./tables";

const BATCH = 500;
const SNAPSHOT_TIMEOUT_MS = 2 * 3_600_000;

export type ExportDeps = { exportsDir?: string; storage?: Storage; now?: Date };

export const exportsDir = (filesDir: string = env.FILES_DIR) =>
  join(resolve(filesDir), EXPORTS_FOLDER);

/** Short, non-revealing failure code for the run log (never an error message). */
export function failureCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (typeof code === "string" && /^E[A-Z]+$/.test(code)) return "STORAGE";
  if (error instanceof Prisma.PrismaClientKnownRequestError) return "DATABASE";
  return "INTERNAL";
}

const quoteIdent = (name: string) => `"${name.replaceAll('"', '""')}"`;
const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** Streams chunks into a file while hashing them; writes are chained so memory stays bounded. */
class FileSink {
  private chain: Promise<unknown> = Promise.resolve();
  private readonly hash = createHash("sha256");
  size = 0;
  private constructor(private readonly handle: Awaited<ReturnType<typeof open>>) {}
  static async create(path: string) {
    return new FileSink(await open(path, "wx", 0o600));
  }
  write(chunk: Uint8Array) {
    this.hash.update(chunk);
    this.size += chunk.length;
    this.chain = this.chain.then(() => this.handle.write(chunk));
  }
  flush() {
    return this.chain;
  }
  async close() {
    await this.chain;
    await this.handle.sync();
    await this.handle.close();
    return this.hash.digest("hex");
  }
  async abort() {
    await this.chain.catch(() => undefined);
    await this.handle.close().catch(() => undefined);
  }
}

type Row = Record<string, string | null>;

/** Pages through a table by physical row order, so no key or sort column is needed. */
async function* scan(tx: Tx, table: string, select: string): AsyncGenerator<Row[]> {
  let last = "(0,0)";
  for (;;) {
    const rows = await tx.$queryRawUnsafe<Row[]>(
      `SELECT t.ctid::text AS _ctid, ${select} FROM ${quoteIdent(table)} t
       WHERE t.ctid > $1::tid ORDER BY t.ctid LIMIT ${BATCH}`,
      last,
    );
    if (rows.length === 0) return;
    yield rows;
    last = rows[rows.length - 1]!._ctid as string;
    if (rows.length < BATCH) return;
  }
}

/** One export entry: deflated, hashed, pushed in pieces. */
async function addStream(
  zip: Zip,
  sink: FileSink,
  name: string,
  pieces: AsyncIterable<string>,
): Promise<{ sha256: string }> {
  const entry = new ZipDeflate(name, { level: 6 });
  zip.add(entry);
  const hash = createHash("sha256");
  for await (const text of pieces) {
    if (text.length === 0) continue;
    const bytes = strToU8(text);
    hash.update(bytes);
    entry.push(bytes);
    await sink.flush();
  }
  entry.push(new Uint8Array(0), true);
  await sink.flush();
  return { sha256: hash.digest("hex") };
}

async function* csvPieces(tx: Tx, table: string, columns: string[], counter: { rows: number }) {
  yield csvRow(columns);
  const select = columns.map((c, i) => `t.${quoteIdent(c)}::text AS c${i}`).join(", ");
  for await (const rows of scan(tx, table, select)) {
    counter.rows += rows.length;
    yield rows.map((r) => csvRow(columns.map((_, i) => r[`c${i}`] ?? null))).join("");
  }
}

async function* jsonlPieces(tx: Tx, table: string) {
  for await (const rows of scan(tx, table, "row_to_json(t)::text AS j")) {
    yield rows.map((r) => `${r.j}\n`).join("");
  }
}

type StoredFileRow = {
  id: string;
  storageKey: string;
  fileName: string;
  size: number;
  sha256: string;
};

/** AC-1..AC-4: writes the ZIP into `exportsDir` and returns what the run log records. */
async function writeExport(path: string, deps: ExportDeps, now: Date) {
  const storage = deps.storage ?? getStorage();
  const sink = await FileSink.create(path);
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else sink.write(chunk);
  });
  try {
    const tables: TableEntry[] = [];
    let stored: StoredFileRow[] = [];
    let rowCount = 0;

    // AC-2: one repeatable-read snapshot for every table and the file list.
    await withTransaction(
      async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
        await tx.$executeRawUnsafe("SET LOCAL DateStyle = 'ISO, YMD'");
        const found = await tx.$queryRaw<{ table_name: string }[]>`
          SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
        for (const table of exportableTables(found.map((r) => r.table_name))) {
          const cols = await tx.$queryRaw<{ column_name: string }[]>`
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ${table} ORDER BY ordinal_position`;
          const counter = { rows: 0 };
          const csv = await addStream(
            zip,
            sink,
            `csv/${table}.csv`,
            csvPieces(
              tx,
              table,
              cols.map((c) => c.column_name),
              counter,
            ),
          );
          const jsonl = await addStream(zip, sink, `jsonl/${table}.jsonl`, jsonlPieces(tx, table));
          tables.push({
            table,
            rows: counter.rows,
            csvSha256: csv.sha256,
            jsonlSha256: jsonl.sha256,
          });
          rowCount += counter.rows;
        }
        stored = await tx.storedFile.findMany({
          where: { deletedAt: null },
          select: { id: true, storageKey: true, fileName: true, size: true, sha256: true },
          orderBy: { createdAt: "asc" },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: SNAPSHOT_TIMEOUT_MS,
      },
    );

    // AC-4: stored files, each checked against its recorded hash; bad ones are listed, not packed.
    const files: FileEntry[] = [];
    for (const file of stored) {
      const entry: FileEntry = {
        id: file.id,
        path: null,
        fileName: file.fileName,
        size: file.size,
        sha256: file.sha256,
        status: "missing",
      };
      try {
        const bytes = await storage.read(file.storageKey);
        if (sha256(bytes) === file.sha256) {
          entry.path = zipFilePath(file.id, file.fileName);
          entry.status = "ok";
          const item = new ZipPassThrough(entry.path);
          zip.add(item);
          item.push(bytes, true);
          await sink.flush();
        } else entry.status = "corrupt";
      } catch {
        entry.status = "missing";
      }
      files.push(entry);
    }

    const manifest = buildManifest({ generatedAt: now, appVersion: version, tables, files });
    const manifestEntry = new ZipDeflate("manifest.json");
    zip.add(manifestEntry);
    manifestEntry.push(strToU8(JSON.stringify(manifest, null, 2)), true);
    const readme = new ZipDeflate("README.txt");
    zip.add(readme);
    readme.push(strToU8(README), true);
    zip.end();
    await sink.flush();
    if (zipError) throw zipError;

    const hash = await sink.close();
    return {
      sha256: hash,
      size: sink.size,
      tables: tables.length,
      rows: rowCount,
      files: files.filter((f) => f.status === "ok").length,
      problems: files.filter((f) => f.status !== "ok").length,
    };
  } catch (error) {
    await sink.abort();
    throw error;
  }
}

/** Marks runs left `RUNNING` by a crash as failed, so the page never shows a ghost. */
export async function failInterrupted(kind: "EXPORT" | "INTEGRITY", exceptId: string) {
  await db.backupRun.updateMany({
    where: { kind, status: "RUNNING", id: { not: exceptId } },
    data: { status: "FAILED", errorCode: "INTERRUPTED", finishedAt: new Date() },
  });
}

/** AC-6: keep the newest successful exports, delete the rest from disk (rows stay). */
export async function applyRetention(dir: string, keep: number = KEEP_EXPORTS) {
  const runs = await db.backupRun.findMany({
    where: { kind: "EXPORT", status: "SUCCEEDED", purgedAt: null, fileName: { not: null } },
    select: { id: true, startedAt: true, fileName: true },
  });
  const purge = selectPurge(runs, keep);
  for (const run of purge) {
    await rm(join(dir, run.fileName as string), { force: true });
    await db.backupRun.update({ where: { id: run.id }, data: { purgedAt: new Date() } });
  }
  return purge.length;
}

/**
 * AC-1..AC-6: runs one export for an existing `RUNNING` run row. On failure the run is marked
 * failed with a short code, the partial file is removed and the error is rethrown.
 */
export async function runExport(runId: string, deps: ExportDeps = {}) {
  const now = deps.now ?? new Date();
  const dir = deps.exportsDir ?? exportsDir();
  const run = await db.backupRun.findUniqueOrThrow({ where: { id: runId } });
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-");
  const fileName = `export-${stamp}-${randomBytes(4).toString("hex")}.zip`;
  const finalPath = join(dir, fileName);
  const partPath = `${finalPath}.part`;
  const actor = run.requestedById
    ? ({ type: "USER", userId: run.requestedById } as const)
    : ({ type: "SYSTEM" } as const);
  try {
    await failInterrupted("EXPORT", runId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const result = await writeExport(partPath, deps, now);
    await rename(partPath, finalPath);
    await db.backupRun.update({
      where: { id: runId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        tableCount: result.tables,
        rowCount: result.rows,
        fileCount: result.files,
        problemCount: result.problems,
        sizeBytes: BigInt(result.size),
        sha256: result.sha256,
        fileName,
      },
    });
    await createAuditor(
      db,
      actor,
    )({
      action: "plt.backup.export",
      entityType: "BackupRun",
      entityId: runId,
      after: { tables: result.tables, rows: result.rows, files: result.files, size: result.size },
    });
    const purged = await applyRetention(dir);
    logger.info("export finished", { runId, ...result, purged });
    return result;
  } catch (error) {
    await rm(partPath, { force: true }).catch(() => undefined);
    await rm(finalPath, { force: true }).catch(() => undefined);
    const code = failureCode(error);
    await db.backupRun
      .update({
        where: { id: runId },
        data: { status: "FAILED", errorCode: code, finishedAt: new Date() },
      })
      .catch(() => undefined);
    logger.error("export failed", { runId, code });
    throw error;
  }
}

/** Creates the `RUNNING` row for a run; the job (or a test) then calls `runExport`. */
export function startRun(kind: "EXPORT" | "INTEGRITY", requestedById: string | null) {
  return db.backupRun.create({ data: { kind, requestedById } });
}
