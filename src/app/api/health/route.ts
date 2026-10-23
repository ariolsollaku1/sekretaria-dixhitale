import { db, isDatabaseReachable } from "@/lib/db";
import { version } from "@/lib/version";

export const dynamic = "force-dynamic";

// Unauthenticated probe: 200 when the app and its database are up, 503 otherwise (AC-8).
export async function GET() {
  const dbOk = await isDatabaseReachable(db);
  return Response.json(
    {
      status: dbOk ? "ok" : "error",
      db: dbOk ? "ok" : "error",
      version,
      time: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
