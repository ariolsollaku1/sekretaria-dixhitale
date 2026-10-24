-- CreateEnum
CREATE TYPE "eval_campaign_status" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "eval_section" AS ENUM ('LECTURER', 'ADMINISTRATION');

-- CreateTable
CREATE TABLE "eval_campaigns" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "eval_campaign_status" NOT NULL DEFAULT 'DRAFT',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "opened_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "eval_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_participations" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "assignment_id" TEXT,
    "completed_on" DATE NOT NULL,

    CONSTRAINT "eval_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_responses" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "assignment_id" TEXT,
    "section" "eval_section" NOT NULL,
    "answers" JSONB NOT NULL,

    CONSTRAINT "eval_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "eval_campaigns_academic_year_id_name_key" ON "eval_campaigns"("academic_year_id", "name");

-- CreateIndex
CREATE INDEX "eval_participations_campaign_id_target_key_idx" ON "eval_participations"("campaign_id", "target_key");

-- CreateIndex
CREATE UNIQUE INDEX "eval_participations_campaign_id_student_id_target_key_key" ON "eval_participations"("campaign_id", "student_id", "target_key");

-- CreateIndex
CREATE INDEX "eval_responses_campaign_id_assignment_id_idx" ON "eval_responses"("campaign_id", "assignment_id");

-- AddForeignKey
ALTER TABLE "eval_campaigns" ADD CONSTRAINT "eval_campaigns_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_participations" ADD CONSTRAINT "eval_participations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "eval_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_participations" ADD CONSTRAINT "eval_participations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_participations" ADD CONSTRAINT "eval_participations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_responses" ADD CONSTRAINT "eval_responses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "eval_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_responses" ADD CONSTRAINT "eval_responses_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
