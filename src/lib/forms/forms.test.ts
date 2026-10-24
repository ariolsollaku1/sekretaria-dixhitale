import { describe, expect, it } from "vitest";
import {
  HONEYPOT_FIELD,
  isHoneypotFilled,
  makeReference,
  maySubmit,
  nextStates,
  validateAnswers,
  visibleFields,
} from "./answers";
import { validateDefinition } from "./definition";

const base = () => ({
  title: { sq: "Kërkesë" },
  fields: [
    { key: "name", type: "text", label: { sq: "Emri" }, required: true, max: 20 },
    { key: "email", type: "email", label: { sq: "Email" } },
    { key: "age", type: "number", label: { sq: "Mosha" }, min: 16, max: 99, integer: true },
    {
      key: "kind",
      type: "select",
      label: { sq: "Lloji" },
      options: [
        { value: "a", label: { sq: "A" } },
        { value: "b", label: { sq: "B" } },
      ],
    },
    {
      key: "other",
      type: "text",
      label: { sq: "Tjetër" },
      required: true,
      showIf: { field: "kind", equals: "b" },
    },
    { key: "agree", type: "checkbox", label: { sq: "Pranoj" }, required: true },
    { key: "when", type: "date", label: { sq: "Data" } },
  ],
  workflow: {
    initial: "new",
    states: [
      { key: "new", label: { sq: "E re" } },
      { key: "review", label: { sq: "Në shqyrtim" } },
      { key: "approved", label: { sq: "Miratuar" }, kind: "approved", final: true },
    ],
    transitions: [
      { from: "new", to: "review" },
      { from: "review", to: "approved" },
    ],
  },
});

const errorsOf = (json: unknown, audience: "PUBLIC" | "AUTHENTICATED" = "AUTHENTICATED") => {
  const r = validateDefinition(json, audience);
  return r.ok ? [] : r.errors.map((e) => `${e.path}:${e.code}`);
};

describe("validateDefinition (AC-2)", () => {
  it("accepts a good definition", () => expect(validateDefinition(base(), "PUBLIC").ok).toBe(true));

  it.each([
    [
      "duplicate field keys",
      (d: ReturnType<typeof base>) => void (d.fields[1]!.key = "name"),
      "fields.1.key:duplicateKey",
    ],
    [
      "a condition on a later field",
      (d: ReturnType<typeof base>) =>
        void ((d.fields[0] as { showIf?: unknown }).showIf = { field: "other", equals: "x" }),
      "fields.0.showIf.field:unknownCondition",
    ],
    [
      "a select without options",
      (d: ReturnType<typeof base>) => void ((d.fields[3] as { options?: unknown }).options = []),
      "fields.3.options:optionsRequired",
    ],
    [
      "duplicate options",
      (d: ReturnType<typeof base>) => void (d.fields[3]!.options![1]!.value = "a"),
      "fields.3.options.1.value:duplicateOption",
    ],
    [
      "min above max",
      (d: ReturnType<typeof base>) => void (d.fields[2]!.min = 100),
      "fields.2.min:minAboveMax",
    ],
    [
      "a bad key",
      (d: ReturnType<typeof base>) => void (d.fields[0]!.key = "Bad Key"),
      "fields.0.key:badKey",
    ],
    [
      "a missing Albanian label",
      (d: ReturnType<typeof base>) => void (d.fields[0]!.label.sq = ""),
      "fields.0.label.sq:labelRequired",
    ],
    [
      "an unknown initial state",
      (d: ReturnType<typeof base>) => void (d.workflow.initial = "zzz"),
      "workflow.initial:unknownState",
    ],
    [
      "duplicate states",
      (d: ReturnType<typeof base>) => void (d.workflow.states[1]!.key = "new"),
      "workflow.states.1.key:duplicateState",
    ],
    [
      "a transition to an unknown state",
      (d: ReturnType<typeof base>) => void (d.workflow.transitions[0]!.to = "zzz"),
      "workflow.transitions.0.to:unknownState",
    ],
    [
      "no final state",
      (d: ReturnType<typeof base>) =>
        void delete (d.workflow.states[2] as { final?: boolean }).final,
      "workflow.states:noFinalState",
    ],
    [
      "a final state with an exit",
      (d: ReturnType<typeof base>) =>
        void d.workflow.transitions.push({ from: "approved", to: "new" }),
      "workflow.transitions:finalHasExit",
    ],
  ])("refuses %s", (_name, mutate, expected) => {
    const d = base();
    mutate(d);
    expect(errorsOf(d)).toContain(expected);
  });

  it("refuses file fields in public forms only, and wrong types with a generic code", () => {
    const withFile = base();
    withFile.fields.push({ key: "doc", type: "file", label: { sq: "Dokument" } } as never);
    expect(errorsOf(withFile, "PUBLIC")).toContain("fields.7.type:fileNotPublic");
    expect(errorsOf(withFile, "AUTHENTICATED")).toEqual([]);
    const wrong = base();
    (wrong.fields[0] as { type: string }).type = "video";
    expect(errorsOf(wrong)).toContain("fields.0.type:invalid");
    expect(errorsOf({})).not.toEqual([]);
    expect(errorsOf(null)).not.toEqual([]);
  });
});

describe("validateAnswers (AC-5)", () => {
  const def = base() as never;
  const ok = { name: "Ana", agree: true, kind: "a" };

  it("accepts valid answers, trims and normalizes, and drops unknown and hidden answers", () => {
    const r = validateAnswers(def, {
      ...ok,
      name: "  Ana  ",
      email: " ANA@Logos.TEST ",
      age: "21",
      other: "ignored",
      extra: 1,
      when: "2026-10-01",
    });
    expect(r).toEqual({
      ok: true,
      answers: {
        name: "Ana",
        email: "ana@logos.test",
        age: 21,
        kind: "a",
        agree: true,
        when: "2026-10-01",
      },
    });
  });

  it("requires visible required fields only", () => {
    expect(validateAnswers(def, {})).toEqual({
      ok: false,
      errors: { name: "required", agree: "required" },
    });
    // `other` becomes required when its condition holds
    const r = validateAnswers(def, { ...ok, kind: "b" });
    expect(r).toEqual({ ok: false, errors: { other: "required" } });
    expect(validateAnswers(def, { ...ok, kind: "b", other: "x" }).ok).toBe(true);
    expect(visibleFields(def, { kind: "b" }).map((f) => f.key)).toContain("other");
    expect(visibleFields(def, { kind: "a" }).map((f) => f.key)).not.toContain("other");
  });

  it.each([
    [{ name: "x".repeat(21) }, "name", "tooLong"],
    [{ email: "nope" }, "email", "invalidEmail"],
    [{ age: "abc" }, "age", "invalidNumber"],
    [{ age: "20.5" }, "age", "notInteger"],
    [{ age: 15 }, "age", "belowMin"],
    [{ age: 100 }, "age", "aboveMax"],
    [{ kind: "zzz" }, "kind", "invalidOption"],
    [{ when: "2026-02-30" }, "when", "invalidDate"],
  ])("refuses %j", (patch, field, code) => {
    const r = validateAnswers(def, { ...ok, ...patch });
    expect(r).toEqual({ ok: false, errors: { [field]: code } });
  });

  it("handles files only where allowed", () => {
    const withFile = base();
    withFile.fields.push({ key: "doc", type: "file", label: { sq: "Dokument" } } as never);
    expect(validateAnswers(withFile as never, { ...ok, doc: "abcdefgh12" })).toEqual({
      ok: false,
      errors: { doc: "filesNotAllowed" },
    });
    expect(
      validateAnswers(withFile as never, { ...ok, doc: "abcdefgh12" }, { allowFiles: true }).ok,
    ).toBe(true);
    expect(
      validateAnswers(withFile as never, { ...ok, doc: "bad id!" }, { allowFiles: true }),
    ).toEqual({ ok: false, errors: { doc: "invalidFile" } });
  });

  it("treats a checkbox as boolean", () => {
    expect(validateAnswers(def, { ...ok, agree: "on" }).ok).toBe(true);
    expect(validateAnswers(def, { ...ok, agree: false })).toEqual({
      ok: false,
      errors: { agree: "required" },
    });
  });
});

describe("helpers (AC-6, AC-8)", () => {
  it("detects the honeypot", () => {
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: "http://spam" })).toBe(true);
    expect(isHoneypotFilled({ [HONEYPOT_FIELD]: "  " })).toBe(false);
    expect(isHoneypotFilled({})).toBe(false);
  });
  it("makes readable references", () => {
    const ref = makeReference();
    expect(ref).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(new Set(Array.from({ length: 50 }, () => makeReference())).size).toBeGreaterThan(45);
  });
  it("lists the next states", () => {
    expect(nextStates(base() as never, "new")).toEqual(["review"]);
    expect(nextStates(base() as never, "approved")).toEqual([]);
  });
});

describe("roles on transitions and submit roles (OFF-01 AC-2, AC-3)", () => {
  const withRoles = () => {
    const d = base();
    d.workflow.transitions = [
      { from: "new", to: "review", roles: ["head_of_department"] },
      { from: "review", to: "approved" },
    ] as never;
    return { ...d, submitRoles: ["lecturer"] };
  };
  it("accepts known roles and refuses unknown ones", () => {
    expect(errorsOf(withRoles())).toEqual([]);
    const bad = withRoles();
    bad.submitRoles = ["wizard"];
    expect(errorsOf(bad)).toContain("submitRoles.0:unknownRole");
  });
  it("filters transitions by the roles of the user; the sysadmin takes any", () => {
    const d = withRoles() as never;
    expect(nextStates(d, "new", ["lecturer"])).toEqual([]);
    expect(nextStates(d, "new", ["head_of_department"])).toEqual(["review"]);
    expect(nextStates(d, "new", ["sysadmin"])).toEqual(["review"]);
    expect(nextStates(d, "review", ["lecturer"])).toEqual(["approved"]); // no roles named = open
  });
  it("limits who may submit", () => {
    const d = withRoles() as never;
    expect(maySubmit(d, ["lecturer"])).toBe(true);
    expect(maySubmit(d, ["student"])).toBe(false);
    expect(maySubmit(d, ["sysadmin"])).toBe(true);
    expect(maySubmit(base() as never, ["student"])).toBe(true);
  });
});
