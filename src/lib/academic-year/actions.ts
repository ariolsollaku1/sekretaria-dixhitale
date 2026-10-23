"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACADEMIC_YEAR_COOKIE, listAcademicYears } from "./context";

/** Stores the selection in a cookie, only if it is one of the offered years. */
export async function setAcademicYearAction(id: string): Promise<void> {
  const options = await listAcademicYears();
  if (!options.some((o) => o.id === id)) return;
  (await cookies()).set(ACADEMIC_YEAR_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
