import { z } from "zod";
import { isDay } from "./year-rules";

const day = z.string().refine(isDay, "invalidDate");
const range = z.object({ start: day, end: day });

/** One schema for the form and the server actions (conventions.md). Messages are catalog keys. */
export const yearSchema = z.object({
  startDate: day,
  endDate: day,
  semester1: range,
  semester2: range,
});
export type YearFormInput = z.infer<typeof yearSchema>;

export const updateYearSchema = yearSchema.extend({ yearId: z.string().min(1) });
export const makeCurrentSchema = z.object({ yearId: z.string().min(1) });
