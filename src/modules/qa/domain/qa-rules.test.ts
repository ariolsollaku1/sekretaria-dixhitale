import { describe, expect, it } from "vitest";
import {
  hasScaleQuestion,
  type Answers,
  parseQuestions,
  questionsSchema,
  validateAnswers,
  type Question,
} from "./question-rules";
import { resolveMinResponses, summarize } from "./result-rules";

const questions: Question[] = [
  { key: "clear", section: "LECTURER", type: "SCALE", label: { sq: "E qartë" }, required: true },
  {
    key: "ready",
    section: "LECTURER",
    type: "SCALE",
    label: { sq: "E përgatitur" },
    required: true,
  },
  { key: "note", section: "LECTURER", type: "TEXT", label: { sq: "Koment" }, required: false },
  {
    key: "desk",
    section: "ADMINISTRATION",
    type: "SCALE",
    label: { sq: "Sporteli" },
    required: true,
  },
];

describe("questions (AC-2)", () => {
  it("accepts a list, makes scale questions required and trims labels", () => {
    const r = questionsSchema.parse([
      { key: "a", section: "LECTURER", type: "SCALE", label: { sq: " Pyetje ", en: "" } },
      { key: "b", section: "LECTURER", type: "TEXT", label: { sq: "Koment", en: "Comment" } },
    ]);
    expect(r[0]).toEqual({
      key: "a",
      section: "LECTURER",
      type: "SCALE",
      label: { sq: "Pyetje" },
      required: true,
    });
    expect(r[1]).toMatchObject({ required: false, label: { en: "Comment" } });
  });

  it("refuses empty lists, duplicate or bad keys, empty labels and more than 40", () => {
    const q = (key: string, sq = "x") => ({
      key,
      section: "LECTURER",
      type: "SCALE",
      label: { sq },
    });
    expect(questionsSchema.safeParse([]).success).toBe(false);
    expect(questionsSchema.safeParse([q("a"), q("a")]).success).toBe(false);
    expect(questionsSchema.safeParse([q("1bad")]).success).toBe(false);
    expect(questionsSchema.safeParse([q("a", "")]).success).toBe(false);
    expect(
      questionsSchema.safeParse(Array.from({ length: 41 }, (_, i) => q(`k${i}`))).success,
    ).toBe(false);
  });

  it("parses stored JSON and tells whether a section has a scale question", () => {
    expect(parseQuestions("nonsense")).toEqual([]);
    expect(hasScaleQuestion(questions)).toBe(true);
    expect(hasScaleQuestion(questions.filter((q) => q.type === "TEXT"))).toBe(false);
    expect(hasScaleQuestion(questions, "ADMINISTRATION")).toBe(true);
  });
});

describe("answers (AC-5)", () => {
  it("accepts a complete sheet and drops empty optional text", () => {
    expect(validateAnswers(questions, "LECTURER", { clear: 5, ready: 3, note: "  " })).toEqual({
      ok: true,
      answers: { clear: 5, ready: 3 },
    });
    expect(validateAnswers(questions, "LECTURER", { clear: 4, ready: 1, note: " mirë " })).toEqual({
      ok: true,
      answers: { clear: 4, ready: 1, note: "mirë" },
    });
  });

  it("refuses missing, out-of-range, fractional, unknown and foreign-section answers", () => {
    const r = validateAnswers(questions, "LECTURER", { clear: 6, ready: 2.5, desk: 3, x: 1 });
    expect(r).toEqual({
      ok: false,
      errors: {
        clear: "scaleRange",
        ready: "scaleRange",
        desk: "unknownQuestion",
        x: "unknownQuestion",
      },
    });
    expect(validateAnswers(questions, "LECTURER", { clear: 3 })).toEqual({
      ok: false,
      errors: { ready: "required" },
    });
    expect(validateAnswers(questions, "LECTURER", { clear: "3", ready: 3 })).toMatchObject({
      ok: false,
    });
  });

  it("limits text to 2000 characters and refuses non-text", () => {
    const base = { clear: 3, ready: 3 };
    expect(validateAnswers(questions, "LECTURER", { ...base, note: "x".repeat(2001) })).toEqual({
      ok: false,
      errors: { note: "tooLong" },
    });
    expect(validateAnswers(questions, "LECTURER", { ...base, note: 5 })).toEqual({
      ok: false,
      errors: { note: "invalid" },
    });
  });
});

describe("results (AC-8, AC-9)", () => {
  const lecturer = questions.filter((q) => q.section === "LECTURER");
  const sheets: Answers[] = [
    { clear: 5, ready: 4, note: "b" },
    { clear: 4, ready: 4 },
    { clear: 3, ready: 2, note: "a" },
  ];

  it("withholds everything below the minimum", () => {
    expect(summarize(lecturer, sheets, 5)).toEqual({ withheld: true, minResponses: 5 });
    expect(summarize(lecturer, [], 1)).toEqual({ withheld: true, minResponses: 1 });
  });

  it("computes means, distributions, the overall mean and sorted comments", () => {
    const r = summarize(lecturer, sheets, 3);
    if (r.withheld) throw new Error("withheld");
    expect(r.responses).toBe(3);
    expect(r.overall).toBe(3.67);
    expect(r.questions[0]).toMatchObject({
      key: "clear",
      answered: 3,
      mean: 4,
      distribution: [0, 0, 1, 1, 1],
    });
    expect(r.questions[1]).toMatchObject({ mean: 3.33, distribution: [0, 1, 0, 2, 0] });
    expect(r.comments).toEqual([{ key: "note", label: { sq: "Koment" }, texts: ["a", "b"] }]);
  });

  it("handles questions nobody answered", () => {
    const r = summarize(lecturer, [{}, {}], 2);
    if (r.withheld) throw new Error("withheld");
    expect(r.overall).toBeNull();
    expect(r.questions[0]).toMatchObject({ answered: 0, mean: null });
    expect(r.comments).toEqual([]);
  });

  it("reads the setting with a default of 5", () => {
    expect(resolveMinResponses(undefined)).toBe(5);
    expect(resolveMinResponses(0)).toBe(5);
    expect(resolveMinResponses(2.5)).toBe(5);
    expect(resolveMinResponses("3")).toBe(5);
    expect(resolveMinResponses(3)).toBe(3);
  });
});
