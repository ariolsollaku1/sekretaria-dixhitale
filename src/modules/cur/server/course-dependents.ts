// AC-6: plans (CUR-02) register here so a course cannot be deactivated while a plan still uses it.
export type CourseDependent = {
  id: string;
  labelKey: string;
  countActive(courseId: string): Promise<number>;
};

const dependents = new Map<string, CourseDependent>();

export function registerCourseDependent(d: CourseDependent): void {
  dependents.set(d.id, d);
}

export function resetCourseDependents(): void {
  dependents.clear();
}

export async function blockingCourseDependents(courseId: string) {
  const out: { id: string; labelKey: string; count: number }[] = [];
  for (const d of dependents.values()) {
    const count = await d.countActive(courseId);
    if (count > 0) out.push({ id: d.id, labelKey: d.labelKey, count });
  }
  return out;
}
