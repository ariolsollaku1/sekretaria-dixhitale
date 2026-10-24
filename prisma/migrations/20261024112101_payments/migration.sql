-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('RECORDED', 'VOIDED');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paid_on" DATE NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "method" "payment_method" NOT NULL,
    "installment_id" TEXT,
    "status" "payment_status" NOT NULL DEFAULT 'RECORDED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" TEXT,
    "import_batch" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_plan_id_idx" ON "payments"("plan_id");

-- CreateIndex
CREATE INDEX "payments_paid_on_idx" ON "payments"("paid_on");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "payment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "plan_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AC-1, AC-12: a payment is a positive amount (the application validates the same).
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount" > 0);
