import "server-only";
import { db } from "@/lib/db";
import { maySubmit } from "@/lib/forms/answers";
import { currentRoles } from "@/lib/forms/access";
import { validateDefinition, type FormDefinitionJson } from "@/lib/forms/definition";
import { STAFF_FORM_KEYS } from "../domain/request-rules";

export type RequestRow = {
  id: string;
  reference: string;
  formKey: string;
  title: { sq: string; en?: string };
  state: string;
  stateLabel: { sq: string; en?: string };
  submittedAt: Date;
  /** Period of a leave or an authorization, when the form has one (ISO days) */
  from: string | null;
  to: string | null;
};

type SubmissionWithForm = Awaited<ReturnType<typeof loadSubmissions>>[number];

function loadSubmissions(userId: string) {
  return db.formSubmission.findMany({
    where: { submitterId: userId, definition: { key: { in: [...STAFF_FORM_KEYS] } } },
    orderBy: { submittedAt: "desc" },
    take: 200,
    include: { definition: true },
  });
}

function toRow(r: SubmissionWithForm): RequestRow | null {
  const parsed = validateDefinition(r.definition.definition, r.definition.audience);
  if (!parsed.ok) return null;
  const def: FormDefinitionJson = parsed.definition;
  const answers = r.answers as Record<string, unknown>;
  const day = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
  return {
    id: r.id,
    reference: r.reference,
    formKey: r.definition.key,
    title: def.title,
    state: r.state,
    stateLabel: def.workflow.states.find((s) => s.key === r.state)?.label ?? { sq: r.state },
    submittedAt: r.submittedAt,
    from: day(answers.startDate) ?? day(answers.validFrom) ?? day(answers.neededBy),
    to: day(answers.endDate) ?? day(answers.validTo),
  };
}

/** AC-8: the requests a user made, newest first. */
export async function myRequests(userId: string): Promise<RequestRow[]> {
  return (await loadSubmissions(userId)).flatMap((r) => toRow(r) ?? []);
}

/** AC-8: the staff request forms the user may still submit (published, `submitRoles` respected). */
export async function submittableForms(userId: string) {
  const [rows, roles] = await Promise.all([
    db.formDefinition.findMany({
      where: { status: "PUBLISHED", audience: "AUTHENTICATED", key: { in: [...STAFF_FORM_KEYS] } },
    }),
    currentRoles(userId),
  ]);
  return STAFF_FORM_KEYS.flatMap((key) => {
    const row = rows.find((r) => r.key === key);
    const parsed = row ? validateDefinition(row.definition, row.audience) : null;
    return row && parsed?.ok && maySubmit(parsed.definition, roles)
      ? [{ key, title: parsed.definition.title, description: parsed.definition.description }]
      : [];
  });
}

/** AC-9: the people who made at least one staff request, to pick from. */
export async function requestingStaff() {
  const groups = await db.formSubmission.groupBy({
    by: ["submitterId"],
    where: { submitterId: { not: null }, definition: { key: { in: [...STAFF_FORM_KEYS] } } },
    _count: { _all: true },
  });
  const ids = groups.flatMap((g) => (g.submitterId ? [g.submitterId] : []));
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const count = new Map(groups.map((g) => [g.submitterId, g._count._all]));
  return users.map((u) => ({ id: u.id, name: u.name, count: count.get(u.id) ?? 0 }));
}

/** AC-9: every staff request of one person. The caller checks `off.request.history`. */
export const staffHistory = myRequests;
