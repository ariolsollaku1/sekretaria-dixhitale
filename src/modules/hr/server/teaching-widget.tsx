import "server-only";
import { getSelectedAcademicYear } from "@/lib/academic-year/context";
import { getCurrentUser } from "@/lib/auth";
import { registerWidget } from "@/lib/dashboard/widgets";
import { TeachingSummary } from "../ui/teaching-hub";
import { getTeachingHub } from "./teaching.queries";

// Q-84: a "My teaching" card on the dashboard of every lecturer; the full page is /hr/teaching.
registerWidget({
  id: "hr.teaching",
  permission: "hr.workspace.self",
  order: 10,
  component: async () => {
    const [user, yearId] = await Promise.all([getCurrentUser(), getSelectedAcademicYear()]);
    const hub = user ? await getTeachingHub(user, yearId) : null;
    return <TeachingSummary hub={hub} />;
  },
});
