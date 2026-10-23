// AC-3: pure diff + masking, no I/O. Stores only what changed and never a sensitive value.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Fields = Record<string, unknown>;

export const MASK = "***";

/** Field names (any depth, case-insensitive) whose values are never written to the trail. */
const sensitiveNames = new Set([
  "nationalid",
  "password",
  "passwordhash",
  "token",
  "secret",
  "idtoken",
  "accesstoken",
  "refreshtoken",
]);

/** Modules register more, e.g. a passport number (configurable list, AC-3). */
export function registerSensitiveFields(...names: string[]): void {
  for (const n of names) sensitiveNames.add(n.toLowerCase());
}

export function resetSensitiveFields(): void {
  sensitiveNames.clear();
  for (const n of [
    "nationalid",
    "password",
    "passwordhash",
    "token",
    "secret",
    "idtoken",
    "accesstoken",
    "refreshtoken",
  ]) {
    sensitiveNames.add(n);
  }
}

export function isSensitive(name: string): boolean {
  return sensitiveNames.has(name.toLowerCase());
}

/** Dates become ISO strings, undefined disappears, so values compare and serialize predictably. */
export function toJson(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value as Fields)) {
      if (v !== undefined) out[k] = toJson(v);
    }
    return out;
  }
  if (typeof value === "bigint") return value.toString();
  return value as Json;
}

function mask(value: Json, key?: string): Json {
  if (key !== undefined && isSensitive(key)) return value === null ? null : MASK;
  if (Array.isArray(value)) return value.map((v) => mask(v));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mask(v, k)]));
  }
  return value;
}

const equal = (a: Json, b: Json) => JSON.stringify(a) === JSON.stringify(b);

export type FieldDiff = { before: Json | null; after: Json | null };

/**
 * `before`/`after` are the entity's fields before and after; null for create / delete. Returns only
 * changed top-level fields. A changed sensitive field still appears (as MASK -> MASK) so the trail
 * shows that it changed without revealing either value. No change at all -> null.
 */
export function diffFields(
  before: Fields | null | undefined,
  after: Fields | null | undefined,
): FieldDiff | null {
  const b = before ? (toJson(before) as { [key: string]: Json }) : null;
  const a = after ? (toJson(after) as { [key: string]: Json }) : null;

  if (!b && !a) return null;
  if (!b) return { before: null, after: mask(a!) };
  if (!a) return { before: mask(b), after: null };

  const outBefore: { [key: string]: Json } = {};
  const outAfter: { [key: string]: Json } = {};
  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    const bv = b[key] ?? null;
    const av = a[key] ?? null;
    if (equal(bv, av)) continue;
    outBefore[key] = mask(bv, key);
    outAfter[key] = mask(av, key);
  }
  if (Object.keys(outAfter).length === 0) return null;
  return { before: outBefore, after: outAfter };
}
