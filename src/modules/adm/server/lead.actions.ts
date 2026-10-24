"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  addLeadNoteSchema,
  assignLeadSchema,
  changeLeadStatusSchema,
  createLeadSchema,
  importLeadsSchema,
  inviteLeadSchema,
  updateLeadSchema,
} from "../domain/lead-schemas";
import * as leads from "./lead.service";

// Every write needs adm.lead.write; the wrapper refuses a role without it before anything runs.

export const createLeadAction = action({
  permission: "adm.lead.write",
  input: createLeadSchema,
  handler: (input, ctx) => leads.createLead(ctx, input),
});
export const updateLeadAction = action({
  permission: "adm.lead.write",
  input: updateLeadSchema,
  handler: (input, ctx) => leads.updateLead(ctx, input),
});
export const changeLeadStatusAction = action({
  permission: "adm.lead.write",
  input: changeLeadStatusSchema,
  handler: (input, ctx) => leads.changeLeadStatus(ctx, input),
});
export const assignLeadAction = action({
  permission: "adm.lead.write",
  input: assignLeadSchema,
  handler: ({ leadId, assigneeId }, ctx) => leads.assignLead(ctx, leadId, assigneeId),
});
export const addLeadNoteAction = action({
  permission: "adm.lead.write",
  input: addLeadNoteSchema,
  handler: ({ leadId, body }, ctx) => leads.addLeadNote(ctx, leadId, body),
});
export const inviteLeadAction = action({
  permission: "adm.lead.write",
  input: inviteLeadSchema,
  handler: ({ leadId }, ctx) => leads.inviteLead(ctx, leadId),
});
export const importLeadsAction = action({
  permission: "adm.lead.write",
  input: importLeadsSchema,
  handler: (input, ctx) => leads.importLeads(ctx, input),
});
