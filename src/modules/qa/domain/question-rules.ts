// QA-01 AC-2, AC-5: the questions of a campaign and the validation of an answer sheet. Pure.
import { z } from "zod";

export const SECTIONS = ["LECTURER", "ADMINISTRATION"] as const;
export type Section = (typeof SECTIONS)[number];

export const MAX_QUESTIONS = 40;
export const MAX_TEXT = 2000;
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

const label = z.object({
  sq: z.string().trim().min(1, "labelRequired").max(300, "tooLong"),
  en: z
    .string()
    .trim()
    .max(300, "tooLong")
    .nullish()
    .transform((v) => (v ? v : undefined)),
});

export const questionSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,40}$/, "badKey"),
  section: z.enum(SECTIONS),
  type: z.enum(["SCALE", "TEXT"]),
  label,
  // scale questions are always required (Q-104); text is optional
  required: z.boolean().optional(),
});
export type Question = {
  key: string;
  section: Section;
  type: "SCALE" | "TEXT";
  label: { sq: string; en?: string };
  required: boolean;
};

export const questionsSchema = z
  .array(questionSchema)
  .min(1, "noQuestions")
  .max(MAX_QUESTIONS, "tooManyQuestions")
  .superRefine((list, ctx) => {
    const seen = new Set<string>();
    list.forEach((q, i) => {
      if (seen.has(q.key))
        ctx.addIssue({ code: "custom", path: [i, "key"], message: "duplicateKey" });
      seen.add(q.key);
    });
  })
  .transform((list): Question[] =>
    list.map((q) => ({
      key: q.key,
      section: q.section,
      type: q.type,
      label: q.label.en ? { sq: q.label.sq, en: q.label.en } : { sq: q.label.sq },
      required: q.type === "SCALE" ? true : (q.required ?? false),
    })),
  );

/** Parses the stored JSON of a campaign (trusted, but typed). */
export function parseQuestions(json: unknown): Question[] {
  const parsed = questionsSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

export const hasScaleQuestion = (questions: Question[], section?: Section) =>
  questions.some((q) => q.type === "SCALE" && (!section || q.section === section));

export const questionsOf = (questions: Question[], section: Section) =>
  questions.filter((q) => q.section === section);

export type AnswerValue = number | string;
export type Answers = Record<string, AnswerValue>;

export type AnswerCheck =
  { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> };

/**
 * AC-5: every scale question 1–5, text at most MAX_TEXT characters, required ones present, no key
 * that is not a question of the section. Empty optional text is dropped.
 */
export function validateAnswers(
  questions: Question[],
  section: Section,
  raw: Record<string, unknown>,
): AnswerCheck {
  const own = questionsOf(questions, section);
  const keys = new Set(own.map((q) => q.key));
  const errors: Record<string, string> = {};
  const answers: Answers = {};
  for (const k of Object.keys(raw)) if (!keys.has(k)) errors[k] = "unknownQuestion";
  for (const q of own) {
    const v = raw[q.key];
    if (q.type === "SCALE") {
      if (v === undefined || v === null) errors[q.key] = "required";
      else if (typeof v !== "number" || !Number.isInteger(v) || v < SCALE_MIN || v > SCALE_MAX)
        errors[q.key] = "scaleRange";
      else answers[q.key] = v;
    } else {
      const text = typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : null;
      if (text === null) errors[q.key] = "invalid";
      else if (text.length > MAX_TEXT) errors[q.key] = "tooLong";
      else if (text === "") {
        if (q.required) errors[q.key] = "required";
      } else answers[q.key] = text;
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}
