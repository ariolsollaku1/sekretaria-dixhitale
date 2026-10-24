"use server";

import "../permissions";
import { getRequestContext } from "@/lib/audit/request-context";
import * as applications from "./application.service";

const asRecord = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

// AC-3..AC-6, AC-10: candidates have no account (Q-19), so these are plain public server actions.
// Every input is validated by the service; the rate limit is per IP hash.

export async function submitApplicationAction(raw: unknown) {
  const request = await getRequestContext();
  return applications.submitApplication(asRecord(raw), request.ip);
}

export async function requestLinkAction(raw: unknown) {
  const request = await getRequestContext();
  return applications.requestNewLink(asRecord(raw), request.ip);
}
