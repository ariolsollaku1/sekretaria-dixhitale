import "server-only";
import { db } from "@/lib/db";
import { applicationsTable } from "@/modules/adm";
import { coursesTable } from "@/modules/cur";
import { staffTable } from "@/modules/hr";
import { usersTable } from "@/modules/iam";
import { programsTable } from "@/modules/org";
import { studentsTable } from "@/modules/stu";
import { HITS_PER_GROUP, registerSearchSource } from "./registry";
import { tableSource } from "./table-source";

// PLT-16 v1: record types a user can jump to. Each reuses its list's permission and scope.
const q = (query: string) => [{ q: query }];

registerSearchSource(
  tableSource({
    id: "students",
    groupKey: "students",
    table: studentsTable,
    filters: q,
    hit: (r) => ({
      id: r.id,
      title: r.name,
      subtitle: [r.studentNumber, r.program].filter(Boolean).join(" · "),
      href: `/stu/students/${r.id}`,
    }),
  }),
  tableSource({
    id: "applications",
    groupKey: "applications",
    table: applicationsTable,
    // The list has no combined filter: match the applicant's name and the reference number.
    filters: (query): Record<string, string>[] => [{ name: query }, { reference: query }],
    hit: (r) => ({
      id: r.id,
      title: r.name,
      subtitle: [r.reference, r.program].join(" · "),
      href: `/adm/applications/${r.id}`,
    }),
  }),
  tableSource({
    id: "staff",
    groupKey: "staff",
    table: staffTable,
    filters: q,
    hit: (r) => ({
      id: r.id,
      title: r.name,
      subtitle: [r.title || r.category, r.department].filter(Boolean).join(" · "),
      href: `/hr/staff/${r.id}`,
    }),
  }),
  tableSource({
    id: "programs",
    groupKey: "programs",
    table: programsTable,
    filters: q,
    hit: (r) => ({ id: r.id, title: r.name, subtitle: r.code, href: `/org/programs/${r.id}` }),
  }),
  tableSource({
    id: "courses",
    groupKey: "courses",
    table: coursesTable,
    filters: q,
    hit: (r) => ({ id: r.id, title: r.name, subtitle: r.code, href: `/cur/courses/${r.id}` }),
  }),
  tableSource({
    id: "users",
    groupKey: "users",
    table: usersTable,
    filters: q,
    hit: (r) => ({ id: r.id, title: r.name, subtitle: r.email, href: `/admin/users/${r.id}` }),
  }),
  {
    // Issued documents have no list table; the admin page is gated by this same permission.
    id: "documents",
    groupKey: "documents",
    permission: "plt.document.manage",
    async run(query) {
      const rows = await db.issuedDocument.findMany({
        where: { number: { contains: query, mode: "insensitive" } },
        orderBy: { issuedAt: "desc" },
        take: HITS_PER_GROUP,
        select: { id: true, number: true, type: true },
      });
      return rows.map((r) => ({
        id: r.id,
        title: r.number,
        subtitle: r.type,
        href: "/admin/documents/issued",
      }));
    },
  },
);
