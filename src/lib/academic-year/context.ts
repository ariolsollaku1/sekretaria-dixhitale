import "server-only";
import { cookies } from "next/headers";

// AC-7 / ADR-0006. ORG-01 registers a provider backed by the academic_years table; until then
// there is none, the selector is hidden and the context is null.
export type AcademicYearOption = { id: string; label: string };

export type AcademicYearProvider = {
  list(): Promise<AcademicYearOption[]>;
  /** Used when no valid cookie is set, e.g. the current academic year. */
  current(): Promise<string | null>;
};

export const ACADEMIC_YEAR_COOKIE = "ay";

let provider: AcademicYearProvider | null = null;

export function registerAcademicYearProvider(p: AcademicYearProvider): void {
  provider = p;
}

export function resetAcademicYearProvider(): void {
  provider = null;
}

/** Years available to the selector; empty when no provider is registered. */
export async function listAcademicYears(): Promise<AcademicYearOption[]> {
  return provider ? provider.list() : [];
}

/** The cookie's year if it is still valid, else the provider's current year, else null. */
export async function getSelectedAcademicYear(): Promise<string | null> {
  if (!provider) return null;
  const options = await provider.list();
  const chosen = (await cookies()).get(ACADEMIC_YEAR_COOKIE)?.value;
  if (chosen && options.some((o) => o.id === chosen)) return chosen;
  return provider.current();
}
