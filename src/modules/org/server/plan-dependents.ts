// AC-4 (ORG-04): what follows a curriculum plan registers here so an approved plan cannot be
// archived underneath it. The registry lives in ORG (the lower module) because both CUR (archiving)
// and ORG (cohorts) need it without importing each other.
export type PlanDependent = {
  id: string;
  /** Catalog key (from the catalog root) naming the dependent, e.g. "org.dependents.cohorts". */
  labelKey: string;
  countActive(planId: string): Promise<number>;
};

const dependents = new Map<string, PlanDependent>();

export function registerPlanDependent(d: PlanDependent): void {
  dependents.set(d.id, d);
}
export function resetPlanDependents(): void {
  dependents.clear();
}
export async function blockingPlanDependents(planId: string) {
  const out: { id: string; labelKey: string; count: number }[] = [];
  for (const d of dependents.values()) {
    const count = await d.countActive(planId);
    if (count > 0) out.push({ id: d.id, labelKey: d.labelKey, count });
  }
  return out;
}
