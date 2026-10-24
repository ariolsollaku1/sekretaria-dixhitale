import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { can } from "@/lib/authz/guard";
import { db } from "@/lib/db";
import { inboxWhere } from "@/lib/forms/queries";
import { defineTable, registerTable } from "@/lib/tables/define";
import "@/modules/stu"; // registers stu.student.read, checked for the link to a student record
import "@/modules/hr"; // registers hr.staff.read, checked for the link to a staff record
import "../permissions";
import {
  APPLICANT_KINDS,
  applicantKind,
  ERASMUS_FORM_KEYS,
  ERASMUS_STATES,
  formKeysOf,
  nameOf,
  periodOf,
  type ApplicantKind,
} from "../domain/rules";
import { knownApplicants } from "./applicant-link";

type Row = {
  id: string;
  reference: string;
  kind: ApplicantKind;
  name: string;
  email: string;
  destination: string;
  mobilityType: string;
  answers: Record<string, unknown>;
  state: string;
  submittedAt: Date;
  known: { kind: "student" | "staff"; label: string; href: string | null } | null;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * AC-4..AC-8: the applications of the six Erasmus forms the user handles, with the known student or
 * staff record. The list narrows the forms inbox (`inboxWhere`) to the Erasmus form keys, so a user
 * who does not handle those forms sees no row.
 */
export const erasmusApplicationsTable = registerTable(
  defineTable<Row>({
    id: "ers.applications",
    permission: "ers.application.read",
    exportName: "erasmus-applications",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "reference",
        labelKey: "ers.columns.reference",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "kind", labelKey: "ers.columns.kind", type: "text" },
      { key: "name", labelKey: "ers.columns.name", type: "text" },
      { key: "email", labelKey: "ers.columns.email", type: "text" },
      { key: "destination", labelKey: "ers.columns.destination", type: "text" },
      { key: "mobilityType", labelKey: "ers.columns.mobilityType", type: "text" },
      { key: "period", labelKey: "ers.columns.period", type: "text" },
      { key: "state", labelKey: "ers.columns.state", type: "text" },
      { key: "known", labelKey: "ers.columns.known", type: "text" },
      { key: "submittedAt", labelKey: "ers.columns.submittedAt", type: "datetime", sortable: true },
    ],
    filters: [
      { key: "reference", labelKey: "ers.columns.reference", type: "text" },
      {
        key: "kind",
        labelKey: "ers.columns.kind",
        type: "select",
        options: APPLICANT_KINDS.map((v) => ({ value: v, labelKey: `ers.kinds.${v}` })),
      },
      {
        key: "state",
        labelKey: "ers.columns.state",
        type: "select",
        options: ERASMUS_STATES.map((v) => ({ value: v, labelKey: `ers.states.${v}` })),
      },
    ],
    defaultSort: { key: "submittedAt", dir: "desc" },
    values: {
      reference: (r) => r.reference,
      kind: (r, { t }) => t(`ers.kinds.${r.kind}`),
      name: (r) => r.name,
      email: (r) => r.email,
      destination: (r) => r.destination,
      mobilityType: (r, { t }) =>
        r.mobilityType && ["study", "traineeship", "teaching", "training"].includes(r.mobilityType)
          ? t(`ers.mobility.${r.mobilityType}`)
          : r.mobilityType,
      period: (r, { t }) =>
        periodOf(r.kind, r.answers, (term) =>
          ["autumn", "spring", "year"].includes(term) ? t(`ers.terms.${term}`) : term,
        ),
      state: (r, { t }) =>
        (ERASMUS_STATES as readonly string[]).includes(r.state)
          ? t(`ers.states.${r.state}`)
          : r.state,
      known: (r, { t }) =>
        r.known
          ? r.known.kind === "student"
            ? `${t("ers.known.student")} ${r.known.label}`.trim()
            : t("ers.known.staff")
          : "",
      submittedAt: (r) => r.submittedAt,
    },
    cells: {
      reference: (r) => (
        <Link href={`/forms/inbox/${r.id}`} className="font-tabular underline">
          {r.reference}
        </Link>
      ),
      known: (r, { t }) => {
        if (!r.known) return "";
        const text =
          r.known.kind === "student"
            ? `${t("ers.known.student")} ${r.known.label}`.trim()
            : t("ers.known.staff");
        return r.known.href ? (
          <Link href={r.known.href} className="underline">
            {text}
          </Link>
        ) : (
          text
        );
      },
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const keys =
        f.kind && (APPLICANT_KINDS as readonly string[]).includes(f.kind)
          ? formKeysOf(f.kind as ApplicantKind)
          : ERASMUS_FORM_KEYS;
      const and: Prisma.FormSubmissionWhereInput[] = [
        await inboxWhere(user.id),
        { definition: { key: { in: keys } } },
      ];
      if (f.reference) and.push({ reference: { contains: f.reference.toUpperCase() } });
      if (f.state) and.push({ state: f.state });
      const where: Prisma.FormSubmissionWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.FormSubmissionOrderByWithRelationInput[] =
        params.sort.key === "reference" ? [{ reference: dir }] : [{ submittedAt: dir }];
      const [total, subs] = await Promise.all([
        db.formSubmission.count({ where }),
        db.formSubmission.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            definition: { select: { key: true } },
            submitter: { select: { name: true, email: true } },
          },
        }),
      ]);
      const parsed = subs.map((s) => ({
        s,
        kind: applicantKind(s.definition.key)!,
        answers: (s.answers ?? {}) as Record<string, unknown>,
      }));
      const [known, mayStudent, mayStaff] = await Promise.all([
        knownApplicants(
          parsed.map((p) => ({
            submissionId: p.s.id,
            kind: p.kind,
            submitterId: p.s.submitterId,
            answers: p.answers,
          })),
        ),
        can(user, "stu.student.read"),
        can(user, "hr.staff.read"),
      ]);
      return {
        total,
        rows: parsed.map(({ s, kind, answers }) => {
          const k = known.get(s.id);
          return {
            id: s.id,
            reference: s.reference,
            kind,
            name: nameOf(answers) || s.submitter?.name || "",
            email: str(answers.email) || s.submitter?.email || "",
            destination: str(answers.destination),
            mobilityType: str(answers.mobilityType),
            answers,
            state: s.state,
            submittedAt: s.submittedAt,
            known: k
              ? {
                  kind: k.kind,
                  label: k.label,
                  // AC-6: a link only for those who may read that kind of record
                  href:
                    k.kind === "student" && mayStudent
                      ? `/stu/students/${k.id}`
                      : k.kind === "staff" && mayStaff
                        ? `/hr/staff/${k.id}`
                        : null,
                }
              : null,
          };
        }),
      };
    },
  }),
);
