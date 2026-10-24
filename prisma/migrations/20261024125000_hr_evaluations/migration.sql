-- CreateEnum
CREATE TYPE "evaluation_kind" AS ENUM ('LECTURER', 'STAFF');

-- CreateEnum
CREATE TYPE "campaign_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "evaluation_state" AS ENUM ('PENDING', 'SUBMITTED');

-- CreateTable
CREATE TABLE "evaluation_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "evaluation_kind" NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "form_definition_id" TEXT NOT NULL,
    "results_visible" BOOLEAN NOT NULL DEFAULT false,
    "status" "campaign_status" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(3),
    "closed_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "evaluation_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "evaluator_id" TEXT,
    "state" "evaluation_state" NOT NULL DEFAULT 'PENDING',
    "answers" JSONB,
    "score" DECIMAL(3,2),
    "submitted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluation_campaigns_status_idx" ON "evaluation_campaigns"("status");

-- CreateIndex
CREATE INDEX "evaluations_evaluator_id_idx" ON "evaluations"("evaluator_id");

-- CreateIndex
CREATE INDEX "evaluations_staff_id_idx" ON "evaluations"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_campaign_id_staff_id_key" ON "evaluations"("campaign_id", "staff_id");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "evaluation_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
