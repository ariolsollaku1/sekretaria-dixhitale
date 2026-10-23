import { feedEvents, renderCalendar, userForToken } from "@/modules/cal";

export const dynamic = "force-dynamic";

// AC-12: a subscribed calendar cannot log in, so the secret link is the credential. Unknown,
// revoked and malformed tokens all answer 404 and nothing else about them.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.endsWith(".ics") ? raw.slice(0, -4) : raw;
  const user = await userForToken(token);
  if (!user) return new Response("Not found", { status: 404 });

  const events = await feedEvents(user.id);
  const body = renderCalendar(events, "LOGOS — Kalendari akademik", new Date());
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'inline; filename="logos-calendar.ics"',
    },
  });
}
