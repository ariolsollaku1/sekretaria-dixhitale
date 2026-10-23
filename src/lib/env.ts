import "server-only";
import { parseEnv, type Env } from "./parse-env";

let cached: Env | undefined;

/** Validates on first use (and at startup via instrumentation), not at import: `next build` has no runtime env. */
export function validateEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get: (_target, prop) => validateEnv()[prop as keyof Env],
});
