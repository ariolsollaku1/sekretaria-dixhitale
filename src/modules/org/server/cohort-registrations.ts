import "server-only";
import { db } from "@/lib/db";
import { registerPlanDependent } from "./plan-dependents";
import { registerYearChecklistItem } from "./rollover";

// AC-4: an approved plan followed by an active cohort cannot be archived.
registerPlanDependent({
  id: "org.cohorts",
  labelKey: "org.dependents.cohorts",
  countActive: (planId) => db.cohort.count({ where: { curriculumPlanId: planId, active: true } }),
});

// AC-12: the new-year checklist gets the group step.
registerYearChecklistItem({
  id: "org.groups",
  labelKey: "org.rollover.groups",
  descriptionKey: "org.rollover.groupsDescription",
  href: "/org/groups/start-of-year",
  permission: "org.group.write",
  order: 20,
});
