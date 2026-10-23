-- CreateEnum
CREATE TYPE "calendar_event_type" AS ENUM ('TEACHING_WEEK', 'HOLIDAY', 'DEADLINE', 'EXAM_PERIOD', 'REGISTRATION_PERIOD', 'EVENT');

-- CreateEnum
CREATE TYPE "calendar_audience" AS ENUM ('ALL', 'CYCLE', 'PROGRAM');

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "calendar_event_type" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "description" TEXT,
    "audience" "calendar_audience" NOT NULL DEFAULT 'ALL',
    "cycle" "study_cycle",
    "program_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_feed_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_feed_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_events_academic_year_id_start_date_idx" ON "calendar_events"("academic_year_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_tokens_user_id_key" ON "calendar_feed_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_feed_tokens_token_hash_key" ON "calendar_feed_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_feed_tokens" ADD CONSTRAINT "calendar_feed_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1/AC-2: dates ordered; audience agrees with its cycle / program.
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_dates_check" CHECK ("start_date" <= "end_date");
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_audience_check" CHECK (
  ("audience" = 'ALL' AND "cycle" IS NULL AND "program_id" IS NULL)
  OR ("audience" = 'CYCLE' AND "cycle" IS NOT NULL AND "program_id" IS NULL)
  OR ("audience" = 'PROGRAM' AND "cycle" IS NULL AND "program_id" IS NOT NULL)
);
