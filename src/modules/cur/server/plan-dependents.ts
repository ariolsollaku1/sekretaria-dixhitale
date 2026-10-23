import "server-only";
import { db } from "@/lib/db";
import { registerProgramDependent } from "@/modules/org";
import { registerCourseDependent } from "./course-dependents";

// AC-9: a course in a draft or approved plan, and a program with a draft or approved plan, cannot
// be deactivated underneath it.
registerCourseDependent({
  id: "cur.plans",
  labelKey: "cur.dependents.plans",
  countActive: (courseId) =>
    db.planCourse.count({ where: { courseId, plan: { status: { in: ["DRAFT", "APPROVED"] } } } }),
});

registerProgramDependent({
  id: "cur.plans",
  labelKey: "cur.dependents.plans",
  countActive: (programId) =>
    db.curriculumPlan.count({ where: { programId, status: { in: ["DRAFT", "APPROVED"] } } }),
});

// AC-8: cohorts (ORG-04) register here so an approved plan in use cannot be archived.
export type PlanDependent = {
  id: string;
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
