import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import { stateDef } from "./answers";
import { localize, validateDefinition } from "./definition";
import { inboxWhere } from "./queries";

type Row = {
  id: string;
  reference: string;
  form: string;
  formKey: string;
  state: string;
  submitter: string;
  assignee: string;
  submittedAt: Date;
};

/** AC-7: the submissions of the forms the user handles. */
export const formSubmissionsTable = registerTable(
  defineTable<Row>({
    id: "plt.form-submissions",
    permission: "plt.form.inbox",
    exportName: "form-submissions",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "reference",
        labelKey: "forms.columns.reference",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "form", labelKey: "forms.columns.form", type: "text" },
      { key: "state", labelKey: "forms.columns.state", type: "text" },
      { key: "submitter", labelKey: "forms.columns.submitter", type: "text" },
      { key: "assignee", labelKey: "forms.columns.assignee", type: "text" },
      {
        key: "submittedAt",
        labelKey: "forms.columns.submittedAt",
        type: "datetime",
        sortable: true,
      },
    ],
    filters: [
      { key: "reference", labelKey: "forms.columns.reference", type: "text" },
      { key: "form", labelKey: "forms.columns.formKey", type: "text" },
      { key: "state", labelKey: "forms.columns.stateKey", type: "text" },
      {
        key: "assignee",
        labelKey: "forms.columns.assignee",
        type: "select",
        options: [
          { value: "me", labelKey: "forms.assignedToMe" },
          { value: "none", labelKey: "forms.unassigned" },
        ],
      },
    ],
    defaultSort: { key: "submittedAt", dir: "desc" },
    values: {
      reference: (r) => r.reference,
      form: (r) => r.form,
      state: (r) => r.state,
      submitter: (r) => r.submitter,
      assignee: (r) => r.assignee,
      submittedAt: (r) => r.submittedAt,
    },
    cells: {
      reference: (r) => (
        <Link href={`/forms/inbox/${r.id}`} className="font-tabular underline">
          {r.reference}
        </Link>
      ),
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const and: Prisma.FormSubmissionWhereInput[] = [await inboxWhere(user.id)];
      if (f.reference) and.push({ reference: { contains: f.reference.toUpperCase() } });
      if (f.form) and.push({ definition: { key: { contains: f.form.toLowerCase() } } });
      if (f.state) and.push({ state: { contains: f.state } });
      if (f.assignee === "me") and.push({ assigneeId: user.id });
      if (f.assignee === "none") and.push({ assigneeId: null });
      const where: Prisma.FormSubmissionWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.FormSubmissionOrderByWithRelationInput[] =
        params.sort.key === "reference" ? [{ reference: dir }] : [{ submittedAt: dir }];
      const [total, rows] = await Promise.all([
        db.formSubmission.count({ where }),
        db.formSubmission.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            definition: true,
            submitter: { select: { name: true } },
            assignee: { select: { name: true } },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((s) => {
          const parsed = validateDefinition(s.definition.definition, s.definition.audience);
          const def = parsed.ok ? parsed.definition : null;
          return {
            id: s.id,
            reference: s.reference,
            form: def ? localize(def.title, "sq") : s.definition.key,
            formKey: s.definition.key,
            state: def ? localize(stateDef(def, s.state)?.label, "sq") || s.state : s.state,
            submitter: s.submitter?.name ?? "—",
            assignee: s.assignee?.name ?? "",
            submittedAt: s.submittedAt,
          };
        }),
      };
    },
  }),
);
