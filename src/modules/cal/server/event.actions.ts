"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { copySchema, createEventSchema, eventIdSchema, eventSchema } from "../domain/schemas";
import * as events from "./event.service";

export const createEventAction = action({
  permission: "cal.event.write",
  input: createEventSchema,
  handler: ({ academicYearId, ...input }, ctx) => events.createEvent(ctx, academicYearId, input),
});

export const updateEventAction = action({
  permission: "cal.event.write",
  input: eventSchema.and(eventIdSchema),
  handler: ({ eventId, ...input }, ctx) => events.updateEvent(ctx, eventId, input),
});

export const cancelEventAction = action({
  permission: "cal.event.write",
  input: eventIdSchema,
  handler: ({ eventId }, ctx) => events.setEventActive(ctx, eventId, false),
});

export const restoreEventAction = action({
  permission: "cal.event.write",
  input: eventIdSchema,
  handler: ({ eventId }, ctx) => events.setEventActive(ctx, eventId, true),
});

export const copyCalendarAction = action({
  permission: "cal.event.write",
  input: copySchema,
  handler: ({ fromYearId, toYearId }, ctx) => events.copyCalendar(ctx, fromYearId, toYearId),
});
