import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { createAuditor, getRequestContext } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import "@/lib/authz/permissions";
import { FILE_NAME_PATTERN } from "@/lib/backup/constants";
import { exportsDir } from "@/lib/backup/export.service";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const json = (code: string, status: number) =>
  Response.json(
    { ok: false, error: { code } },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// PLT-13 AC-10: streams a retained export. Sysadmin only (plt.backup.manage); unknown, failed,
// purged and unreadable runs all answer 404. Every download is audited.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json("UNAUTHENTICATED", 401);
  if (!(await can(user, "plt.backup.manage"))) return json("FORBIDDEN", 403);

  const { id } = await params;
  try {
    const run = await db.backupRun.findUnique({ where: { id } });
    if (
      !run ||
      run.kind !== "EXPORT" ||
      run.status !== "SUCCEEDED" ||
      run.purgedAt !== null ||
      !run.fileName ||
      !FILE_NAME_PATTERN.test(run.fileName)
    )
      return json("NOT_FOUND", 404);
    const path = join(exportsDir(), run.fileName);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) {
      logger.error("export row without file", { runId: id });
      return json("NOT_FOUND", 404);
    }
    await createAuditor(
      db,
      { type: "USER", userId: user.id },
      await getRequestContext(),
    )({
      action: "plt.backup.download",
      entityType: "BackupRun",
      entityId: id,
    });
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Length": String(info.size),
        "Content-Disposition": `attachment; filename="${run.fileName}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error("export download failed", { runId: id, error: (error as Error).name });
    return json("INTERNAL", 500);
  }
}
