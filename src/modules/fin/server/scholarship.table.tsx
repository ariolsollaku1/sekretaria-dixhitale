import "server-only";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { defineTable, registerTable } from "@/lib/tables/define";
import "../permissions";
import { centsOf, displayMoney, formatCents } from "../domain/money";
import {
  SCHOLARSHIP_CATEGORIES,
  SCHOLARSHIP_TYPES,
  countScholarships,
  feeEffect,
} from "../domain/scholarship-rules";
import { finProgramScope } from "./fee.queries";

type Row = {
  id: string;
  studentNumber: string;
  name: string;
  program: string;
  year: string;
  type: string;
  category: string;
  terms: string;
  status: "ACTIVE" | "VOID";
  /** Tuition before the scholarship, the reduction and tuition after it; empty without a plan. */
  before: string;
  reduction: string;
  after: string;
  planTotal: string;
  planId: string | null;
};

const termsText = (s: { type: string; percent: string | null; amount: string | null }) =>
  s.type === "FULL" ? "100 %" : s.percent ? `${s.percent} %` : (s.amount ?? "");

/**
 * SRC-083, AC-9: the students with full or partial scholarships in the selected academic year with
 * their fees (tuition before the scholarship, the reduction, tuition after, plan total), within the
 * reader's programs.
 */
export const scholarshipsTable = registerTable(
  defineTable<Row>({
    id: "fin.scholarships",
    permission: "fin.scholarship.read",
    exportName: "scholarships",
    rowKey: (r) => r.id,
    columns: [
      {
        key: "studentNumber",
        labelKey: "fin.columns.studentNumber",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "name", labelKey: "fin.columns.name", type: "text", sortable: true },
      { key: "program", labelKey: "fin.columns.program", type: "text", sortable: true },
      { key: "year", labelKey: "fin.columns.year", type: "text" },
      { key: "type", labelKey: "fin.scholarship.columns.type", type: "text" },
      { key: "category", labelKey: "fin.scholarship.columns.category", type: "text" },
      { key: "terms", labelKey: "fin.scholarship.columns.terms", type: "text" },
      { key: "before", labelKey: "fin.scholarship.columns.before", type: "text" },
      { key: "reduction", labelKey: "fin.scholarship.columns.reduction", type: "text" },
      { key: "after", labelKey: "fin.scholarship.columns.after", type: "text" },
      { key: "planTotal", labelKey: "fin.scholarship.columns.planTotal", type: "text" },
      { key: "status", labelKey: "fin.scholarship.columns.status", type: "text" },
    ],
    filters: [
      { key: "studentNumber", labelKey: "fin.columns.studentNumber", type: "text" },
      { key: "name", labelKey: "fin.columns.name", type: "text" },
      { key: "program", labelKey: "fin.columns.programCode", type: "text" },
      {
        key: "type",
        labelKey: "fin.scholarship.columns.type",
        type: "select",
        options: SCHOLARSHIP_TYPES.map((v) => ({
          value: v,
          labelKey: `fin.scholarship.type.${v}`,
        })),
      },
      {
        key: "category",
        labelKey: "fin.scholarship.columns.category",
        type: "select",
        options: SCHOLARSHIP_CATEGORIES.map((v) => ({
          value: v,
          labelKey: `fin.scholarship.category.${v}`,
        })),
      },
      {
        key: "status",
        labelKey: "fin.scholarship.columns.status",
        type: "select",
        options: [
          { value: "ACTIVE", labelKey: "fin.scholarship.status.ACTIVE" },
          { value: "VOID", labelKey: "fin.scholarship.status.VOID" },
        ],
      },
    ],
    defaultSort: { key: "studentNumber", dir: "asc" },
    values: {
      studentNumber: (r) => r.studentNumber,
      name: (r) => r.name,
      program: (r) => r.program,
      year: (r) => r.year,
      type: (r, { t }) => t(`fin.scholarship.type.${r.type}`),
      category: (r, { t }) => t(`fin.scholarship.category.${r.category}`),
      terms: (r) => r.terms,
      before: (r) => r.before,
      reduction: (r) => r.reduction,
      after: (r) => r.after,
      planTotal: (r) => r.planTotal,
      status: (r, { t }) => t(`fin.scholarship.status.${r.status}`),
    },
    cells: {
      studentNumber: (r) =>
        r.planId ? (
          <Link href={`/fin/plans/${r.planId}`} className="font-tabular underline">
            {r.studentNumber}
          </Link>
        ) : (
          <span className="font-tabular">{r.studentNumber}</span>
        ),
      before: (r) => <span className="font-tabular">{r.before && displayMoney(r.before)}</span>,
      reduction: (r) => (
        <span className="font-tabular">{r.reduction && displayMoney(r.reduction)}</span>
      ),
      after: (r) => <span className="font-tabular">{r.after && displayMoney(r.after)}</span>,
      planTotal: (r) => (
        <span className="font-tabular">{r.planTotal && displayMoney(r.planTotal)}</span>
      ),
    },
    async fetch(params, { user }) {
      const yearId = await getSelectedAcademicYear();
      if (!yearId) return { total: 0, rows: [] };
      const f = params.filters;
      const and: Prisma.ScholarshipWhereInput[] = [
        {
          academicYearId: yearId,
          enrollment: { program: await finProgramScope(user, "fin.scholarship.read") },
        },
      ];
      if (f.studentNumber)
        and.push({ enrollment: { student: { studentNumber: { contains: f.studentNumber } } } });
      if (f.name)
        and.push({
          enrollment: {
            student: {
              person: {
                OR: [
                  { firstName: { contains: f.name, mode: "insensitive" } },
                  { lastName: { contains: f.name, mode: "insensitive" } },
                ],
              },
            },
          },
        });
      if (f.program)
        and.push({ enrollment: { program: { code: { contains: f.program.toUpperCase() } } } });
      if (f.type === "FULL" || f.type === "PARTIAL") and.push({ type: f.type });
      if (f.category && (SCHOLARSHIP_CATEGORIES as readonly string[]).includes(f.category))
        and.push({ category: f.category as (typeof SCHOLARSHIP_CATEGORIES)[number] });
      if (f.status === "VOID") and.push({ voidedAt: { not: null } });
      else if (f.status === "ACTIVE") and.push({ voidedAt: null });
      const where: Prisma.ScholarshipWhereInput = { AND: and };
      const dir = params.sort.dir;
      const orderBy: Prisma.ScholarshipOrderByWithRelationInput[] =
        params.sort.key === "name"
          ? [{ enrollment: { student: { person: { lastName: dir } } } }]
          : params.sort.key === "program"
            ? [{ enrollment: { program: { code: dir } } }, { id: "asc" }]
            : [{ enrollment: { student: { studentNumber: dir } } }, { id: "asc" }];
      const [total, rows] = await Promise.all([
        db.scholarship.count({ where }),
        db.scholarship.findMany({
          where,
          orderBy,
          skip: (params.page - 1) * params.pageSize,
          take: params.pageSize,
          include: {
            academicYear: { select: { code: true } },
            cuts: { select: { amount: true } },
            enrollment: {
              select: {
                program: { select: { code: true } },
                student: {
                  select: {
                    studentNumber: true,
                    person: { select: { firstName: true, lastName: true } },
                  },
                },
                paymentPlans: {
                  where: { academicYearId: yearId },
                  select: {
                    id: true,
                    installments: { select: { kind: true, status: true, amount: true } },
                  },
                },
              },
            },
          },
        }),
      ]);
      return {
        total,
        rows: rows.map((s): Row => {
          const plan = s.enrollment.paymentPlans[0] ?? null;
          const voided = s.voidedAt !== null;
          let before = "";
          let reduction = "";
          let after = "";
          let planTotal = "";
          if (plan) {
            const active = plan.installments.filter((i) => i.status === "ACTIVE");
            const tuitionNow = active
              .filter((i) => i.kind === "TUITION")
              .reduce((a, i) => a + centsOf(i.amount), 0);
            // a voided scholarship has given its reduction back
            const cut = voided ? 0 : s.cuts.reduce((a, c) => a + centsOf(c.amount), 0);
            const effect = feeEffect(tuitionNow + cut, cut);
            before = formatCents(effect.beforeCents);
            reduction = formatCents(effect.cutCents);
            after = formatCents(effect.afterCents);
            planTotal = formatCents(active.reduce((a, i) => a + centsOf(i.amount), 0));
          }
          return {
            id: s.id,
            studentNumber: s.enrollment.student.studentNumber,
            name: `${s.enrollment.student.person.lastName} ${s.enrollment.student.person.firstName}`,
            program: s.enrollment.program.code,
            year: s.academicYear.code,
            type: s.type,
            category: s.category,
            terms: termsText({
              type: s.type,
              percent: s.percent ? s.percent.toFixed(2) : null,
              amount: s.amount ? s.amount.toFixed(2) : null,
            }),
            status: voided ? "VOID" : "ACTIVE",
            before,
            reduction,
            after,
            planTotal,
            planId: plan?.id ?? null,
          };
        }),
      };
    },
  }),
);

type ReportRow = ReturnType<typeof countScholarships>[number];

/**
 * SRC-084, AC-10: the number of scholarships per academic year and study program (live ones only),
 * split into full / partial and by kind, within the reader's programs.
 */
export const scholarshipReportTable = registerTable(
  defineTable<ReportRow>({
    id: "fin.scholarshipReport",
    permission: "fin.scholarship.read",
    exportName: "scholarship-report",
    rowKey: (r) => `${r.yearCode}|${r.programCode}`,
    columns: [
      {
        key: "year",
        labelKey: "fin.columns.year",
        type: "text",
        sortable: true,
        alwaysVisible: true,
      },
      { key: "program", labelKey: "fin.columns.program", type: "text", sortable: true },
      { key: "total", labelKey: "fin.scholarship.report.total", type: "number" },
      { key: "full", labelKey: "fin.scholarship.type.FULL", type: "number" },
      { key: "partial", labelKey: "fin.scholarship.type.PARTIAL", type: "number" },
      { key: "excellence", labelKey: "fin.scholarship.category.EXCELLENCE", type: "number" },
      { key: "need", labelKey: "fin.scholarship.category.NEED", type: "number" },
      { key: "disability", labelKey: "fin.scholarship.category.DISABILITY", type: "number" },
      { key: "other", labelKey: "fin.scholarship.category.OTHER", type: "number" },
    ],
    filters: [
      { key: "year", labelKey: "fin.columns.year", type: "text" },
      { key: "program", labelKey: "fin.columns.programCode", type: "text" },
    ],
    defaultSort: { key: "year", dir: "desc" },
    values: {
      year: (r) => r.yearCode,
      program: (r) => r.programCode,
      total: (r) => r.total,
      full: (r) => r.full,
      partial: (r) => r.partial,
      excellence: (r) => r.byCategory.EXCELLENCE,
      need: (r) => r.byCategory.NEED,
      disability: (r) => r.byCategory.DISABILITY,
      other: (r) => r.byCategory.OTHER,
    },
    async fetch(params, { user }) {
      const f = params.filters;
      const rows = await db.scholarship.findMany({
        where: {
          voidedAt: null,
          enrollment: {
            program: {
              AND: [
                await finProgramScope(user, "fin.scholarship.read"),
                f.program ? { code: { contains: f.program.toUpperCase() } } : {},
              ],
            },
          },
          ...(f.year ? { academicYear: { code: { contains: f.year } } } : {}),
        },
        select: {
          type: true,
          category: true,
          academicYear: { select: { code: true } },
          enrollment: { select: { program: { select: { code: true } } } },
        },
      });
      const all = countScholarships(
        rows.map((r) => ({
          yearCode: r.academicYear.code,
          programCode: r.enrollment.program.code,
          type: r.type,
          category: r.category,
        })),
      );
      const sign = params.sort.dir === "asc" ? 1 : -1;
      all.sort((a, b) =>
        params.sort.key === "program"
          ? sign * a.programCode.localeCompare(b.programCode) ||
            a.yearCode.localeCompare(b.yearCode)
          : sign * a.yearCode.localeCompare(b.yearCode) ||
            a.programCode.localeCompare(b.programCode),
      );
      const start = (params.page - 1) * params.pageSize;
      return { total: all.length, rows: all.slice(start, start + params.pageSize) };
    },
  }),
);
