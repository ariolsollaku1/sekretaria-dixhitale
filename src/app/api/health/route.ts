import { version } from "@/lib/version";

export const dynamic = "force-dynamic";

// Unauthenticated liveness probe. PLT-03 adds a database check.
export function GET() {
  return Response.json(
    { status: "ok", version, time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
