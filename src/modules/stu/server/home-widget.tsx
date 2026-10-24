import "server-only";
import { getCurrentUser } from "@/lib/auth";
import { registerWidget } from "@/lib/dashboard/widgets";
import { PortalSummary } from "../ui/portal-home";
import { getPortalHome } from "./home.queries";

// Q-59: a "My studies" card on the dashboard of every student; the full page is /stu/home.
registerWidget({
  id: "stu.studies",
  permission: "stu.student.self",
  order: 10,
  component: async () => {
    const user = await getCurrentUser();
    return <PortalSummary home={user ? await getPortalHome(user) : null} />;
  },
});
