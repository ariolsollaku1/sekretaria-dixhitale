import { z } from "zod";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalidDate");
const minute = z
  .number({ error: "timeRange" })
  .int("timeRange")
  .min(0, "timeRange")
  .max(1440, "timeRange");
const hours = z.number({ error: "hoursRange" }).int("hoursRange").min(1, "hoursRange").max(12, "hoursRange");
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullish()
    .transform((v) => (v ? v : null));
/** The Secretariat's reason (Q-61); the service demands it for corrections. */
const reason = z
  .string()
  .trim()
  .max(500, "tooLong")
  .nullish()
  .transform((v) => (v ? v : null));

export const generateSchema = z.object({
  assignmentId: z.string().min(1, "required"),
  from: day,
  to: day,
});
export type GenerateInput = z.infer<typeof generateSchema>;

export const sessionSchema = z.object({
  assignmentId: z.string().min(1, "required"),
  date: day,
  startMinute: minute,
  endMinute: minute,
  hours,
  topic: text(300),
});
export type SessionInput = z.infer<typeof sessionSchema>;

export const updateSessionSchema = z.object({
  sessionId: z.string().min(1, "required"),
  date: day,
  startMinute: minute,
  endMinute: minute,
  hours,
  topic: text(300),
  reason,
});
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const cancelSessionSchema = z.object({
  sessionId: z.string().min(1, "required"),
  reason,
});

export const saveAttendanceSchema = z.object({
  sessionId: z.string().min(1, "required"),
  hours,
  topic: text(300),
  marks: z
    .array(
      z.object({
        studentId: z.string().min(1),
        status: z.enum(["PRESENT", "ABSENT", "EXCUSED"], { error: "required" }),
        note: text(200),
      }),
    )
    .max(500),
  reason,
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
