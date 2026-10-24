import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { createAuditor, type Audit } from "@/lib/audit";
import { withTransaction, type Tx } from "@/lib/db";
import { attachFile } from "@/lib/files/files.service";
import { resolveLocale } from "@/lib/i18n/config";
import { notify } from "@/lib/notify/notify";
import { registerNotificationType } from "@/lib/notify/types";
import { bucketFor, hit } from "@/lib/ratelimit";
import { env } from "@/lib/env";
import {
  HONEYPOT_FIELD,
  isHoneypotFilled,
  makeReference,
  maySubmit,
  nextStates,
  stateDef,
  validateAnswers,
  type Answers,
} from "./answers";
import { currentRoles, mayHandle } from "./access";
import { validateDefinition } from "./definition";
import { getFormHandler } from "./handlers";
import { getPublishedForm, type ServedForm } from "./queries";

registerNotificationType({ type: "plt.form-status" });

/** AC-6 (Q-37 working assumption) */
export const PUBLIC_RATE = { limit: 5, windowMs: 10 * 60_000 };
export const FILE_PURPOSE = "form-attachment";

export type SubmitResult =
  | { ok: true; reference: string }
  | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }
  | { ok: false; code: "VALIDATION"; errors: Record<string, string> };

const local = (text: { sq: string; en?: string }, locale: string) =>
  locale === "en" && text.en ? text.en : text.sq;

async function insertSubmission(
  tx: Tx,
  audit: Audit,
  form: ServedForm,
  answers: Answers,
  submitterId: string | null,
): Promise<{ id: string; reference: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = makeReference();
    try {
      const created = await tx.formSubmission.create({
        data: {
          definitionId: form.id,
          reference,
          submitterId,
          answers: answers as Prisma.InputJsonValue,
          state: form.definition.workflow.initial,
          events: {
            create: {
              kind: "SUBMITTED",
              toState: form.definition.workflow.initial,
              actorId: submitterId,
            },
          },
        },
      });
      await audit({
        action: "plt.form_submission.create",
        entityType: "FormSubmission",
        entityId: created.id,
        before: null,
        after: { form: form.key, version: form.version, reference },
      });
      const handler = form.definition.handler ? getFormHandler(form.definition.handler) : undefined;
      await handler?.onSubmitted?.(
        { db: tx, audit },
        { submissionId: created.id, formKey: form.key, answers, submitterId },
      );
      return { id: created.id, reference };
    } catch (error) {
      // a reference collision: draw another one
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new Error("could not allocate a submission reference");
}

/**
 * AC-4..AC-6: a visitor submits a public form. A filled honeypot is answered like a success and
 * stored nowhere; the rate limit is checked before anything else; the IP is never stored with the
 * answers (the limiter keeps a hash).
 */
export async function submitPublic(
  key: string,
  raw: Record<string, unknown>,
  ip: string | null,
): Promise<SubmitResult> {
  const form = await getPublishedForm(key);
  if (!form || form.audience !== "PUBLIC") return { ok: false, code: "NOT_FOUND" };
  if (isHoneypotFilled(raw)) return { ok: true, reference: makeReference() };
  const limit = await hit(bucketFor(`form:${key}`, ip), PUBLIC_RATE);
  if (!limit.allowed) return { ok: false, code: "RATE_LIMITED" };

  const checked = validateAnswers(form.definition, raw, { allowFiles: false });
  if (!checked.ok) return { ok: false, code: "VALIDATION", errors: checked.errors };
  const { reference } = await withTransaction(async (tx) =>
    insertSubmission(tx, createAuditor(tx, { type: "PUBLIC" }), form, checked.answers, null),
  );
  return { ok: true, reference };
}

/** AC-5: a signed-in user submits an authenticated form; file answers are uploaded ids of this user. */
export async function submitAuthenticated(
  ctx: ActionContext,
  key: string,
  raw: Record<string, unknown>,
): Promise<{ reference: string; submissionId: string }> {
  const form = await getPublishedForm(key, ctx.db);
  if (!form || form.audience !== "AUTHENTICATED")
    throw new DomainError("NOT_FOUND", "Form not found");
  // OFF-01: a form limited to some roles does not exist for the others
  if (!maySubmit(form.definition, await currentRoles(ctx.user.id, ctx.db)))
    throw new DomainError("NOT_FOUND", "Form not found");
  const checked = validateAnswers(form.definition, raw, { allowFiles: true });
  if (!checked.ok)
    throw new DomainError(
      "VALIDATION",
      "Check the answers",
      Object.fromEntries(Object.entries(checked.errors).map(([k, v]) => [k, [v]])),
    );

  const fileKeys = form.definition.fields
    .filter((f) => f.type === "file" && typeof checked.answers[f.key] === "string")
    .map((f) => f.key);
  for (const k of fileKeys) {
    const file = await ctx.db.storedFile.findUnique({
      where: { id: String(checked.answers[k]) },
      select: { purpose: true, uploadedById: true },
    });
    if (!file || file.purpose !== FILE_PURPOSE || file.uploadedById !== ctx.user.id)
      throw new DomainError("VALIDATION", "Check the answers", { [k]: ["invalidFile"] });
  }
  const created = await insertSubmission(ctx.db, ctx.audit, form, checked.answers, ctx.user.id);
  for (const k of fileKeys)
    await attachFile(ctx, String(checked.answers[k]), {
      entityType: "FormSubmission",
      entityId: created.id,
    });
  return { reference: created.reference, submissionId: created.id };
}

async function loadForHandling(ctx: ActionContext, submissionId: string) {
  const submission = await ctx.db.formSubmission.findUnique({
    where: { id: submissionId },
    include: { definition: true },
  });
  if (!submission) throw new DomainError("NOT_FOUND", "Submission not found");
  if (!mayHandle(await currentRoles(ctx.user.id, ctx.db), submission.definition.ownerRoles))
    throw new DomainError("NOT_FOUND", "Submission not found"); // not yours = does not exist
  const form = await ctx.db.formDefinition.findUniqueOrThrow({
    where: { id: submission.definitionId },
  });
  const parsed = validateDefinition(form.definition, form.audience);
  if (!parsed.ok) throw new DomainError("CONFLICT", "DEFINITION_INVALID");
  return { submission, definition: parsed.definition, form };
}

/** AC-8..AC-10 */
export async function changeState(
  ctx: ActionContext,
  submissionId: string,
  to: string,
  comment: string | null,
) {
  const { submission, definition, form } = await loadForHandling(ctx, submissionId);
  const roles = await currentRoles(ctx.user.id, ctx.db);
  if (!nextStates(definition, submission.state, roles).includes(to))
    throw new DomainError("CONFLICT", "TRANSITION_NOT_ALLOWED");
  // OFF-01: nobody decides on their own request through a role-restricted step (sysadmin excepted)
  const restricted = definition.workflow.transitions.some(
    (t) => t.from === submission.state && t.to === to && t.roles,
  );
  if (restricted && submission.submitterId === ctx.user.id && !roles.includes("sysadmin"))
    throw new DomainError("CONFLICT", "OWN_REQUEST");
  const target = stateDef(definition, to)!;

  await ctx.db.formSubmission.update({ where: { id: submissionId }, data: { state: to } });
  await ctx.db.formSubmissionEvent.create({
    data: {
      submissionId,
      kind: "STATE",
      fromState: submission.state,
      toState: to,
      comment,
      actorId: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "plt.form_submission.change_state",
    entityType: "FormSubmission",
    entityId: submissionId,
    before: { state: submission.state },
    after: { state: to },
    reason: comment,
  });

  // AC-10: the owning module's handler runs in this transaction; if it throws, the change rolls back
  if (target.kind === "approved" && definition.handler) {
    const handler = getFormHandler(definition.handler);
    if (!handler) throw new DomainError("CONFLICT", "HANDLER_MISSING");
    await handler.onApproved?.(ctx, {
      submissionId,
      formKey: form.key,
      answers: submission.answers as Answers,
      submitterId: submission.submitterId,
    });
  }

  // AC-9
  if (submission.submitterId) {
    const submitter = await ctx.db.user.findUnique({
      where: { id: submission.submitterId },
      select: { locale: true },
    });
    const locale = resolveLocale({ user: submitter?.locale ?? null, fallback: env.DEFAULT_LOCALE });
    await notify(
      { db: ctx.db, afterCommit: ctx.afterCommit },
      {
        userId: submission.submitterId,
        type: "plt.form-status",
        params: { form: local(definition.title, locale), state: local(target.label, locale) },
        link: `/forms/mine`,
        dedupeKey: `form-status:${submissionId}:${to}`,
      },
    );
  }
  return { submissionId, state: to };
}

export async function assign(ctx: ActionContext, submissionId: string, assigneeId: string | null) {
  const { submission } = await loadForHandling(ctx, submissionId);
  if (assigneeId) {
    const assignee = await ctx.db.user.findUnique({
      where: { id: assigneeId },
      select: { active: true },
    });
    const ok =
      assignee?.active &&
      mayHandle(await currentRoles(assigneeId, ctx.db), submission.definition.ownerRoles);
    if (!ok)
      throw new DomainError("VALIDATION", "Check the assignee", {
        assigneeId: ["assigneeCannotHandle"],
      });
  }
  await ctx.db.formSubmission.update({ where: { id: submissionId }, data: { assigneeId } });
  await ctx.db.formSubmissionEvent.create({
    data: { submissionId, kind: "ASSIGNED", comment: assigneeId, actorId: ctx.user.id },
  });
  await ctx.audit({
    action: "plt.form_submission.assign",
    entityType: "FormSubmission",
    entityId: submissionId,
    before: { assigneeId: submission.assigneeId },
    after: { assigneeId },
  });
  return { submissionId };
}

export async function addComment(ctx: ActionContext, submissionId: string, comment: string) {
  await loadForHandling(ctx, submissionId);
  await ctx.db.formSubmissionEvent.create({
    data: { submissionId, kind: "COMMENT", comment, actorId: ctx.user.id },
  });
  await ctx.audit({
    action: "plt.form_submission.comment",
    entityType: "FormSubmission",
    entityId: submissionId,
    after: null,
  });
  return { submissionId };
}

export { HONEYPOT_FIELD };
