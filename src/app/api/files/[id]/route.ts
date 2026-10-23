import { getCurrentUser } from "@/lib/auth";
import { openFile } from "@/lib/files/files.service";
import { contentDisposition } from "@/lib/files/mime";
import { registerPlatformPurposes } from "@/lib/files/platform-purposes";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// The only way to read a stored file (ADR-0010): never served statically. Unknown, deleted and
// unreadable files all answer 404 so ids reveal nothing.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  registerPlatformPurposes();
  const user = await getCurrentUser();
  if (!user)
    return Response.json({ ok: false, error: { code: "UNAUTHENTICATED" } }, { status: 401 });

  const { id } = await params;
  try {
    const opened = await openFile(user, id);
    if (!opened) return Response.json({ ok: false, error: { code: "NOT_FOUND" } }, { status: 404 });
    return new Response(opened.stream, {
      headers: {
        "Content-Type": opened.file.mimeType,
        "Content-Length": String(opened.file.size),
        "Content-Disposition": contentDisposition(opened.file.fileName),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    logger.error("download failed", { fileId: id, error: (error as Error).name });
    return Response.json({ ok: false, error: { code: "INTERNAL" } }, { status: 500 });
  }
}
