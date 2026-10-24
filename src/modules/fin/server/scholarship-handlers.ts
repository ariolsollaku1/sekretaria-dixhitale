import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { can } from "@/lib/authz/guard";
import { registerFormHandler } from "@/lib/forms/handlers";
import { SCHOLARSHIP_HANDLER } from "../domain/scholarship-rules";

/**
 * SRC-037a, AC-3: an application is approved only when Finance has recorded a scholarship for it
 * (the recorded scholarship is the decision and already changed the payment plan).
 */
registerFormHandler(SCHOLARSHIP_HANDLER, {
  async onApproved(ctx: ActionContext, submission) {
    if (!(await can(ctx.user, "fin.scholarship.write")))
      throw new DomainError("CONFLICT", "NOT_ALLOWED_TO_DECIDE");
    const live = await ctx.db.scholarship.count({
      where: { submissionId: submission.submissionId, voidedAt: null },
    });
    if (live === 0) throw new DomainError("CONFLICT", "NO_SCHOLARSHIP_RECORDED");
  },
  detailHref: (submissionId: string) => `/fin/scholarships/applications/${submissionId}`,
});
