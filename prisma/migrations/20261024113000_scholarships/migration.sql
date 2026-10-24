-- CreateEnum
CREATE TYPE "scholarship_type" AS ENUM ('FULL', 'PARTIAL');

-- CreateEnum
CREATE TYPE "scholarship_category" AS ENUM ('EXCELLENCE', 'NEED', 'DISABILITY', 'OTHER');

-- CreateTable
CREATE TABLE "scholarships" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "type" "scholarship_type" NOT NULL,
    "category" "scholarship_category" NOT NULL,
    "percent" DECIMAL(5,2),
    "amount" DECIMAL(12,2),
    "reason" TEXT NOT NULL,
    "submission_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarship_cuts" (
    "id" TEXT NOT NULL,
    "scholarship_id" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "scholarship_cuts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scholarships_academic_year_id_voided_at_idx" ON "scholarships"("academic_year_id", "voided_at");

-- CreateIndex
CREATE INDEX "scholarships_enrollment_id_idx" ON "scholarships"("enrollment_id");

-- CreateIndex
CREATE INDEX "scholarships_submission_id_idx" ON "scholarships"("submission_id");

-- CreateIndex
CREATE INDEX "scholarship_cuts_installment_id_idx" ON "scholarship_cuts"("installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "scholarship_cuts_scholarship_id_installment_id_key" ON "scholarship_cuts"("scholarship_id", "installment_id");

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_cuts" ADD CONSTRAINT "scholarship_cuts_scholarship_id_fkey" FOREIGN KEY ("scholarship_id") REFERENCES "scholarships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarship_cuts" ADD CONSTRAINT "scholarship_cuts_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "plan_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIN-03 AC-1: one live scholarship per enrollment and academic year; the rest of the rules are checks.
CREATE UNIQUE INDEX "scholarships_live_key" ON "scholarships"("enrollment_id", "academic_year_id") WHERE "voided_at" IS NULL;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_terms_check" CHECK (
  ("type" = 'FULL' AND "percent" IS NULL AND "amount" IS NULL)
  OR ("type" = 'PARTIAL' AND (("percent" IS NOT NULL AND "amount" IS NULL AND "percent" > 0 AND "percent" < 100)
                          OR ("percent" IS NULL AND "amount" IS NOT NULL AND "amount" > 0)))
);
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_void_check" CHECK (
  ("voided_at" IS NULL AND "void_reason" IS NULL) OR ("voided_at" IS NOT NULL AND "void_reason" IS NOT NULL)
);
ALTER TABLE "scholarship_cuts" ADD CONSTRAINT "scholarship_cuts_amount_check" CHECK ("amount" > 0);
