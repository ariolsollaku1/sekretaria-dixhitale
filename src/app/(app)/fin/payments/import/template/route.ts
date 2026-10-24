import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/authz/guard";
import { PAYMENT_TEMPLATE_CSV } from "@/modules/fin";

export const dynamic = "force-dynamic";

// FIN-02 AC-7: the CSV template (UTF-8 with BOM so Excel shows the headers correctly).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!(await can(user, "fin.payment.write"))) return new Response(null, { status: 403 });
  return new Response(PAYMENT_TEMPLATE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="payments-template.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
