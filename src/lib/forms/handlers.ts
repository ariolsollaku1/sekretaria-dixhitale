import "server-only";
import type { ActionContext } from "@/lib/actions";
import type { Audit } from "@/lib/audit";
import type { Tx } from "@/lib/db";

// AC-10: owning modules register the code that runs when a submission is approved. Definitions
// name a handler by key; the code lives with the module (ADR-0009).
export type ApprovedSubmission = {
  submissionId: string;
  formKey: string;
  answers: Record<string, string | number | boolean>;
  submitterId: string | null;
};

export type FormHandler = {
  /** Runs when the submission enters an `approved` state, in the same transaction (AC-10). */
  onApproved?(ctx: ActionContext, submission: ApprovedSubmission): Promise<void>;
  /**
   * Runs right after a submission is stored (public or signed in), in the same transaction: a
   * failure rolls the submission back. For forms whose answers become a record at once (ADM-01).
   */
  onSubmitted?(ctx: { db: Tx; audit: Audit }, submission: ApprovedSubmission): Promise<void>;
  /** Optional page of the owning module with more actions for a submission (shown as a link). */
  detailHref?(submissionId: string): string;
};

const handlers = new Map<string, FormHandler>();

export function registerFormHandler(key: string, handler: FormHandler): void {
  handlers.set(key, handler);
}
export const getFormHandler = (key: string): FormHandler | undefined => handlers.get(key);
export function resetFormHandlers(): void {
  handlers.clear();
}
