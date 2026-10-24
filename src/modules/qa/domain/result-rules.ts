// QA-01 AC-8, AC-9: aggregation of the anonymous responses of one target. Pure.
import type { Answers, Question } from "./question-rules";

export const DEFAULT_MIN_RESPONSES = 5;

/** The setting `qa.minResponses`; anything that is not a positive whole number means the default. */
export function resolveMinResponses(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 1000
    ? value
    : DEFAULT_MIN_RESPONSES;
}

export type QuestionResult = {
  key: string;
  label: { sq: string; en?: string };
  answered: number;
  mean: number | null;
  /** counts of the answers 1..5 */
  distribution: [number, number, number, number, number];
};

export type TargetResult =
  | { withheld: true; minResponses: number }
  | {
      withheld: false;
      responses: number;
      /** mean of all scale answers (Q-108) */
      overall: number | null;
      questions: QuestionResult[];
      comments: { key: string; label: { sq: string; en?: string }; texts: string[] }[];
    };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** AC-8: below the minimum nothing but the fact that it is withheld leaves this function. */
export function summarize(
  questions: Question[],
  responses: Answers[],
  minResponses: number,
): TargetResult {
  if (responses.length < minResponses) return { withheld: true, minResponses };
  let sum = 0;
  let count = 0;
  const scale: QuestionResult[] = [];
  for (const q of questions.filter((x) => x.type === "SCALE")) {
    const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    let qSum = 0;
    let qCount = 0;
    for (const r of responses) {
      const v = r[q.key];
      if (typeof v === "number" && v >= 1 && v <= 5) {
        distribution[v - 1]!++;
        qSum += v;
        qCount++;
      }
    }
    sum += qSum;
    count += qCount;
    scale.push({
      key: q.key,
      label: q.label,
      answered: qCount,
      mean: qCount > 0 ? round2(qSum / qCount) : null,
      distribution,
    });
  }
  const comments = questions
    .filter((q) => q.type === "TEXT")
    .map((q) => ({
      key: q.key,
      label: q.label,
      // sorted text only: the order of arrival is not kept, so it cannot be matched to a participation
      texts: responses
        .map((r) => r[q.key])
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .sort((a, b) => a.localeCompare(b)),
    }))
    .filter((c) => c.texts.length > 0);
  return {
    withheld: false,
    responses: responses.length,
    overall: count > 0 ? round2(sum / count) : null,
    questions: scale,
    comments,
  };
}

/** The mean of means is wrong when sizes differ, so roll-ups pool the answers instead. */
export const pool = <T>(groups: T[][]): T[] => groups.flat();
