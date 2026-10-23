// Pure rules for study programs (ORG-03). No I/O: the config comes from settings, loaded by the caller.
import { z } from "zod";

export const CYCLES = ["FIRST", "SECOND"] as const;
export type Cycle = (typeof CYCLES)[number];

export type ProgramConfig = {
  durations: Record<Cycle, number[]>;
  subtypes: string[];
};

/** Defaults from the ORG brief: Bachelor 3 years; Master 1 or 2; two Master subtypes. */
export const DEFAULT_PROGRAM_CONFIG: ProgramConfig = {
  durations: { FIRST: [3], SECOND: [1, 2] },
  subtypes: ["PROFESSIONAL", "SCIENTIFIC"],
};

export const durationsSettingSchema = z.object({
  FIRST: z.array(z.number().int().min(1).max(3)).min(1),
  SECOND: z.array(z.number().int().min(1).max(3)).min(1),
});
export const subtypesSettingSchema = z.array(
  z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]{1,30}$/),
    nameSq: z.string(),
    nameEn: z.string(),
  }),
);

/** A missing or malformed setting falls back to the defaults instead of breaking the screen. */
export function resolveProgramConfig(durations: unknown, subtypes: unknown): ProgramConfig {
  const d = durationsSettingSchema.safeParse(durations);
  const s = subtypesSettingSchema.safeParse(subtypes);
  return {
    durations: d.success ? d.data : DEFAULT_PROGRAM_CONFIG.durations,
    subtypes: s.success ? s.data.map((x) => x.code) : DEFAULT_PROGRAM_CONFIG.subtypes,
  };
}

export const PROGRAM_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;

export function validateProgramCode(
  raw: string,
): { ok: true; code: string } | { ok: false; reason: "invalidProgramCode" } {
  const code = raw.trim().toUpperCase();
  return PROGRAM_CODE_PATTERN.test(code)
    ? { ok: true, code }
    : { ok: false, reason: "invalidProgramCode" };
}

export type ProgramShape = { cycle: Cycle; durationYears: number; subtype?: string | null };
export type ProgramErrors = Partial<Record<"durationYears" | "subtype", string[]>>;

/**
 * AC-3: the duration must be allowed for the cycle; a subtype only for the second cycle and only a
 * known one. `keepSubtype` is the subtype the program already has: it stays valid on edit even if
 * it was later removed from the setting.
 */
export function validateProgramShape(
  input: ProgramShape,
  config: ProgramConfig,
  keepSubtype?: string | null,
): ProgramErrors {
  const errors: ProgramErrors = {};
  if (!config.durations[input.cycle].includes(input.durationYears))
    errors.durationYears = ["durationNotAllowed"];
  if (input.subtype) {
    if (input.cycle !== "SECOND") errors.subtype = ["subtypeOnlyMaster"];
    else if (!config.subtypes.includes(input.subtype) && input.subtype !== keepSubtype)
      errors.subtype = ["subtypeUnknown"];
  }
  return errors;
}

export const hasProgramErrors = (e: ProgramErrors) => Object.keys(e).length > 0;
