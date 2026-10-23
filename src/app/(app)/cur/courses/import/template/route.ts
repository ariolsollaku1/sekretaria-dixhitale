import { getCurrentUser } from "@/lib/auth";
import { TEMPLATE_CSV } from "@/modules/cur";
import { writableDepartments } from "@/modules/cur";

export const dynamic = "force-dynamic";

// AC-11: the CSV template (UTF-8 with BOM so Excel shows the headers correctly).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if ((await writableDepartments(user)).length === 0) return new Response(null, { status: 403 });
  return new Response(TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="courses-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
