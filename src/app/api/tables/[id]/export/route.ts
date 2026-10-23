import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/authz/check";
import { logger } from "@/lib/logger";
import { getTable } from "@/lib/tables/define";
import { ExportTooLargeError, runExport, type ExportFormat } from "@/lib/tables/run";
import "@/lib/tables/all";

export const dynamic = "force-dynamic";

const fail = (code: string, status: number, extra: Record<string, unknown> = {}) =>
  Response.json(
    { ok: false, error: { code, ...extra } },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// AC-7..AC-10: GET /api/tables/<id>/export?format=xlsx|csv&<the list's own query parameters>
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", 401);

  const { id } = await params;
  const def = getTable(id);
  if (!def) return fail("NOT_FOUND", 404);

  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (format !== "xlsx" && format !== "csv") return fail("BAD_FORMAT", 400);

  try {
    const t = await getTranslations();
    const result = await runExport(
      def,
      Object.fromEntries(url.searchParams),
      user,
      format as ExportFormat,
      (key) => t(key as never),
    );
    return new Response(result.bytes as BodyInit, {
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return fail("FORBIDDEN", 403);
    if (error instanceof ExportTooLargeError) return fail("TOO_LARGE", 413, { total: error.total });
    logger.error("export failed", { table: id, error: (error as Error).name });
    return fail("INTERNAL", 500);
  }
}
