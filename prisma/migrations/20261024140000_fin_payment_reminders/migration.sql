-- CreateEnum
CREATE TYPE "reminder_kind" AS ENUM ('UPCOMING', 'OVERDUE');

-- CreateEnum
CREATE TYPE "reminder_outcome" AS ENUM ('SENT', 'NO_ACCOUNT');

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" TEXT NOT NULL,
    "installment_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "kind" "reminder_kind" NOT NULL,
    "outcome" "reminder_outcome" NOT NULL,
    "user_id" TEXT,
    "due_date" DATE NOT NULL,
    "outstanding" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_reminders_installment_id_kind_idx" ON "payment_reminders"("installment_id", "kind");

-- CreateIndex
CREATE INDEX "payment_reminders_student_id_idx" ON "payment_reminders"("student_id");

-- CreateIndex
CREATE INDEX "payment_reminders_created_at_idx" ON "payment_reminders"("created_at");

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "plan_installments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FIN-04 AC-2: a second run can never send the same reminder twice (partial: NO_ACCOUNT rows may repeat).
CREATE UNIQUE INDEX "payment_reminders_sent_once" ON "payment_reminders"("installment_id", "kind") WHERE "outcome" = 'SENT';
