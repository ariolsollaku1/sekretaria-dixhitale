import "server-only";
import type { ActionContext } from "@/lib/actions";

// IAM-02 (AC-6, AC-7): modules that react to employment starting or ending register a handler.
// Handlers run inside the transaction of the change, so a failing handler rolls it back.
export type StaffActiveEvent = { staffId: string; personId: string; active: boolean };

export type StaffActiveHandler = (ctx: ActionContext, event: StaffActiveEvent) => Promise<void>;

const handlers = new Map<string, StaffActiveHandler>();

export function registerStaffActiveHandler(id: string, handler: StaffActiveHandler): void {
  handlers.set(id, handler); // replacing keeps dev hot reload harmless
}

export async function runStaffActiveHandlers(
  ctx: ActionContext,
  event: StaffActiveEvent,
): Promise<void> {
  for (const handler of handlers.values()) await handler(ctx, event);
}
