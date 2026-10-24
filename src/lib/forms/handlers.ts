import "server-only";
import type { ActionContext } from "@/lib/actions";

// AC-10: owning modules register the code that runs when a submission is approved. Definitions
// name a handler by key; the code lives with the module (ADR-0009).
export type ApprovedSubmission = {
  submissionId: string;
  formKey: string;
  answers: Record<string, string | number | boolean>;
  submitterId: string | null;
};

export type FormHandler = {
  onApproved(ctx: ActionContext, submission: ApprovedSubmission): Promise<void>;
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
