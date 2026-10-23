import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TIMETABLE_TEMPLATE_CSV } from "@/modules/cal";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!(await can(user, "cal.timetable.write"))) return new Response(null, { status: 403 });
  return new Response(TIMETABLE_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="timetable-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
