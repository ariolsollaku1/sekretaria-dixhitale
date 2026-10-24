import { getRequestContext } from "@/lib/audit/request-context";
import { uploadDocument, type UploadResult } from "@/modules/adm";

export const dynamic = "force-dynamic";

const STATUS: Record<Extract<UploadResult, { ok: false }>["code"], number> = {
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  CLOSED: 409,
  UNKNOWN_DOCUMENT: 400,
  EMPTY: 400,
  TOO_LARGE: 413,
  UNSUPPORTED_TYPE: 415,
  TYPE_MISMATCH: 415,
};
const MAX_BODY = 11 * 1024 * 1024; // 10 MB file + multipart framing

// AC-9: a candidate uploads the file of one document type through the private link. No session:
// the token is the credential. Size, type and rate limit are checked before anything is stored.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY)
    return Response.json({ ok: false, code: "TOO_LARGE" }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, code: "EMPTY" }, { status: 400 });
  }
  const file = form.get("file");
  const key = form.get("key");
  if (!(file instanceof File) || typeof key !== "string")
    return Response.json({ ok: false, code: "EMPTY" }, { status: 400 });
  const { ip } = await getRequestContext();
  const result = await uploadDocument(
    token,
    key,
    { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) },
    ip,
  );
  if (result.ok) return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  return Response.json(
    { ok: false, code: result.code },
    { status: STATUS[result.code], headers: { "Cache-Control": "no-store" } },
  );
}
