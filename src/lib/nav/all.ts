import "@/modules/org"; // registers the ORG permissions and the academic-year provider
import "@/modules/cur";
import { registerNav } from "./registry";

// Each module registers its entries here (one import per module index.ts) so the shell never
// depends on module internals. Platform entry:
registerNav({ id: "dashboard", labelKey: "dashboard", href: "/", icon: "home", order: 0 });
registerNav({
  id: "audit",
  labelKey: "audit",
  href: "/admin/audit",
  icon: "shield",
  permission: "plt.audit.read",
  group: "system",
  order: 10,
});
registerNav({
  id: "users",
  labelKey: "users",
  href: "/admin/users",
  icon: "users",
  permission: "iam.user.read",
  group: "system",
  order: 5,
});
registerNav({
  id: "files",
  labelKey: "files",
  href: "/admin/files",
  icon: "file",
  permission: "plt.file.read",
  group: "system",
  order: 20,
});
registerNav({
  id: "years",
  labelKey: "years",
  href: "/org/years",
  icon: "calendar",
  permission: "org.year.read",
  group: "administration",
  order: 10,
});
registerNav(
  {
    id: "faculties",
    labelKey: "faculties",
    href: "/org/faculties",
    icon: "building",
    permission: "org.faculty.read",
    group: "administration",
    order: 20,
  },
  {
    id: "departments",
    labelKey: "departments",
    href: "/org/departments",
    icon: "building",
    permission: "org.department.read",
    group: "administration",
    order: 21,
  },
);
registerNav({
  id: "programs",
  labelKey: "programs",
  href: "/org/programs",
  icon: "graduation",
  permission: "org.program.read",
  group: "administration",
  order: 22,
});
registerNav(
  {
    id: "courses",
    labelKey: "courses",
    href: "/cur/courses",
    icon: "book",
    permission: "cur.course.read",
    group: "teaching",
    order: 10,
  },
  {
    id: "course-categories",
    labelKey: "courseCategories",
    href: "/cur/categories",
    icon: "book",
    permission: "cur.course.read",
    group: "teaching",
    order: 11,
  },
);
registerNav({
  id: "jobs",
  labelKey: "jobs",
  href: "/admin/jobs",
  icon: "settings",
  permission: "plt.jobs.read",
  group: "system",
  order: 30,
});
