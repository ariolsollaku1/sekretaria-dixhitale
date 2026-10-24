"use server";

import "../permissions";
import { action } from "@/lib/actions";
import { createEventSchema, eventIdSchema, updateEventSchema } from "../domain/event-schemas";
import * as events from "./event.service";

export const createEventAction = action({
  permission: "ntf.event.write",
  input: createEventSchema,
  handler: (input, ctx) => events.createEvent(ctx, input),
});

export const updateEventAction = action({
  permission: "ntf.event.write",
  input: updateEventSchema,
  handler: ({ eventId, ...input }, ctx) => events.updateEvent(ctx, eventId, input),
});

export const publishEventAction = action({
  permission: "ntf.event.write",
  input: eventIdSchema,
  handler: ({ eventId }, ctx) => events.publishEvent(ctx, eventId),
});

export const cancelEventAction = action({
  permission: "ntf.event.write",
  input: eventIdSchema,
  handler: ({ eventId }, ctx) => events.cancelEvent(ctx, eventId),
});

export const registerForEventAction = action({
  permission: "ntf.event.register",
  input: eventIdSchema,
  handler: ({ eventId }, ctx) => events.registerForEvent(ctx, eventId),
});

export const unregisterFromEventAction = action({
  permission: "ntf.event.register",
  input: eventIdSchema,
  handler: ({ eventId }, ctx) => events.unregisterFromEvent(ctx, eventId),
});
