"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  cancelSessionSchema,
  generateSchema,
  saveAttendanceSchema,
  sessionSchema,
  updateSessionSchema,
} from "../domain/schemas";
import * as sessions from "./session.service";

// Two entry points per operation: the lecturer's (`att.attendance.record`, own assignments only,
// checked in the service) and the Secretariat's (`att.attendance.correct`, scoped to the group,
// reasons required where the service says so).

export const generateSessionsAction = action({
  permission: "att.attendance.record",
  input: generateSchema,
  handler: (input, ctx) => sessions.generateSessions(ctx, "record", input),
});
export const generateSessionsCorrectAction = action({
  permission: "att.attendance.correct",
  input: generateSchema,
  handler: (input, ctx) => sessions.generateSessions(ctx, "correct", input),
});

export const addSessionAction = action({
  permission: "att.attendance.record",
  input: sessionSchema,
  handler: (input, ctx) => sessions.addSession(ctx, "record", input),
});
export const addSessionCorrectAction = action({
  permission: "att.attendance.correct",
  input: sessionSchema,
  handler: (input, ctx) => sessions.addSession(ctx, "correct", input),
});

export const updateSessionAction = action({
  permission: "att.attendance.record",
  input: updateSessionSchema,
  handler: (input, ctx) => sessions.updateSession(ctx, "record", input),
});
export const updateSessionCorrectAction = action({
  permission: "att.attendance.correct",
  input: updateSessionSchema,
  handler: (input, ctx) => sessions.updateSession(ctx, "correct", input),
});

export const cancelSessionAction = action({
  permission: "att.attendance.record",
  input: cancelSessionSchema,
  handler: (input, ctx) => sessions.cancelSession(ctx, "record", input),
});
export const cancelSessionCorrectAction = action({
  permission: "att.attendance.correct",
  input: cancelSessionSchema,
  handler: (input, ctx) => sessions.cancelSession(ctx, "correct", input),
});

export const saveAttendanceAction = action({
  permission: "att.attendance.record",
  input: saveAttendanceSchema,
  handler: (input, ctx) => sessions.saveAttendance(ctx, "record", input),
});
export const saveAttendanceCorrectAction = action({
  permission: "att.attendance.correct",
  input: saveAttendanceSchema,
  handler: (input, ctx) => sessions.saveAttendance(ctx, "correct", input),
});
