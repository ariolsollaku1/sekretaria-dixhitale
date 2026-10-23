import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { FileError, storeUpload, type FileErrorCode } from "@/lib/files/files.service";
import { registerAllPurposes } from "@/lib/files/all";
import { getFilePurpose } from "@/lib/files/purposes";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const STATUS: Record<FileErrorCode, number> = {
  UNKNOWN_PURPOSE: 400,
  FORBIDDEN: 403,
  TOO_LARGE: 413,
  EMPTY: 400,
  UNSUPPORTED_TYPE: 415,
  TYPE_MISMATCH: 415,
  NOT_FOUND: 404,
  ALREADY_ATTACHED: 409,
};

const fail = (code: FileErrorCode | "UNAUTHENTICATED" | "BAD_REQUEST", status: number) =>
  Response.json(
    { ok: false, error: { code } },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// Multipart upload: POST /api/files?purpose=<id> with a `file` field. The purpose is in the query
// so permission and size can be checked before the body is read (conventions: size limit, MIME
// allow-list, stored outside the web root, permission-checked).
export async function POST(request: Request) {
  registerAllPurposes();
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHENTICATED", 401);

  const purpose = getFilePurpose(new URL(request.url).searchParams.get("purpose") ?? "");
  if (!purpose) return fail("UNKNOWN_PURPOSE", 400);
  if (!(await can(user, purpose.uploadPermission))) return fail("FORBIDDEN", 403);

  // Reject obviously oversized bodies without reading them (1 MB allows for multipart framing).
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > purpose.maxBytes + 1024 * 1024)
    return fail("TOO_LARGE", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("BAD_REQUEST", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("BAD_REQUEST", 400);

  try {
    const result = await storeUpload({
      user,
      purpose: purpose.id,
      fileName: file.name,
      declaredType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return Response.json(
      {
        ok: true,
        data: {
          id: result.id,
          fileName: result.fileName,
          mimeType: result.mimeType,
          size: result.size,
        },
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof FileError) return fail(error.code, STATUS[error.code]);
    logger.error("upload failed", { purpose: purpose.id, error: (error as Error).name });
    return Response.json({ ok: false, error: { code: "INTERNAL" } }, { status: 500 });
  }
}
