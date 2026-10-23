import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { ROLES, type Role } from "@/lib/authz/roles";
import { validateDefinition } from "./definition";

type Ctx = ActionContext;

export const FORM_KEY_PATTERN = /^[a-z][a-z0-9-]{1,60}$/;

export type DraftInput = {
  audience: "PUBLIC" | "AUTHENTICATED";
  ownerRoles: string[];
  /** the definition as JSON text (the editor's content) */
  definition: string;
};

/** AC-2: parse + validate; every problem is reported as `path:code` under the field `definition`. */
function parse(input: DraftInput) {
  let json: unknown;
  try {
    json = JSON.parse(input.definition);
  } catch {
    throw new DomainError("VALIDATION", "Check the definition", { definition: ["invalidJson"] });
  }
  const result = validateDefinition(json, input.audience);
  if (!result.ok)
    throw new DomainError("VALIDATION", "Check the definition", {
      definition: result.errors.map((e) => `${e.path}:${e.code}`),
    });
  const unknownRoles = input.ownerRoles.filter((r) => !(ROLES as readonly string[]).includes(r));
  if (unknownRoles.length > 0)
    throw new DomainError("VALIDATION", "Check the roles", { ownerRoles: ["unknownRole"] });
  return { json: result.definition, ownerRoles: [...new Set(input.ownerRoles)] as Role[] };
}

const summary = (d: {
  key: string;
  version: number;
  status: string;
  audience: string;
  ownerRoles: string[];
}) => ({
  key: d.key,
  version: d.version,
  status: d.status,
  audience: d.audience,
  ownerRoles: d.ownerRoles.join(","),
});

/** AC-1/AC-2/AC-11: a new draft; its version follows the key's latest. */
export async function createDraft(ctx: Ctx, key: string, input: DraftInput) {
  if (!FORM_KEY_PATTERN.test(key))
    throw new DomainError("VALIDATION", "Check the key", { key: ["badKey"] });
  const { json, ownerRoles } = parse(input);
  const latest = await ctx.db.formDefinition.findFirst({
    where: { key },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  try {
    const created = await ctx.db.formDefinition.create({
      data: {
        key,
        version: (latest?.version ?? 0) + 1,
        audience: input.audience,
        ownerRoles,
        definition: json as Prisma.InputJsonValue,
        createdById: ctx.user.id,
        updatedById: ctx.user.id,
      },
    });
    await ctx.audit({
      action: "plt.form_definition.create",
      entityType: "FormDefinition",
      entityId: created.id,
      before: null,
      after: summary(created),
    });
    return { definitionId: created.id, version: created.version };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new DomainError("CONFLICT", "VERSION_TAKEN");
    throw error;
  }
}

async function loadDraft(ctx: Ctx, id: string) {
  const d = await ctx.db.formDefinition.findUnique({ where: { id } });
  if (!d) throw new DomainError("NOT_FOUND", "Form not found");
  // AC-3
  if (d.status !== "DRAFT") throw new DomainError("CONFLICT", "NOT_DRAFT");
  return d;
}

export async function updateDraft(ctx: Ctx, id: string, input: DraftInput) {
  const before = await loadDraft(ctx, id);
  const { json, ownerRoles } = parse(input);
  await ctx.db.formDefinition.update({
    where: { id },
    data: {
      audience: input.audience,
      ownerRoles,
      definition: json as Prisma.InputJsonValue,
      updatedById: ctx.user.id,
    },
  });
  await ctx.audit({
    action: "plt.form_definition.update",
    entityType: "FormDefinition",
    entityId: id,
    before: summary(before),
    after: summary({ ...before, audience: input.audience, ownerRoles }),
  });
  return { definitionId: id };
}

/** AC-3: the draft becomes the served version of its key; the previous published one is archived first. */
export async function publish(ctx: Ctx, id: string) {
  const draft = await loadDraft(ctx, id);
  // re-validate: the stored JSON must still be a valid definition for its audience
  const check = validateDefinition(draft.definition, draft.audience);
  if (!check.ok)
    throw new DomainError("VALIDATION", "Check the definition", {
      definition: check.errors.map((e) => `${e.path}:${e.code}`),
    });
  const previous = await ctx.db.formDefinition.findFirst({
    where: { key: draft.key, status: "PUBLISHED" },
  });
  if (previous) {
    await ctx.db.formDefinition.update({
      where: { id: previous.id },
      data: { status: "ARCHIVED", updatedById: ctx.user.id },
    });
    await ctx.audit({
      action: "plt.form_definition.archive",
      entityType: "FormDefinition",
      entityId: previous.id,
      before: { status: "PUBLISHED" },
      after: { status: "ARCHIVED" },
    });
  }
  await ctx.db.formDefinition.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date(), updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "plt.form_definition.publish",
    entityType: "FormDefinition",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "PUBLISHED" },
  });
  return { definitionId: id, archivedId: previous?.id ?? null };
}

/** Takes a form out of service: its public/authenticated page answers 404 until a new version is published. */
export async function archive(ctx: Ctx, id: string) {
  const d = await ctx.db.formDefinition.findUnique({ where: { id } });
  if (!d) throw new DomainError("NOT_FOUND", "Form not found");
  if (d.status !== "PUBLISHED") throw new DomainError("CONFLICT", "NOT_PUBLISHED");
  await ctx.db.formDefinition.update({
    where: { id },
    data: { status: "ARCHIVED", updatedById: ctx.user.id },
  });
  await ctx.audit({
    action: "plt.form_definition.archive",
    entityType: "FormDefinition",
    entityId: id,
    before: { status: "PUBLISHED" },
    after: { status: "ARCHIVED" },
    reason: ctx.reason,
  });
  return { definitionId: id };
}

/** A draft is a technical row and may be deleted; published and archived versions never. */
export async function deleteDraft(ctx: Ctx, id: string) {
  const d = await loadDraft(ctx, id);
  await ctx.db.formDefinition.delete({ where: { id } });
  await ctx.audit({
    action: "plt.form_definition.delete",
    entityType: "FormDefinition",
    entityId: id,
    before: summary(d),
    after: null,
  });
  return { key: d.key };
}
