-- CreateEnum
CREATE TYPE "backup_run_kind" AS ENUM ('EXPORT', 'INTEGRITY');

-- CreateEnum
CREATE TYPE "backup_run_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "backup_runs" (
    "id" TEXT NOT NULL,
    "kind" "backup_run_kind" NOT NULL,
    "status" "backup_run_status" NOT NULL DEFAULT 'RUNNING',
    "requested_by_id" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "problem_count" INTEGER NOT NULL DEFAULT 0,
    "size_bytes" BIGINT,
    "sha256" TEXT,
    "file_name" TEXT,
    "purged_at" TIMESTAMPTZ(3),
    "error_code" TEXT,

    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_runs_kind_started_at_idx" ON "backup_runs"("kind", "started_at");
