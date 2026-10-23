import { z } from "zod";
import { isDay } from "./week-rules";

export const EVENT_TYPES = [
  "TEACHING_WEEK",
  "HOLIDAY",
  "DEADLINE",
  "EXAM_PERIOD",
  "REGISTRATION_PERIOD",
  "EVENT",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const day = z.string().refine(isDay, "invalidDate");
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .nullish()
  .transform((v) => (v ? v : null));

/** AC-1..AC-3: one schema for the form and the actions. Messages are catalog keys (`cal.errors.*`). */
export const eventSchema = z
  .object({
    title: z.string().trim().min(1, "required").max(200, "tooLong"),
    type: z.enum(EVENT_TYPES),
    startDate: day,
    endDate: day,
    description: optionalText,
    audience: z.enum(["ALL", "CYCLE", "PROGRAM"]),
    cycle: z
      .enum(["FIRST", "SECOND"])
      .nullish()
      .transform((v) => v ?? null),
    programId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (isDay(v.startDate) && isDay(v.endDate) && v.endDate < v.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endBeforeStart" });
    if (v.audience === "CYCLE" && !v.cycle)
      ctx.addIssue({ code: "custom", path: ["cycle"], message: "cycleRequired" });
    if (v.audience === "PROGRAM" && !v.programId)
      ctx.addIssue({ code: "custom", path: ["programId"], message: "programRequired" });
  })
  .transform((v) => ({
    ...v,
    cycle: v.audience === "CYCLE" ? v.cycle : null,
    programId: v.audience === "PROGRAM" ? v.programId : null,
  }));
export type EventFormInput = z.input<typeof eventSchema>;
export type EventInput = z.output<typeof eventSchema>;

export const createEventSchema = eventSchema.and(z.object({ academicYearId: z.string().min(1) }));
export const eventIdSchema = z.object({ eventId: z.string().min(1) });
export const copySchema = z.object({
  fromYearId: z.string().min(1),
  toYearId: z.string().min(1),
});

/** AC-3: the dates must lie inside the academic year. */
export function datesInsideYear(
  e: { startDate: string; endDate: string },
  year: { startDate: string; endDate: string },
): boolean {
  return e.startDate >= year.startDate && e.endDate <= year.endDate;
}
