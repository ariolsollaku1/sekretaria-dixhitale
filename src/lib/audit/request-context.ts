import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

export type RequestContext = { requestId: string; ip: string | null; userAgent: string | null };

/** Request id (reused from the proxy header when present), client IP and user agent (AC-1). */
export async function getRequestContext(): Promise<RequestContext> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      requestId: h.get("x-request-id") ?? randomUUID(),
      ip: forwarded || h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    };
  } catch {
    // Called outside a request (seed, job, test): there is no client to describe.
    return { requestId: randomUUID(), ip: null, userAgent: null };
  }
}
