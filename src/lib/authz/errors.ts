import { ForbiddenError, forbiddenResult, type ForbiddenResult } from "./check";

/** AC-6: maps ForbiddenError to the typed action result; other errors are rethrown for the wrapper. */
export function actionErrorFrom(error: unknown): ForbiddenResult {
  if (error instanceof ForbiddenError) return forbiddenResult();
  throw error;
}
