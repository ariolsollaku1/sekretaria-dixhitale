import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { getConverter, PdfUnavailableError } from "@/lib/documents/gotenberg";
import { renderDocument } from "@/lib/documents/issue.service";
import { registerDocumentPurposes } from "@/lib/documents/purposes";
import { getDocumentType } from "@/lib/documents/types";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// AC-10: a template rendered with its type's sample data and a placeholder number. Nothing is
// stored and no number is used.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  registerDocumentPurposes();
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ ok: false, error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  if (!(await can(user, "plt.document.manage")))
    return Response.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  const { id } = await params;
  const template = await db.documentTemplate.findUnique({ where: { id } });
  const def = template && getDocumentType(template.type);
  if (!template || !def)
    return Response.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
  try {
    const year = new Date().getUTCFullYear();
    const html = await renderDocument(template.html, def.sampleData, {
      number: `${def.prefix}-${year}-00000`,
      issuedDate: new Date().toISOString().slice(0, 10),
      verifyCode: "preview-not-a-real-code",
    });
    const pdf = await getConverter()(html);
    return new Response(pdf as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfUnavailableError)
      return Response.json({ ok: false, error: { code: "UNAVAILABLE" } }, { status: 503 });
    logger.error("document preview failed", { templateId: id, error: (error as Error).name });
    return Response.json({ ok: false, error: { code: "INTERNAL" } }, { status: 500 });
  }
}
