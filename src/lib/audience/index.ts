// Who a cycle/program audience reaches (CAL-01 AC-9, NTF-01). STU registers a resolver once enrollments exist
// (a student's cycle and programs); until then a student-only user sees the `ALL` events only.
export type Audience = { cycles: ("FIRST" | "SECOND")[]; programIds: string[] };
export type AudienceResolver = (userId: string) => Promise<Audience>;

const resolvers: AudienceResolver[] = [];

export function registerAudienceResolver(resolver: AudienceResolver): void {
  resolvers.push(resolver);
}

export function clearAudienceResolvers(): void {
  resolvers.length = 0;
}

export async function resolveAudience(userId: string): Promise<Audience> {
  const all = await Promise.all(resolvers.map((r) => r(userId)));
  return {
    cycles: [...new Set(all.flatMap((a) => a.cycles))],
    programIds: [...new Set(all.flatMap((a) => a.programIds))],
  };
}
