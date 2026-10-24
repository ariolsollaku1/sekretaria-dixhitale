import "server-only";
import { db, type Tx } from "@/lib/db";
import { validateDefinition, type FormDefinitionJson } from "./definition";

type Client = Pick<Tx, "formDefinition">;

export type ServedForm = {
  id: string;
  key: string;
  version: number;
  audience: "PUBLIC" | "AUTHENTICATED";
  ownerRoles: string[];
  definition: FormDefinitionJson;
};

function served(row: {
  id: string;
  key: string;
  version: number;
  audience: "PUBLIC" | "AUTHENTICATED";
  ownerRoles: string[];
  definition: unknown;
}): ServedForm | null {
  const check = validateDefinition(row.definition, row.audience);
  return check.ok
    ? {
        id: row.id,
        key: row.key,
        version: row.version,
        audience: row.audience,
        ownerRoles: row.ownerRoles,
        definition: check.definition,
      }
    : null; // a stored definition that no longer validates is not served
}

/** AC-4: the served (published) version of a key. */
export async function getPublishedForm(
  key: string,
  client: Client = db,
): Promise<ServedForm | null> {
  const row = await client.formDefinition.findFirst({ where: { key, status: "PUBLISHED" } });
  return row ? served(row) : null;
}

export async function getFormById(
  id: string,
  client: Client = db,
): Promise<(ServedForm & { status: string }) | null> {
  const row = await client.formDefinition.findUnique({ where: { id } });
  const s = row ? served(row) : null;
  return row && s ? { ...s, status: row.status } : null;
}

export async function listDefinitions() {
  const rows = await db.formDefinition.findMany({
    orderBy: [{ key: "asc" }, { version: "desc" }],
    select: {
      id: true,
      key: true,
      version: true,
      status: true,
      audience: true,
      definition: true,
      _count: { select: { submissions: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    version: r.version,
    status: r.status,
    audience: r.audience,
    title: ((r.definition as { title?: { sq?: string } })?.title?.sq ?? r.key) as string,
    submissions: r._count.submissions,
  }));
}

/** The raw row for the editor (the JSON as stored, even if it no longer validates). */
export async function getDefinitionRow(id: string) {
  return db.formDefinition.findUnique({ where: { id } });
}

/** Published authenticated forms a user may fill in (`submitRoles` of the definition, OFF-01). */
export async function listAuthenticatedForms(userId?: string) {
  const roles = userId ? await currentRoles(userId) : null;
  const rows = await db.formDefinition.findMany({
    where: { status: "PUBLISHED", audience: "AUTHENTICATED" },
    orderBy: { key: "asc" },
  });
  return rows.flatMap((r) => {
    const s = served(r);
    return s && (!roles || maySubmit(s.definition, roles)) ? [s] : [];
  });
}

/** INT-06 AC-1/AC-2: the served public forms, for the public index and the website links page. */
export async function listPublicForms() {
  const rows = await db.formDefinition.findMany({
    where: { status: "PUBLISHED", audience: "PUBLIC" },
    orderBy: { key: "asc" },
  });
  return rows.flatMap((r) => {
    const s = served(r);
    return s ? [s] : [];
  });
}

// ---- inbox (AC-7) --------------------------------------------------------------------------------
import type { Prisma } from "@/generated/prisma/client";
import { maySubmit } from "./answers";
import { currentRoles, mayHandle } from "./access";

/** The submissions a user may handle: the sysadmin all, others those of forms they own a role of. */
export async function inboxWhere(userId: string): Promise<Prisma.FormSubmissionWhereInput> {
  const roles = await currentRoles(userId);
  if (roles.includes("sysadmin")) return {};
  if (roles.length === 0) return { id: { in: [] } };
  return { definition: { ownerRoles: { hasSome: roles as never } } };
}

export async function getSubmission(userId: string, id: string) {
  const row = await db.formSubmission.findFirst({
    where: { AND: [{ id }, await inboxWhere(userId)] },
    include: {
      definition: true,
      submitter: { select: { id: true, name: true, email: true } },
      assignee: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!row) return null;
  const form = served({ ...row.definition });
  if (!form) return null;
  const actorIds = [...new Set(row.events.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = await db.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true },
  });
  return { submission: row, form, actors: new Map(actors.map((a) => [a.id, a.name])) };
}

/** Staff who could be assigned a submission of this form. */
export async function listAssignees(ownerRoles: readonly string[]) {
  const now = new Date();
  const users = await db.user.findMany({
    where: {
      active: true,
      roles: {
        some: {
          role: { in: [...ownerRoles, "sysadmin"] as never },
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return users;
}

/** A signed-in user's own submissions. */
export async function mySubmissions(userId: string) {
  const rows = await db.formSubmission.findMany({
    where: { submitterId: userId },
    orderBy: { submittedAt: "desc" },
    include: { definition: true },
    take: 100,
  });
  return rows.flatMap((r) => {
    const form = served({ ...r.definition });
    return form
      ? [{ id: r.id, reference: r.reference, state: r.state, submittedAt: r.submittedAt, form }]
      : [];
  });
}

export { mayHandle };
