// AC-9: the only way application code writes logs. Structured JSON; fields are ids, codes and
// counts. Anything that looks like personal data is dropped instead of written.
type Value = string | number | boolean | null | undefined;
export type LogFields = Record<string, Value>;

const PERSONAL_KEYS = new Set([
  "email",
  "name",
  "firstname",
  "lastname",
  "fullname",
  "phone",
  "address",
  "nationalid",
  "birthdate",
  "dateofbirth",
  "nim",
  "password",
  "token",
  "idtoken",
  "accesstoken",
  "refreshtoken",
]);

/** Pure so it is unit-tested: removes personal-data keys, keeps everything else. */
export function sanitizeFields(fields: LogFields = {}): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (PERSONAL_KEYS.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function write(level: "info" | "warn" | "error", msg: string, fields?: LogFields) {
  const line = JSON.stringify({
    level,
    msg,
    ...sanitizeFields(fields),
    at: new Date().toISOString(),
  });
  // eslint-disable-next-line no-console -- the one sanctioned console use
  (level === "error" ? console.error : level === "warn" ? console.warn : console.info)(line);
}

export const logger = {
  info: (msg: string, fields?: LogFields) => write("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};
