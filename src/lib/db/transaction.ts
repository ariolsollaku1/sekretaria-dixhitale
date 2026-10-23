import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./client";

/** The transaction client handed to services. Services never call `db.$transaction` themselves. */
export type Tx = Prisma.TransactionClient;

export type TransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Milliseconds before the transaction is rolled back. */
  timeout?: number;
};

/** The only way services open a transaction (AC-5). Rolls back when `fn` throws. */
export function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  opts: TransactionOptions = {},
): Promise<T> {
  return db.$transaction(fn, {
    isolationLevel: opts.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
    timeout: opts.timeout ?? 10_000,
  });
}
