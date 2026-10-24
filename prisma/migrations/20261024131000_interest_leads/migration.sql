-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('NEW', 'CONTACTED', 'APPLIED', 'LOST');

-- CreateEnum
CREATE TYPE "lead_source" AS ENUM ('WEBSITE', 'CAMPAIGN', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "lead_event_kind" AS ENUM ('CREATED', 'STATUS', 'EDITED', 'ASSIGNED', 'INVITED', 'NOTE');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "program_id" TEXT,
    "program_note" TEXT,
    "message" TEXT,
    "source" "lead_source" NOT NULL,
    "source_note" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_at" TIMESTAMPTZ(3),
    "status" "lead_status" NOT NULL DEFAULT 'NEW',
    "lost_reason" TEXT,
    "assignee_id" TEXT,
    "submission_id" TEXT,
    "invited_at" TIMESTAMPTZ(3),
    "invited_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "kind" "lead_event_kind" NOT NULL,
    "from_status" "lead_status",
    "to_status" "lead_status",
    "body" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "leads_submission_id_key" ON "leads"("submission_id");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_program_id_idx" ON "leads"("program_id");

-- CreateIndex
CREATE INDEX "lead_events_lead_id_created_at_idx" ON "lead_events"("lead_id", "created_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A lead must be reachable, and consent is recorded with its time (ADM-01 AC-3, AC-2).
ALTER TABLE "leads" ADD CONSTRAINT "leads_contact_check" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL);
ALTER TABLE "leads" ADD CONSTRAINT "leads_consent_time_check" CHECK ("consent" = ("consent_at" IS NOT NULL));
-- A lost lead says why.
ALTER TABLE "leads" ADD CONSTRAINT "leads_lost_reason_check" CHECK ("status" <> 'LOST' OR "lost_reason" IS NOT NULL);
