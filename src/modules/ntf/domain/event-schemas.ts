import { z } from "zod";
import { AUDIENCES } from "./schemas";

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const isLocalDateTime = (value: string): boolean => {
  if (!LOCAL.test(value)) return false;
  const d = new Date(`${value}:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === value;
};

const requiredDateTime = z.string().min(1, "required").refine(isLocalDateTime, "invalidDate");
const optionalDateTime = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isLocalDateTime(v), "invalidDate");

const capacity = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 100_000), "capacityInvalid");

/**
 * AC-1/AC-2: organisers type wall-clock times in Europe/Tirane (`YYYY-MM-DDTHH:mm`); the service
 * turns them into instants. Messages are catalog keys (`evt.errors.*`). Local strings of one format
 * compare correctly as text.
 */
export const eventSchema = z
  .object({
    title: z.string().trim().min(1, "required").max(200, "tooLong"),
    description: z.string().trim().min(1, "required").max(10_000, "tooLong"),
    location: z.string().trim().min(1, "required").max(200, "tooLong"),
    startsAt: requiredDateTime,
    endsAt: optionalDateTime,
    capacity,
    registrationDeadline: optionalDateTime,
    audience: z.enum(AUDIENCES),
    cycle: z
      .enum(["FIRST", "SECOND"])
      .nullish()
      .transform((v) => v ?? null),
    programId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
    announcementId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "CYCLE" && !v.cycle)
      ctx.addIssue({ code: "custom", path: ["cycle"], message: "cycleRequired" });
    if (v.audience === "PROGRAM" && !v.programId)
      ctx.addIssue({ code: "custom", path: ["programId"], message: "programRequired" });
    if (v.endsAt && v.endsAt <= v.startsAt)
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "endBeforeStart" });
    if (v.registrationDeadline && v.registrationDeadline > v.startsAt)
      ctx.addIssue({
        code: "custom",
        path: ["registrationDeadline"],
        message: "deadlineAfterStart",
      });
  })
  .transform((v) => ({
    ...v,
    cycle: v.audience === "CYCLE" ? v.cycle : null,
    programId: v.audience === "PROGRAM" ? v.programId : null,
  }));
export type EventFormInput = z.input<typeof eventSchema>;
export type EventInput = z.output<typeof eventSchema>;

export const eventIdSchema = z.object({ eventId: z.string().min(1) });
export const createEventSchema = eventSchema;
export const updateEventSchema = eventSchema.and(eventIdSchema);
