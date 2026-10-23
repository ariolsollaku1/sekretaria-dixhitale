import "server-only";
import { registerAcademicYearProvider } from "@/lib/academic-year/context";
import { db } from "@/lib/db";
import { listYearOptions } from "./year.queries";

// AC-9: feeds the header selector of PLT-06. Newest first; defaults to the current year.
registerAcademicYearProvider({
  list: () => listYearOptions(),
  current: async () =>
    (await db.academicYear.findFirst({ where: { status: "CURRENT" }, select: { id: true } }))?.id ??
    null,
});
