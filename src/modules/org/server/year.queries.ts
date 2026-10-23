import "server-only";
import type { Tx } from "@/lib/db";
import { db } from "@/lib/db";
import type { YearStatus } from "../domain/year-rules";

type Client = Pick<Tx, "academicYear">;

/** Prisma returns @db.Date as a Date at UTC midnight: the calendar day is its ISO date. */
export const toDay = (d: Date): string => d.toISOString().slice(0, 10);

const withSemesters = { semesters: { orderBy: { number: "asc" as const } } };

export type YearView = {
  id: string;
  code: string;
  status: YearStatus;
  startDate: string;
  endDate: string;
  semesters: { number: number; startDate: string; endDate: string }[];
};

function view(y: {
  id: string;
  code: string;
  status: YearStatus;
  startDate: Date;
  endDate: Date;
  semesters: { number: number; startDate: Date; endDate: Date }[];
}): YearView {
  return {
    id: y.id,
    code: y.code,
    status: y.status,
    startDate: toDay(y.startDate),
    endDate: toDay(y.endDate),
    semesters: y.semesters.map((s) => ({
      number: s.number,
      startDate: toDay(s.startDate),
      endDate: toDay(s.endDate),
    })),
  };
}

export async function getYear(id: string, client: Client = db): Promise<YearView | null> {
  const y = await client.academicYear.findUnique({ where: { id }, include: withSemesters });
  return y ? view(y) : null;
}

/** All years' day ranges, for the overlap check (optionally leaving one out). */
export async function otherYearRanges(excludeId: string | undefined, client: Client = db) {
  const years = await client.academicYear.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { startDate: true, endDate: true },
  });
  return years.map((y) => ({ startDate: toDay(y.startDate), endDate: toDay(y.endDate) }));
}

/** AC-9: the current year, or null when none has been made current yet. */
export async function getCurrentAcademicYear(client: Client = db): Promise<YearView | null> {
  const y = await client.academicYear.findFirst({
    where: { status: "CURRENT" },
    include: withSemesters,
  });
  return y ? view(y) : null;
}

/** AC-7: writes to records of a closed year are not allowed (except audited corrections). */
export async function isYearWritable(yearId: string, client: Client = db): Promise<boolean> {
  const y = await client.academicYear.findUnique({
    where: { id: yearId },
    select: { status: true },
  });
  return !!y && y.status !== "CLOSED";
}

export class YearClosedError extends Error {
  constructor(readonly yearId: string) {
    super("The academic year is closed");
    this.name = "YearClosedError";
  }
}

export async function assertYearWritable(yearId: string, client: Client = db): Promise<void> {
  if (!(await isYearWritable(yearId, client))) throw new YearClosedError(yearId);
}

export async function listYearOptions(client: Client = db) {
  const years = await client.academicYear.findMany({
    orderBy: { startDate: "desc" },
    select: { id: true, code: true },
  });
  return years.map((y) => ({ id: y.id, label: y.code }));
}
