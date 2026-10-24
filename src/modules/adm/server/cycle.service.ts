import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { DomainError, type ActionContext } from "@/lib/actions";
import { getYear } from "@/modules/org";
import type { CycleInput } from "../domain/schemas";

type Ctx = ActionContext;
const date = (d: string) => new Date(`${d}T00:00:00Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

const isUnique = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function refuse(errors: Record<string, string>): never {
  throw new DomainError(
    "VALIDATION",
    "Check the cycle",
    Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, [v]])),
  );
}

/**
 * AC-1: create a cycle or change one together with its document list. A document type that already
 * has uploaded files cannot be removed (it can be made optional instead).
 */
export async function saveCycle(ctx: Ctx, input: CycleInput) {
  const year = await getYear(input.academicYearId, ctx.db);
  if (!year) throw new DomainError("NOT_FOUND", "Academic year not found");
  if (year.status === "CLOSED") throw new DomainError("CONFLICT", "YEAR_CLOSED");

  const existing = input.cycleId
    ? await ctx.db.applicationCycle.findUnique({
        where: { id: input.cycleId },
        include: { documents: { orderBy: { sequence: "asc" } } },
      })
    : null;
  if (input.cycleId && !existing) throw new DomainError("NOT_FOUND", "Cycle not found");

  const data = {
    academicYearId: input.academicYearId,
    name: input.name,
    opensOn: date(input.opensOn),
    closesOn: date(input.closesOn),
    active: input.active,
  };
  let cycleId: string;
  try {
    if (existing) {
      await ctx.db.applicationCycle.update({
        where: { id: existing.id },
        data: { ...data, updatedById: ctx.user.id },
      });
      cycleId = existing.id;
    } else {
      cycleId = (
        await ctx.db.applicationCycle.create({
          data: { ...data, createdById: ctx.user.id, updatedById: ctx.user.id },
        })
      ).id;
    }
  } catch (error) {
    if (isUnique(error)) refuse({ name: "duplicate" });
    throw error;
  }

  if (existing) {
    const keep = new Set(input.documents.map((d) => d.key));
    const dropped = existing.documents.filter((d) => !keep.has(d.key)).map((d) => d.key);
    if (dropped.length > 0) {
      const used = await ctx.db.applicationDocument.count({
        where: { application: { cycleId }, documentKey: { in: dropped } },
      });
      if (used > 0) refuse({ documents: "inUse" });
      await ctx.db.applicationCycleDocument.deleteMany({
        where: { cycleId, key: { in: dropped } },
      });
    }
  }
  for (const [sequence, d] of input.documents.entries()) {
    const values = {
      labelSq: d.labelSq,
      labelEn: d.labelEn,
      required: d.required,
      sequence,
    };
    await ctx.db.applicationCycleDocument.upsert({
      where: { cycleId_key: { cycleId, key: d.key } },
      create: { cycleId, key: d.key, ...values },
      update: values,
    });
  }

  const docs = (list: { key: string; required: boolean }[]) =>
    list.map((d) => `${d.key}${d.required ? "*" : ""}`).join(",");
  await ctx.audit({
    action: existing ? "adm.cycle.update" : "adm.cycle.create",
    entityType: "ApplicationCycle",
    entityId: cycleId,
    before: existing
      ? {
          name: existing.name,
          opensOn: day(existing.opensOn),
          closesOn: day(existing.closesOn),
          active: existing.active,
          documents: docs(existing.documents),
        }
      : null,
    after: {
      name: input.name,
      opensOn: input.opensOn,
      closesOn: input.closesOn,
      active: input.active,
      documents: docs(input.documents),
    },
  });
  return { cycleId };
}
