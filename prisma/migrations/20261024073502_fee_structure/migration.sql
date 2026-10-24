-- CreateEnum
CREATE TYPE "fee_kind" AS ENUM ('TUITION', 'ADMINISTRATIVE', 'DIPLOMA', 'BACKLOG_EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "discount_kind" AS ENUM ('PERCENT', 'AMOUNT');

-- CreateEnum
CREATE TYPE "installment_status" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "fee_schedule_items" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "kind" "fee_kind" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "fee_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_installment_templates" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "fee_installment_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_discounts" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "kind" "discount_kind" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_plans" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_installments" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "fee_kind" NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "early_amount" DECIMAL(12,2),
    "early_until" DATE,
    "status" "installment_status" NOT NULL DEFAULT 'ACTIVE',
    "schedule_item_id" TEXT,
    "adjusted_at" TIMESTAMPTZ(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "plan_installments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_schedule_items_academic_year_id_idx" ON "fee_schedule_items"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedule_items_program_id_academic_year_id_kind_label_key" ON "fee_schedule_items"("program_id", "academic_year_id", "kind", "label");

-- CreateIndex
CREATE UNIQUE INDEX "fee_installment_templates_item_id_sequence_key" ON "fee_installment_templates"("item_id", "sequence");

-- CreateIndex
CREATE INDEX "fee_discounts_item_id_idx" ON "fee_discounts"("item_id");

-- CreateIndex
CREATE INDEX "payment_plans_academic_year_id_idx" ON "payment_plans"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_plans_enrollment_id_academic_year_id_key" ON "payment_plans"("enrollment_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "plan_installments_due_date_idx" ON "plan_installments"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "plan_installments_plan_id_sequence_key" ON "plan_installments"("plan_id", "sequence");

-- AddForeignKey
ALTER TABLE "fee_schedule_items" ADD CONSTRAINT "fee_schedule_items_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_schedule_items" ADD CONSTRAINT "fee_schedule_items_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_installment_templates" ADD CONSTRAINT "fee_installment_templates_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "fee_schedule_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "fee_schedule_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_plans" ADD CONSTRAINT "payment_plans_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_installments" ADD CONSTRAINT "plan_installments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1..AC-3, AC-12: money rules (the application validates the same).
ALTER TABLE "fee_schedule_items" ADD CONSTRAINT "fee_schedule_items_amount_check" CHECK ("amount" > 0);
ALTER TABLE "fee_installment_templates" ADD CONSTRAINT "fee_installment_templates_amount_check" CHECK ("amount" > 0 AND "sequence" > 0);
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_value_check" CHECK ("value" > 0 AND ("kind" <> 'PERCENT' OR "value" <= 100));
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_window_check" CHECK ("valid_from" <= "valid_to");
ALTER TABLE "plan_installments" ADD CONSTRAINT "plan_installments_amount_check" CHECK ("amount" > 0 AND "sequence" > 0);
ALTER TABLE "plan_installments" ADD CONSTRAINT "plan_installments_early_check" CHECK (("early_amount" IS NULL AND "early_until" IS NULL) OR ("early_amount" IS NOT NULL AND "early_until" IS NOT NULL AND "early_amount" >= 0 AND "early_amount" < "amount"));
