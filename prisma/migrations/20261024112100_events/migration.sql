-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "registration_status" AS ENUM ('REGISTERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "capacity" INTEGER,
    "registration_deadline" TIMESTAMPTZ(3),
    "status" "event_status" NOT NULL DEFAULT 'DRAFT',
    "audience" "announcement_audience" NOT NULL DEFAULT 'ALL',
    "cycle" "study_cycle",
    "program_id" TEXT,
    "announcement_id" TEXT,
    "reminded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "registration_status" NOT NULL DEFAULT 'REGISTERED',
    "registered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");

-- CreateIndex
CREATE INDEX "event_registrations_user_id_idx" ON "event_registrations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_user_id_key" ON "event_registrations"("event_id", "user_id");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1/AC-2: audience agrees with its cycle / program; end after start; capacity positive; the
-- registration deadline is not after the start. (The application validates the same.)
ALTER TABLE "events" ADD CONSTRAINT "events_audience_check" CHECK (
  ("audience" IN ('ALL', 'STAFF', 'STUDENTS') AND "cycle" IS NULL AND "program_id" IS NULL)
  OR ("audience" = 'CYCLE' AND "cycle" IS NOT NULL AND "program_id" IS NULL)
  OR ("audience" = 'PROGRAM' AND "cycle" IS NULL AND "program_id" IS NOT NULL)
);
ALTER TABLE "events" ADD CONSTRAINT "events_window_check" CHECK (
  ("ends_at" IS NULL OR "ends_at" > "starts_at")
  AND ("registration_deadline" IS NULL OR "registration_deadline" <= "starts_at")
);
ALTER TABLE "events" ADD CONSTRAINT "events_capacity_check" CHECK ("capacity" IS NULL OR "capacity" >= 1);
