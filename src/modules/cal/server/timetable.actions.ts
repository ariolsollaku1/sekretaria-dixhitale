"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { removeSlotSchema, slotSchema, updateSlotSchema } from "../domain/timetable-schemas";
import * as timetable from "./timetable.service";

export const createEntryAction = action({
  permission: "cal.timetable.write",
  input: slotSchema,
  handler: (input, ctx) => timetable.createEntry(ctx, input),
});
export const updateEntryAction = action({
  permission: "cal.timetable.write",
  input: updateSlotSchema,
  handler: ({ entryId, ...input }, ctx) => timetable.updateEntry(ctx, entryId, input),
});
export const removeEntryAction = action({
  permission: "cal.timetable.write",
  input: removeSlotSchema,
  handler: ({ entryId }, ctx) => timetable.removeEntry(ctx, entryId),
});
