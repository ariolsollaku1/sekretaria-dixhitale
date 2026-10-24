import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { registerFormHandler } from "@/lib/forms/handlers";
import { LEAVE_FORM, leaveDatesValid, REQUEST_HANDLER } from "../domain/request-rules";

/**
 * SRC-140, AC-6: approving a staff request. Leave must have a valid period; nothing else is
 * recorded (Q-103): the state and the notification of the engine are the outcome.
 */
registerFormHandler(REQUEST_HANDLER, {
  async onApproved(_ctx: ActionContext, submission) {
    if (
      submission.formKey === LEAVE_FORM &&
      !leaveDatesValid(submission.answers.startDate, submission.answers.endDate)
    )
      throw new DomainError("CONFLICT", "INVALID_LEAVE_DATES");
  },
});
