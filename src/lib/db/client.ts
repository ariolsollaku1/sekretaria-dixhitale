import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 talks to Postgres through a driver adapter. In dev, hot reloads re-evaluate this module,
// so the instance is cached on globalThis to avoid exhausting connections (AC-2).
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (!globalForDb.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForDb.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return globalForDb.prisma;
}

// Lazy: `next build` imports route modules without a database URL, so connect on first use.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
