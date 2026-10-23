import type { PrismaClient } from "../../src/generated/prisma/client";

export type SeedEnv = "dev" | "demo";

export type Seeder = {
  name: string;
  /** Environments in which this seeder runs. Reference data runs everywhere. */
  envs: SeedEnv[];
  run: (db: PrismaClient, env: SeedEnv) => Promise<void>;
};
