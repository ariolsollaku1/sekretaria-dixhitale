// AC-3/AC-5/AC-8: students (STU-01) register here so a cohort or group that has students cannot be
// deactivated, nor a cohort moved to another plan.
export type CohortDependent = {
  id: string;
  labelKey: string;
  countActive(cohortId: string): Promise<number>;
};
export type GroupDependent = {
  id: string;
  labelKey: string;
  countActive(groupId: string): Promise<number>;
};

const cohortDeps = new Map<string, CohortDependent>();
const groupDeps = new Map<string, GroupDependent>();

export const registerCohortDependent = (d: CohortDependent) => void cohortDeps.set(d.id, d);
export const registerGroupDependent = (d: GroupDependent) => void groupDeps.set(d.id, d);
export function resetCohortDependents(): void {
  cohortDeps.clear();
  groupDeps.clear();
}

async function blocking<
  T extends { id: string; labelKey: string; countActive(id: string): Promise<number> },
>(deps: Map<string, T>, id: string) {
  const out: { id: string; labelKey: string; count: number }[] = [];
  for (const d of deps.values()) {
    const count = await d.countActive(id);
    if (count > 0) out.push({ id: d.id, labelKey: d.labelKey, count });
  }
  return out;
}
export const blockingCohortDependents = (cohortId: string) => blocking(cohortDeps, cohortId);
export const blockingGroupDependents = (groupId: string) => blocking(groupDeps, groupId);

export const dependentsMessage = (list: { labelKey: string; count: number }[]) =>
  `HAS_DEPENDENTS:${list.map((b) => `${b.labelKey}=${b.count}`).join(",")}`;
