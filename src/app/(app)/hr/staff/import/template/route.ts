import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { TEMPLATE_CSV } from "@/modules/hr";

export const dynamic = "force-dynamic";

// AC-12: the CSV template (UTF-8 with BOM so Excel shows the headers correctly).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!(await can(user, "hr.staff.write"))) return new Response(null, { status: 403 });
  return new Response(TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="staff-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
