import "server-only";
import { db } from "@/lib/db";
import { registerPlanDirectory, registerProgramDependent } from "@/modules/org";
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

// ORG-04: cohorts look plans up through this directory (ORG cannot import CUR).
registerPlanDirectory({
  get: async (planId) => {
    const p = await db.curriculumPlan.findUnique({
      where: { id: planId },
      include: { validFrom: { select: { code: true } } },
    });
    return p
      ? {
          id: p.id,
          programId: p.programId,
          version: p.version,
          status: p.status,
          validFrom: p.validFrom.code,
        }
      : null;
  },
  listApproved: async (programId) => {
    const plans = await db.curriculumPlan.findMany({
      where: { programId, status: "APPROVED" },
      orderBy: { version: "desc" },
      include: { validFrom: { select: { code: true } } },
    });
    return plans.map((p) => ({
      id: p.id,
      programId: p.programId,
      version: p.version,
      status: p.status,
      validFrom: p.validFrom.code,
    }));
  },
});
