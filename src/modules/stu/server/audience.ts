import "server-only";
import { registerAudienceResolver } from "@/lib/audience";
import { db } from "@/lib/db";

// AC-11: calendar events and announcements aimed at a cycle or program reach a student through their
// ACTIVE enrollments (CAL-01 AC-9 / NTF-01 left this resolver to STU).
export async function studentAudience(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
  if (!u?.personId) return { cycles: [], programIds: [] };
  const rows = await db.enrollment.findMany({
    where: { status: "ACTIVE", student: { personId: u.personId } },
    select: { programId: true, program: { select: { cycle: true } } },
  });
  return {
    cycles: [...new Set(rows.map((r) => r.program.cycle))],
    programIds: [...new Set(rows.map((r) => r.programId))],
  };
}

registerAudienceResolver(studentAudience);
