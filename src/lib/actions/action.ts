import "server-only";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { createAuditor, getRequestContext, type Audit, type RequestContext } from "@/lib/audit";
import { can as canDefault } from "@/lib/authz/guard";
import { ForbiddenError, forbiddenResult } from "@/lib/authz/check";
import type { Permission, Target } from "@/lib/authz/types";
import { withTransaction, type Tx } from "@/lib/db";
import { logger } from "@/lib/logger";

// conventions.md "Server actions": authenticate -> permission -> Zod -> transaction -> audit, and a
// typed result instead of thrown errors.

export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INTERNAL";

export type ActionError = {
  code: ActionErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
};
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionError };

/** Handlers throw this for expected failures; everything else becomes INTERNAL. */
export class DomainError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT" | "VALIDATION" | "UNAVAILABLE",
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type ActionContext = {
  user: CurrentUser;
  /** The transaction: services must use this, never the global client. */
  db: Tx;
  /** Writes in the same transaction (AC-2): rolled back together with the change. */
  audit: Audit;
  /** The user's reason when `requireReason` is set (AC-8). */
  reason: string | null;
  /**
   * Compensation for side effects outside the database (e.g. a user created in Keycloak). Runs, last
   * registered first, if the handler throws OR the commit fails. Never throws into the caller.
   */
  onFailure: (fn: () => Promise<void>) => void;
  /** Runs after a successful commit (e.g. sending an email); failures are logged, not returned. */
  afterCommit: (fn: () => Promise<void>) => void;
};

type Deps = {
  getUser: () => Promise<CurrentUser | null>;
  can: (user: { id: string }, permission: Permission, target?: Target) => Promise<boolean>;
  transaction: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
  request: () => Promise<RequestContext>;
};

type Options<S extends z.ZodType, R> = {
  /** `<module>.<resource>.<action>`, checked before anything else runs. */
  permission: Permission;
  input: S;
  /** Resolves the record the permission applies to, enabling scope checks (AC-5 of PLT-05). */
  target?: (input: z.output<S>) => Target;
  /** Demand a non-empty `reason` field in the input and pass it on in `ctx.reason`. */
  requireReason?: boolean;
  handler: (input: z.output<S>, ctx: ActionContext) => Promise<R>;
};

type Hook = () => Promise<void>;

async function runHooks(hooks: Hook[], message: string, permission: string) {
  for (const hook of hooks) {
    try {
      await hook();
    } catch (error) {
      logger.error(message, { permission, error: (error as Error).name });
    }
  }
}

const reasonSchema = z.string().trim().min(1, "Reason is required");

export function createAction(deps: Deps) {
  return function action<S extends z.ZodType, R>(options: Options<S, R>) {
    return async (
      raw: z.input<S> | (z.input<S> & { reason?: string }),
    ): Promise<ActionResult<R>> => {
      const fail = (error: ActionError): ActionResult<R> => ({ ok: false, error });
      try {
        const user = await deps.getUser();
        if (!user) return fail({ code: "UNAUTHENTICATED", message: "Sign in to continue." });

        // Reason is validated separately so strict input schemas need not declare it.
        let body: unknown = raw;
        let reason: string | null = null;
        const fieldErrors: Record<string, string[]> = {};
        if (options.requireReason) {
          const { reason: rawReason, ...rest } = (raw ?? {}) as Record<string, unknown>;
          body = rest;
          const parsedReason = reasonSchema.safeParse(rawReason);
          if (parsedReason.success) reason = parsedReason.data;
          else fieldErrors.reason = parsedReason.error.issues.map((i) => i.message);
        }

        const parsed = options.input.safeParse(body);
        if (!parsed.success)
          Object.assign(fieldErrors, z.flattenError(parsed.error as z.ZodError).fieldErrors);

        // Permission first for the unscoped check, so unauthorized callers learn nothing about the
        // input shape; the scoped check needs the parsed input.
        if (!(await deps.can(user, options.permission))) return forbiddenResult();
        if (!parsed.success || Object.keys(fieldErrors).length > 0) {
          return fail({
            code: "VALIDATION",
            message: "Check the highlighted fields.",
            fieldErrors,
          });
        }
        const input = parsed.data as z.output<S>;
        if (options.target && !(await deps.can(user, options.permission, options.target(input)))) {
          return forbiddenResult();
        }

        const request = await deps.request();
        const failureHooks: Hook[] = [];
        const commitHooks: Hook[] = [];
        let data: R;
        try {
          data = await deps.transaction(async (tx) =>
            options.handler(input, {
              user,
              db: tx,
              audit: createAuditor(tx, { type: "USER", userId: user.id }, request),
              reason,
              onFailure: (fn) => void failureHooks.push(fn),
              afterCommit: (fn) => void commitHooks.push(fn),
            }),
          );
        } catch (error) {
          await runHooks(failureHooks.reverse(), "compensation failed", options.permission);
          throw error;
        }
        await runHooks(commitHooks, "after-commit hook failed", options.permission);
        return { ok: true, data };
      } catch (error) {
        if (error instanceof ForbiddenError) return forbiddenResult();
        if (error instanceof DomainError) {
          return fail({ code: error.code, message: error.message, fieldErrors: error.fieldErrors });
        }
        logger.error("action failed", {
          permission: options.permission,
          error: (error as Error).name,
        });
        return fail({ code: "INTERNAL", message: "Something went wrong." });
      }
    };
  };
}

/** The production wrapper: current session user, real permission engine, real transactions. */
export const action = createAction({
  getUser: getCurrentUser,
  can: canDefault,
  transaction: withTransaction,
  request: getRequestContext,
});
