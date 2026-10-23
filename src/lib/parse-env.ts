import { z } from "zod";

const schema = z
  .object({
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
    /** PDF conversion (PLT-09, ADR-0007). */
    GOTENBERG_URL: z.url().default("http://localhost:3001"),
    // Mail (PLT-11, Q-20): "smtp" (Mailpit in development) or "graph" (Microsoft 365).
    MAIL_TRANSPORT: z.enum(["smtp", "graph"]).default("smtp"),
    MAIL_FROM: z.string().min(3).default("no-reply@logos.local"),
    SMTP_HOST: z.string().default("localhost"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    MS_TENANT_ID: z.string().optional(),
    MS_CLIENT_ID: z.string().optional(),
    MS_CLIENT_SECRET: z.string().optional(),
    SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
    SESSION_MAX_HOURS: z.coerce.number().int().positive().default(12),
  })
  .superRefine((env, ctx) => {
    // The Microsoft Graph adapter needs the app registration; fail at startup, not at the first mail.
    if (env.MAIL_TRANSPORT === "graph") {
      for (const key of ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET"] as const) {
        if (!env[key])
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "required when MAIL_TRANSPORT=graph",
          });
      }
    }
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
