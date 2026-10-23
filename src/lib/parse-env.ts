import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.string().startsWith("postgres"),
  /** Root of the file volume (`/data/files` in Docker). */
  FILES_DIR: z.string().min(1).default("./.data/files"),
  /** "embedded": this process also runs the job worker; "off": it only enqueues (PLT-12). */
  JOBS_WORKER: z.enum(["embedded", "off"]).default("embedded"),
  DEFAULT_LOCALE: z.enum(["sq", "en"]).default("sq"),
  // Auth (PLT-04)
  KEYCLOAK_ISSUER: z.url(),
  /** Back-channel base URL when the app runs in Docker (http://keycloak:8080); defaults to the issuer's origin. */
  KEYCLOAK_INTERNAL_URL: z.url().optional(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).default("sekretari-admin"),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),
});

export type Env = z.infer<typeof schema>;

/** Fails fast naming the offending variables. Pure, so it is unit tested without server-only. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${problems}`);
  }
  return result.data;
}
