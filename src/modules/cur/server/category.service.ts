import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";

type Ctx = ActionContext;
type Fields = { code: string; nameSq: string; nameEn: string };

const summary = (c: Fields & { active: boolean }) => ({
  code: c.code,
  nameSq: c.nameSq,
  nameEn: c.nameEn,
  active: c.active,
});

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError("VALIDATION", "Code already used", { code: ["codeTaken"] });
    }
    throw error;
  }
}

/** AC-2 */
export async function createCategory(ctx: Ctx, input: Fields) {
  const category = await guarded(() =>
    ctx.db.courseCategory.create({
      data: { ...input, createdById: ctx.user.id, updatedById: ctx.user.id },
    }),
  );
  await ctx.audit({
    action: "cur.category.create",
    entityType: "CourseCategory",
    entityId: category.id,
    before: null,
    after: summary(category),
  });
  return { id: category.id };
}

export async function updateCategory(ctx: Ctx, id: string, input: Fields) {
  const before = await ctx.db.courseCategory.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Category not found");
  const after = await guarded(() =>
    ctx.db.courseCategory.update({ where: { id }, data: { ...input, updatedById: ctx.user.id } }),
  );
  await ctx.audit({
    action: "cur.category.update",
    entityType: "CourseCategory",
    entityId: id,
    before: summary(before),
    after: summary(after),
  });
  return { id };
}

/** Deactivation keeps old courses as they are; only new choices are blocked. */
export async function setCategoryActive(ctx: Ctx, id: string, active: boolean) {
  const before = await ctx.db.courseCategory.findUnique({ where: { id } });
  if (!before) throw new DomainError("NOT_FOUND", "Category not found");
  if (before.active === active)
    throw new DomainError("CONFLICT", active ? "ALREADY_ACTIVE" : "ALREADY_INACTIVE");
  await ctx.db.courseCategory.update({ where: { id }, data: { active, updatedById: ctx.user.id } });
  await ctx.audit({
    action: active ? "cur.category.reactivate" : "cur.category.deactivate",
    entityType: "CourseCategory",
    entityId: id,
    before: { active: !active },
    after: { active },
    reason: ctx.reason,
  });
}
