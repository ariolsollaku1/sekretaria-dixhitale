// Seed runner: `pnpm db:seed [--env dev|demo]`. Seeders are idempotent (upsert by natural key) so
// running twice yields the same data (AC-6). Later features add their seeder to SEEDERS in order.
import { PrismaClient } from "../../src/generated/prisma/client";
import { createAdapter } from "../../src/lib/db/adapter";
import { academicYearsSeeder } from "./academic-years";
import { admNoticesSeeder } from "./adm-notices";
import { calEventsSeeder } from "./cal-events";
import { curCoursesSeeder } from "./cur-courses";
import { hrStaffSeeder } from "./hr-staff";
import { calTimetableSeeder } from "./cal-timetable";
import { curTeachingSeeder } from "./cur-teaching";
import { curPlansSeeder } from "./cur-plans";
import { devRolesSeeder } from "./dev-roles";
import { orgCohortsSeeder } from "./org-cohorts";
import { orgProgramsSeeder } from "./org-programs";
import { orgUnitsSeeder } from "./org-units";
import { devUsersSeeder } from "./dev-users";
import { stuStudentsSeeder } from "./stu-students";
import { pltFormsSeeder } from "./plt-forms";
import { stuRequestsSeeder } from "./stu-requests";
import { ersFormsSeeder } from "./ers-forms";
import { offRequestsSeeder } from "./off-requests";
import { settingsSeeder } from "./settings";
import type { SeedEnv, Seeder } from "./types";

// Order matters: org units before dev roles, because the dev head of department is scoped to one.
const SEEDERS: Seeder[] = [
  settingsSeeder,
  devUsersSeeder,
  orgUnitsSeeder,
  orgProgramsSeeder,
  curCoursesSeeder,
  devRolesSeeder,
  academicYearsSeeder,
  calEventsSeeder,
  hrStaffSeeder,
  curPlansSeeder,
  orgCohortsSeeder,
  stuStudentsSeeder,
  curTeachingSeeder,
  pltFormsSeeder,
  stuRequestsSeeder,
  ersFormsSeeder,
  offRequestsSeeder,
  calTimetableSeeder,
  admNoticesSeeder,
];

function parseEnv(args: string[]): SeedEnv {
  const i = args.indexOf("--env");
  const value = i >= 0 ? args[i + 1] : "dev";
  if (value !== "dev" && value !== "demo")
    throw new Error(`--env must be dev or demo, got ${value}`);
  return value;
}

export async function runSeeds(db: PrismaClient, env: SeedEnv): Promise<void> {
  for (const seeder of SEEDERS) {
    if (!seeder.envs.includes(env)) continue;
    await seeder.run(db, env);
    console.log(`seeded: ${seeder.name}`);
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: createAdapter(connectionString) });
  try {
    await runSeeds(db, parseEnv(process.argv.slice(2)));
  } finally {
    await db.$disconnect();
  }
}

// Run only when executed directly (tests import runSeeds).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
