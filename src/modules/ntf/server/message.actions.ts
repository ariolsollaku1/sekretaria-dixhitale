"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  archiveTemplateSchema,
  sendMessageSchema,
  templateSchema,
} from "../domain/message-schemas";
import * as messages from "./message.service";

export const sendMessageAction = action({
  permission: "ntf.message.send",
  input: sendMessageSchema,
  handler: (input, ctx) => messages.sendMessage(ctx, input),
});

export const createTemplateAction = action({
  permission: "ntf.message.send",
  input: templateSchema,
  handler: (input, ctx) => messages.createTemplate(ctx, input),
});

export const archiveTemplateAction = action({
  permission: "ntf.message.send",
  input: archiveTemplateSchema,
  handler: ({ templateId }, ctx) => messages.archiveTemplate(ctx, templateId),
});
