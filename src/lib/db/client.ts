import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 talks to Postgres through a driver adapter. In dev, hot reloads re-evaluate this module,
// so the instance is cached on globalThis to avoid exhausting connections (AC-2).
const globalForDb = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db: PrismaClient = globalForDb.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.prisma = db;
