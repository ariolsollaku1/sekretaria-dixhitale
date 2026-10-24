// Pure form-definition schema (PLT-15 AC-2). No I/O. The definition is JSON written by the
// sysadmin; it is validated here before it can be saved or published.
import { z } from "zod";
import { ROLES } from "@/lib/authz/roles";

export const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "file",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

const localized = z.object({
  sq: z.string().trim().min(1, "labelRequired").max(300, "tooLong"),
  en: z.string().trim().max(300, "tooLong").optional(),
});
export type Localized = z.infer<typeof localized>;

const key = z.string().regex(/^[a-z][a-zA-Z0-9_]{0,40}$/, "badKey");
const optionSchema = z.object({ value: z.string().min(1).max(100), label: localized });

const fieldSchema = z.object({
  key,
  type: z.enum(FIELD_TYPES),
  label: localized,
  help: localized.optional(),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  integer: z.boolean().optional(),
  options: z.array(optionSchema).max(100).optional(),
  showIf: z
    .object({ field: key, equals: z.union([z.string(), z.number(), z.boolean()]) })
    .optional(),
});
export type FormField = z.infer<typeof fieldSchema>;

const roleSchema = z.enum(ROLES, "unknownRole");

const stateSchema = z.object({
  key,
  label: localized,
  /** `approved` runs the form's handler (AC-10). */
  kind: z.enum(["approved", "rejected"]).optional(),
  final: z.boolean().optional(),
});

export const definitionSchema = z
  .object({
    title: localized,
    description: localized.optional(),
    fields: z.array(fieldSchema).min(1, "noFields").max(80, "tooManyFields"),
    workflow: z.object({
      initial: key,
      states: z.array(stateSchema).min(1).max(30),
      // `roles` (optional): only users holding one of them may take the transition (sysadmin always may)
      transitions: z
        .array(
          z.object({ from: key, to: key, roles: z.array(roleSchema).min(1).max(13).optional() }),
        )
        .max(200),
    }),
    /** Roles allowed to fill in an authenticated form; absent = every signed-in user. */
    submitRoles: z.array(roleSchema).min(1).max(13).optional(),
    handler: z
      .string()
      .regex(/^[a-z]+\.[a-z0-9_.-]+$/, "badHandler")
      .optional(),
  })
  .superRefine((d, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });

    const seen = new Set<string>();
    d.fields.forEach((f, i) => {
      if (seen.has(f.key)) issue(["fields", i, "key"], "duplicateKey");
      // conditions may only look back at fields that come earlier
      if (f.showIf && !seen.has(f.showIf.field))
        issue(["fields", i, "showIf", "field"], "unknownCondition");
      seen.add(f.key);
      if ((f.type === "select" || f.type === "radio") && (!f.options || f.options.length === 0))
        issue(["fields", i, "options"], "optionsRequired");
      if (f.options) {
        const values = new Set<string>();
        f.options.forEach((o, j) => {
          if (values.has(o.value)) issue(["fields", i, "options", j, "value"], "duplicateOption");
          values.add(o.value);
        });
      }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max)
        issue(["fields", i, "min"], "minAboveMax");
    });

    const states = new Set<string>();
    d.workflow.states.forEach((s, i) => {
      if (states.has(s.key)) issue(["workflow", "states", i, "key"], "duplicateState");
      states.add(s.key);
    });
    if (!states.has(d.workflow.initial)) issue(["workflow", "initial"], "unknownState");
    d.workflow.transitions.forEach((t, i) => {
      if (!states.has(t.from)) issue(["workflow", "transitions", i, "from"], "unknownState");
      if (!states.has(t.to)) issue(["workflow", "transitions", i, "to"], "unknownState");
    });
    const finals = d.workflow.states.filter((s) => s.final);
    if (finals.length === 0) issue(["workflow", "states"], "noFinalState");
    for (const s of finals) {
      if (d.workflow.transitions.some((t) => t.from === s.key))
        issue(["workflow", "transitions"], "finalHasExit");
    }
  });
export type FormDefinitionJson = z.infer<typeof definitionSchema>;

export type DefinitionError = { path: string; code: string };

/** Our own messages; anything else Zod says is reported as "invalid". Codes are catalog keys. */
const ERROR_CODES = new Set([
  "labelRequired",
  "tooLong",
  "badKey",
  "noFields",
  "tooManyFields",
  "badHandler",
  "duplicateKey",
  "unknownCondition",
  "optionsRequired",
  "duplicateOption",
  "minAboveMax",
  "duplicateState",
  "unknownState",
  "noFinalState",
  "finalHasExit",
  "fileNotPublic",
  "unknownRole",
]);

/** AC-2: the definition, or every problem with its path (`fields.2.options`). `audience` adds the cross-check on files. */
export function validateDefinition(
  json: unknown,
  audience: "PUBLIC" | "AUTHENTICATED",
): { ok: true; definition: FormDefinitionJson } | { ok: false; errors: DefinitionError[] } {
  const parsed = definitionSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        code: ERROR_CODES.has(i.message) ? i.message : "invalid",
      })),
    };
  }
  const errors: DefinitionError[] = [];
  if (audience === "PUBLIC")
    parsed.data.fields.forEach((f, i) => {
      if (f.type === "file") errors.push({ path: `fields.${i}.type`, code: "fileNotPublic" });
    });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, definition: parsed.data };
}

/** The label in the reader's locale, falling back to Albanian (the required language). */
export const localize = (text: Localized | undefined, locale: string): string =>
  !text ? "" : locale === "en" && text.en ? text.en : text.sq;
