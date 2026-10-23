import { defineConfig } from "prisma/config";

// Prisma 7: connection URL and seed command live here, not in schema.prisma.
// The CLI does not load .env itself; `pnpm db:*` scripts run through `node --env-file-if-exists`.
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
