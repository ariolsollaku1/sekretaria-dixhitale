// Pure answer validation for a form definition (PLT-15 AC-5/AC-6). No I/O.
import { randomBytes } from "node:crypto";
import type { FormDefinitionJson, FormField } from "./definition";

export type Answers = Record<string, string | number | boolean>;

/** The hidden field a human never fills; bots that fill every input do (AC-6). */
export const HONEYPOT_FIELD = "company_website";
export const isHoneypotFilled = (raw: Record<string, unknown>): boolean => {
  const v = raw[HONEYPOT_FIELD];
  return typeof v === "string" ? v.trim() !== "" : v !== undefined && v !== null && v !== false;
};

const isDay = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^[+0-9 ()./-]{5,30}$/;

/** AC-5: a conditional field counts only when its condition holds on the (raw) answers. */
export function visibleFields(def: FormDefinitionJson, raw: Record<string, unknown>): FormField[] {
  return def.fields.filter((f) => !f.showIf || raw[f.showIf.field] === f.showIf.equals);
}

export type AnswerErrors = Record<string, string>;

/**
 * AC-5: validates the raw answers against the definition: visible fields only, required, types,
 * ranges, options. Unknown and hidden answers are dropped. Codes are catalog keys.
 */
export function validateAnswers(
  def: FormDefinitionJson,
  raw: Record<string, unknown>,
  opts: { allowFiles: boolean } = { allowFiles: false },
): { ok: true; answers: Answers } | { ok: false; errors: AnswerErrors } {
  const answers: Answers = {};
  const errors: AnswerErrors = {};
  for (const f of visibleFields(def, raw)) {
    const value = raw[f.key];
    const empty =
      value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (f.type === "checkbox") {
      const checked = value === true || value === "true" || value === "on";
      if (f.required && !checked) errors[f.key] = "required";
      else answers[f.key] = checked;
      continue;
    }
    if (empty) {
      if (f.required) errors[f.key] = "required";
      continue;
    }
    switch (f.type) {
      case "text":
      case "textarea": {
        const s = String(value).trim();
        const max = f.max ?? (f.type === "text" ? 500 : 5000);
        if (s.length > max) errors[f.key] = "tooLong";
        else if (f.min !== undefined && s.length < f.min) errors[f.key] = "tooShort";
        else answers[f.key] = s;
        break;
      }
      case "email": {
        const s = String(value).trim().toLowerCase();
        if (!EMAIL.test(s) || s.length > 200) errors[f.key] = "invalidEmail";
        else answers[f.key] = s;
        break;
      }
      case "phone": {
        const s = String(value).trim();
        if (!PHONE.test(s)) errors[f.key] = "invalidPhone";
        else answers[f.key] = s;
        break;
      }
      case "number": {
        const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (!Number.isFinite(n)) errors[f.key] = "invalidNumber";
        else if (f.integer && !Number.isInteger(n)) errors[f.key] = "notInteger";
        else if (f.min !== undefined && n < f.min) errors[f.key] = "belowMin";
        else if (f.max !== undefined && n > f.max) errors[f.key] = "aboveMax";
        else answers[f.key] = n;
        break;
      }
      case "date": {
        const s = String(value);
        if (!isDay(s)) errors[f.key] = "invalidDate";
        else answers[f.key] = s;
        break;
      }
      case "select":
      case "radio": {
        const s = String(value);
        if (!f.options?.some((o) => o.value === s)) errors[f.key] = "invalidOption";
        else answers[f.key] = s;
        break;
      }
      case "file": {
        const s = String(value);
        if (!opts.allowFiles) errors[f.key] = "filesNotAllowed";
        else if (!/^[A-Za-z0-9_-]{8,64}$/.test(s)) errors[f.key] = "invalidFile";
        else answers[f.key] = s;
        break;
      }
    }
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, answers };
}

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O/1/I/L: easy to read out loud

/** AC-5: a reference the submitter can keep, e.g. `K7M2-9QXA`. */
export function makeReference(bytes: Uint8Array = randomBytes(8)): string {
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

/**
 * AC-8: the states reachable from `state`. With `roles` given, transitions that name roles are
 * limited to holders of one of them (OFF-01: supervisor, then administration); the sysadmin may take
 * any. Without `roles` nothing is filtered (structural questions).
 */
export const nextStates = (
  def: FormDefinitionJson,
  state: string,
  roles?: readonly string[],
): string[] =>
  def.workflow.transitions
    .filter(
      (t) =>
        t.from === state &&
        (!roles ||
          !t.roles ||
          roles.includes("sysadmin") ||
          t.roles.some((r) => roles.includes(r))),
    )
    .map((t) => t.to);

/** OFF-01: may this user fill in the authenticated form? (`submitRoles` absent = anybody signed in) */
export const maySubmit = (def: FormDefinitionJson, roles: readonly string[]): boolean =>
  !def.submitRoles || roles.includes("sysadmin") || def.submitRoles.some((r) => roles.includes(r));

export const stateDef = (def: FormDefinitionJson, state: string) =>
  def.workflow.states.find((s) => s.key === state);
