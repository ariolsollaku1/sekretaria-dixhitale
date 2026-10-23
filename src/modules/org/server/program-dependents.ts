// AC-6: records that depend on a program (cohorts, curriculum plans, ...) register here so the
// program cannot be deactivated, or have its cycle / duration changed, underneath them.
export type ProgramDependent = {
  id: string;
  /** Catalog key naming the dependent, e.g. "org.dependents.cohorts". */
  labelKey: string;
  /** How many records currently depend on the program in a way that blocks the change. */
  countActive(programId: string): Promise<number>;
};

const dependents = new Map<string, ProgramDependent>();

export function registerProgramDependent(d: ProgramDependent): void {
  dependents.set(d.id, d); // replacing keeps dev hot reload harmless
}

export function resetProgramDependents(): void {
  dependents.clear();
}

export type BlockingDependent = { id: string; labelKey: string; count: number };

export async function blockingDependents(programId: string): Promise<BlockingDependent[]> {
  const out: BlockingDependent[] = [];
  for (const d of dependents.values()) {
    const count = await d.countActive(programId);
    if (count > 0) out.push({ id: d.id, labelKey: d.labelKey, count });
  }
  return out;
}
