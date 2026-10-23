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

/** Published authenticated forms a user may fill in (allowed roles are not modelled: see `ownerRoles`). */
export async function listAuthenticatedForms() {
  const rows = await db.formDefinition.findMany({
    where: { status: "PUBLISHED", audience: "AUTHENTICATED" },
    orderBy: { key: "asc" },
  });
  return rows.flatMap((r) => {
    const s = served(r);
    return s ? [s] : [];
  });
}
