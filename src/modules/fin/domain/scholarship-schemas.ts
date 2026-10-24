import { z } from "zod";
import { SCHOLARSHIP_CATEGORIES, SCHOLARSHIP_TYPES } from "./scholarship-rules";
import { parseCents } from "./money";

const id = z.string().min(1, "required");
/** Empty text counts as "not given". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => (v ? v : null));
/** A decimal string with at most two decimals as whole cents (money) or hundredths (percent). */
const optionalNumber = z
  .string()
  .trim()
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null;
    const cents = parseCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "amount" });
      return z.NEVER;
    }
    return cents;
  });

/**
 * AC-2/AC-3: Finance grants a scholarship either as the decision on an application
 * (`submissionId`; the student comes from the application) or directly (`studentNumber`, and the
 * program code when the student has several open enrollments).
 */
export const grantScholarshipSchema = z.object({
  submissionId: optionalText(60),
  studentNumber: optionalText(20),
  programCode: optionalText(40),
  academicYearId: id,
  type: z.enum(SCHOLARSHIP_TYPES, { error: "required" }),
  category: z.enum(SCHOLARSHIP_CATEGORIES, { error: "required" }),
  /** Percent of the tuition, e.g. "50" or "37.5". */
  percent: optionalNumber,
  /** Fixed amount of the tuition. */
  amount: optionalNumber,
  reason: z.string().trim().min(1, "required").max(1000, "tooLong"),
});
export type GrantScholarshipInput = z.output<typeof grantScholarshipSchema>;

export const voidScholarshipSchema = z.object({ id });
