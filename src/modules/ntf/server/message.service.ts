import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ForbiddenError } from "@/lib/authz/check";
import { can } from "@/lib/authz/guard";
import { fillPlaceholders, valuesForPerson } from "../domain/placeholders";
import type { TemplateInput } from "../domain/message-schemas";
import { resolveRecipients } from "./recipients";

type Ctx = ActionContext;

/**
 * AC-5: stores the message with one delivery row per person, in one transaction with the audit
 * entry. Recipients are re-resolved here (the list may have changed since the compose page). The
 * background job does the sending.
 */
export async function sendMessage(
  ctx: Ctx,
  input: {
    tableId: string;
    filters: Record<string, string>;
    subject: string;
    body: string;
  },
) {
  const { personIds, filters } = await resolveRecipients(ctx.user, input.tableId, input.filters);
  const users = await ctx.db.user.findMany({
    where: { personId: { in: personIds } },
    select: { id: true, personId: true },
  });
  const userByPerson = new Map(users.map((u) => [u.personId!, u.id]));
  const noAccount = personIds.filter((p) => !userByPerson.has(p)).length;

  const message = await ctx.db.message.create({
    data: {
      subject: input.subject,
      body: input.body,
      sourceTable: input.tableId,
      filters,
      recipientCount: personIds.length,
      noAccountCount: noAccount,
      // nobody to send to: nothing for the job to do
      status: noAccount === personIds.length ? "SENT" : "PENDING",
      completedAt: noAccount === personIds.length ? new Date() : null,
      createdById: ctx.user.id,
    },
  });
  await ctx.db.messageRecipient.createMany({
    data: personIds.map((personId) => ({
      messageId: message.id,
      personId,
      userId: userByPerson.get(personId) ?? null,
      state: userByPerson.has(personId) ? ("QUEUED" as const) : ("NO_ACCOUNT" as const),
    })),
  });
  await ctx.audit({
    action: "ntf.message.send",
    entityType: "Message",
    entityId: message.id,
    before: null,
    after: {
      sourceTable: input.tableId,
      filters,
      subject: input.subject,
      recipientCount: personIds.length,
      noAccountCount: noAccount,
    },
  });
  return { messageId: message.id, recipientCount: personIds.length, noAccountCount: noAccount };
}

/** AC-3: the text one person receives. */
export function renderForPerson(
  message: { subject: string; body: string },
  person: { firstName: string; lastName: string },
) {
  const values = valuesForPerson(person);
  const subject = fillPlaceholders(message.subject, values);
  return { title: subject, subject, body: fillPlaceholders(message.body, values) };
}

/** AC-4: any sender may save a wording; templates are shared among senders (Q-52). */
export async function createTemplate(ctx: Ctx, input: TemplateInput) {
  const template = await ctx.db.messageTemplate.create({
    data: {
      name: input.name,
      subject: input.subject,
      body: input.body,
      createdById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "ntf.template.create",
    entityType: "MessageTemplate",
    entityId: template.id,
    before: null,
    after: { name: input.name, subject: input.subject },
  });
  return { templateId: template.id };
}

export async function archiveTemplate(ctx: Ctx, templateId: string) {
  const before = await ctx.db.messageTemplate.findUnique({ where: { id: templateId } });
  if (!before || before.archivedAt) throw new DomainError("NOT_FOUND", "Template not found");
  await ctx.db.messageTemplate.update({
    where: { id: templateId },
    data: { archivedAt: new Date() },
  });
  await ctx.audit({
    action: "ntf.template.archive",
    entityType: "MessageTemplate",
    entityId: templateId,
    before: { name: before.name, archived: false },
    after: { name: before.name, archived: true },
  });
  return { templateId };
}

/** Sender sees their own messages; holders of `plt.audit.read` (system administrators) see all. */
export async function mayReadMessage(
  user: { id: string },
  message: { createdById: string },
): Promise<boolean> {
  return message.createdById === user.id || (await can(user, "plt.audit.read"));
}

export async function assertMayRead(user: { id: string }, message: { createdById: string }) {
  if (!(await mayReadMessage(user, message))) throw new ForbiddenError("ntf.message.send");
}
