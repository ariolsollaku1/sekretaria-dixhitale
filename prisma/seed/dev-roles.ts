import { readFileSync } from "node:fs";
import type { Seeder } from "./types";

type DevUser = { role: string; email: string; appUser: boolean };

const file = new URL("../../infra/keycloak/dev/dev-users.json", import.meta.url);

// dev-users.json uses the hyphenated keys of roles.md; the Prisma enum uses underscores.
const ROLE_KEYS = new Set([
  "sysadmin",
  "secretary",
  "student_affairs",
  "lecturer",
  "finance",
  "hr",
  "quality",
  "library",
  "administration",
  "student",
  "head_of_department",
  "program_coordinator",
  "erasmus",
]);

// Role -> scope for dev assignments. Program-scoped roles need programs (ORG-03), so they are
// skipped for now (null); the head of department is handled separately (needs a department).
const DEV_SCOPE: Record<string, "INSTITUTION" | "SELF" | null> = {
  sysadmin: "INSTITUTION",
  secretary: "INSTITUTION",
  student_affairs: "INSTITUTION",
  lecturer: "SELF",
  finance: "INSTITUTION",
  hr: "INSTITUTION",
  quality: "INSTITUTION",
  library: "INSTITUTION",
  administration: "INSTITUTION",
  student: "SELF",
  head_of_department: null,
  program_coordinator: null,
  erasmus: "INSTITUTION",
};

export const devRolesSeeder: Seeder = {
  name: "dev-roles",
  envs: ["dev"],
  async run(db) {
    const { users } = JSON.parse(readFileSync(file, "utf8")) as { users: DevUser[] };
    for (const u of users.filter((u) => u.appUser)) {
      const role = u.role.replaceAll("-", "_");
      const scopeType = DEV_SCOPE[role];
      if (!ROLE_KEYS.has(role)) continue;
      const user = await db.user.findUnique({ where: { email: u.email } });
      if (!user) continue;

      // Scoped roles need real units (ORG-02): the dev head of department leads demo department A1.
      if (role === "head_of_department") {
        const department = await db.department.findUnique({ where: { code: "DEMO-A1" } });
        if (!department) continue;
        const has = await db.userRole.findFirst({
          where: {
            userId: user.id,
            role: "head_of_department",
            scopeType: "DEPARTMENT",
            scopeId: department.id,
          },
        });
        if (!has)
          await db.userRole.create({
            data: {
              userId: user.id,
              role: "head_of_department",
              scopeType: "DEPARTMENT",
              scopeId: department.id,
            },
          });
        continue;
      }
      if (!scopeType) continue;
      const exists = await db.userRole.findFirst({
        where: { userId: user.id, role: role as never, scopeType },
      });
      if (!exists)
        await db.userRole.create({ data: { userId: user.id, role: role as never, scopeType } });
    }
  },
};
