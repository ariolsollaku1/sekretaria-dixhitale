import "server-only";
import { DomainError, type ActionContext } from "@/lib/actions";
import { TemplateError, validateTemplate } from "./template";
import { getDocumentType } from "./types";

type Ctx = ActionContext;

export const LANGUAGES = ["sq", "en"] as const;
export type DocLanguage = (typeof LANGUAGES)[number];

export type TemplateInput = {
  language: string;
  validFrom: string; // YYYY-MM-DD
  validTo?: string | null;
  html: string;
  notes?: string | null;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string) => new Date(`${s}T00:00:00Z`);

function check(type: string, input: TemplateInput) {
  if (!getDocumentType(type))
    throw new DomainError("VALIDATION", "Unknown type", { type: ["unknownType"] });
  const errors: Record<string, string[]> = {};
  if (!(LANGUAGES as readonly string[]).includes(input.language)) errors.language = ["badLanguage"];
  if (!DAY.test(input.validFrom) || Number.isNaN(day(input.validFrom).getTime()))
    errors.validFrom = ["badDate"];
  if (input.validTo) {
    if (!DAY.test(input.validTo) || Number.isNaN(day(input.validTo).getTime()))
      errors.validTo = ["badDate"];
    else if (!errors.validFrom && input.validTo < input.validFrom) errors.validTo = ["beforeFrom"];
  }
  if (!input.html.trim()) errors.html = ["required"];
  else if (input.html.length > 200_000) errors.html = ["tooLong"];
  else {
    try {
      validateTemplate(input.html);
    } catch (e) {
      if (!(e instanceof TemplateError)) throw e;
      errors.html = [`${e.code}:${e.line}`];
    }
  }
  if (Object.keys(errors).length > 0)
    throw new DomainError("VALIDATION", "Check the template", errors);
}

const summary = (t: {
  type: string;
  version: number;
  language: string;
  status: string;
  validFrom: Date;
  validTo: Date | null;
}) => ({
  type: t.type,
  version: t.version,
  language: t.language,
  status: t.status,
  validFrom: t.validFrom.toISOString().slice(0, 10),
  validTo: t.validTo?.toISOString().slice(0, 10) ?? null,
});

/** AC-1: a new draft; its version follows the type's latest (across languages). */
export async function createDraft(ctx: Ctx, type: string, input: TemplateInput) {
  check(type, input);
  const latest = await ctx.db.documentTemplate.aggregate({
    where: { type, language: input.language },
    _max: { version: true },
  });
  const created = await ctx.db.documentTemplate.create({
    data: {
      type,
      version: (latest._max.version ?? 0) + 1,
      language: input.language,
      validFrom: day(input.validFrom),
      validTo: input.validTo ? day(input.validTo) : null,
      html: input.html,
      notes: input.notes?.trim() || null,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "plt.document_template.create",
    entityType: "DocumentTemplate",
    entityId: created.id,
    before: null,
    after: summary(created),
  });
  return { templateId: created.id, version: created.version };
}

async function load(ctx: Ctx, id: string) {
  const t = await ctx.db.documentTemplate.findUnique({ where: { id } });
  if (!t) throw new DomainError("NOT_FOUND", "Template not found");
  return t;
}

export async function updateDraft(ctx: Ctx, id: string, input: TemplateInput) {
  const before = await load(ctx, id);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "Only a draft can be edited");
  check(before.type, input);
  const after = await ctx.db.documentTemplate.update({
    where: { id },
    data: {
      // the language is part of the version identity, so a draft may change it only to a free slot
      language: input.language,
      validFrom: day(input.validFrom),
      validTo: input.validTo ? day(input.validTo) : null,
      html: input.html,
      notes: input.notes?.trim() || null,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "plt.document_template.update",
    entityType: "DocumentTemplate",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
}

export async function publish(ctx: Ctx, id: string) {
  const before = await load(ctx, id);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "Only a draft can be published");
  const after = await ctx.db.documentTemplate.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date(), updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "plt.document_template.publish",
    entityType: "DocumentTemplate",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
}

export async function archive(ctx: Ctx, id: string) {
  const before = await load(ctx, id);
  if (before.status !== "PUBLISHED")
    throw new DomainError("CONFLICT", "Only a published template can be archived");
  const after = await ctx.db.documentTemplate.update({
    where: { id },
    data: { status: "ARCHIVED", updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "plt.document_template.archive",
    entityType: "DocumentTemplate",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
}

/** Drafts are technical rows and may be removed. */
export async function discardDraft(ctx: Ctx, id: string) {
  const before = await load(ctx, id);
  if (before.status !== "DRAFT") throw new DomainError("CONFLICT", "Only a draft can be discarded");
  await ctx.db.documentTemplate.delete({ where: { id } });
  await ctx.audit({
    action: "plt.document_template.discard",
    entityType: "DocumentTemplate",
    entityId: id,
    before: summary(before),
    after: null,
  });
}

/** AC-3: the published template valid on `on` (YYYY-MM-DD); the latest version wins. */
export async function findTemplate(db: Ctx["db"], type: string, language: string, on: string) {
  return db.documentTemplate.findFirst({
    where: {
      type,
      language,
      status: "PUBLISHED",
      validFrom: { lte: day(on) },
      OR: [{ validTo: null }, { validTo: { gte: day(on) } }],
    },
    orderBy: { version: "desc" },
  });
}
