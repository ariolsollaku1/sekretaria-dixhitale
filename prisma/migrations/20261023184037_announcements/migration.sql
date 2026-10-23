-- CreateEnum
CREATE TYPE "announcement_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "announcement_audience" AS ENUM ('ALL', 'STAFF', 'STUDENTS', 'CYCLE', 'PROGRAM');

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "announcement_status" NOT NULL DEFAULT 'DRAFT',
    "audience" "announcement_audience" NOT NULL DEFAULT 'ALL',
    "cycle" "study_cycle",
    "program_id" TEXT,
    "publish_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "email_push" BOOLEAN NOT NULL DEFAULT false,
    "pushed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "announcements_status_publish_at_idx" ON "announcements"("status", "publish_at");

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AC-1/AC-2: audience agrees with its cycle / program; expiry after publication; no e-mail push for
-- audiences that cannot be resolved to people yet.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_check" CHECK (
  ("audience" IN ('ALL', 'STAFF', 'STUDENTS') AND "cycle" IS NULL AND "program_id" IS NULL)
  OR ("audience" = 'CYCLE' AND "cycle" IS NOT NULL AND "program_id" IS NULL)
  OR ("audience" = 'PROGRAM' AND "cycle" IS NULL AND "program_id" IS NOT NULL)
);
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_expiry_check" CHECK (
  "expires_at" IS NULL OR "publish_at" IS NULL OR "expires_at" > "publish_at"
);
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_push_check" CHECK (
  NOT "email_push" OR "audience" IN ('ALL', 'STAFF', 'STUDENTS')
);
