import "server-only";
import type { ActionContext } from "@/lib/actions";
import type { EnrollmentStatus } from "../domain/student-rules";

// AC-5: modules that react to a status change (IAM-02 disables the account, FIN stops future
// installments) register a handler. Handlers run inside the transaction of the change, so a
// failing handler rolls the change back.
export type StatusChangeEvent = {
  enrollmentId: string;
  studentId: string;
  personId: string;
  programId: string;
  from: EnrollmentStatus;
  to: EnrollmentStatus;
  effectiveDate: string;
  /** set when the change is a transfer: the new enrollment */
  transferredTo: string | null;
};

export type StatusChangeHandler = (ctx: ActionContext, event: StatusChangeEvent) => Promise<void>;

const handlers = new Map<string, StatusChangeHandler>();

export function registerStatusChangeHandler(id: string, handler: StatusChangeHandler): void {
  handlers.set(id, handler); // replacing keeps dev hot reload harmless
}

export function resetStatusChangeHandlers(): void {
  handlers.clear();
}

export async function runStatusChangeHandlers(
  ctx: ActionContext,
  event: StatusChangeEvent,
): Promise<void> {
  for (const handler of handlers.values()) await handler(ctx, event);
}

// IAM-02 (AC-7): a new open enrollment (first registration, second program, transfer target) brings
// access back. Same contract: runs inside the transaction of the change.
export type EnrollmentOpenedEvent = {
  enrollmentId: string;
  studentId: string;
  personId: string;
  programId: string;
};

export type EnrollmentOpenedHandler = (
  ctx: ActionContext,
  event: EnrollmentOpenedEvent,
) => Promise<void>;

const openedHandlers = new Map<string, EnrollmentOpenedHandler>();

export function registerEnrollmentOpenedHandler(
  id: string,
  handler: EnrollmentOpenedHandler,
): void {
  openedHandlers.set(id, handler);
}

export async function runEnrollmentOpenedHandlers(
  ctx: ActionContext,
  event: EnrollmentOpenedEvent,
): Promise<void> {
  for (const handler of openedHandlers.values()) await handler(ctx, event);
}
