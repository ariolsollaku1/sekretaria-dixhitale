import { registerPermissions } from "@/lib/authz/registry";

// AC-12 (QA-01), roles.md "QA": the Quality Assurance Unit runs the campaigns and sees all results,
// heads and coordinators see the results of their scope, lecturers their own, students answer (Q-107).
registerPermissions("qa", {
  permissions: ["qa.campaign.manage", "qa.result.read", "qa.result.self", "qa.survey.submit"],
  grants: {
    quality: ["qa.campaign.manage", "qa.result.read"],
    head_of_department: ["qa.result.read"],
    program_coordinator: ["qa.result.read"],
    lecturer: ["qa.result.self"],
    student: ["qa.survey.submit"],
  },
});
