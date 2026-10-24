-- CreateEnum
CREATE TYPE "hours_approval_status" AS ENUM ('APPROVED', 'OPEN');

-- CreateTable
CREATE TABLE "hours_approvals" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "hours_approval_status" NOT NULL,
    "held_hours" INTEGER NOT NULL,
    "adjustment_hours" INTEGER NOT NULL,
    "decided_at" TIMESTAMPTZ(3) NOT NULL,
    "decided_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hours_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hours_adjustments" (
    "id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "hours_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hours_approvals_staff_id_month_key" ON "hours_approvals"("staff_id", "month");

-- CreateIndex
CREATE INDEX "hours_adjustments_staff_id_month_idx" ON "hours_adjustments"("staff_id", "month");

-- CreateIndex
CREATE INDEX "hours_adjustments_assignment_id_idx" ON "hours_adjustments"("assignment_id");

-- AddForeignKey
ALTER TABLE "hours_approvals" ADD CONSTRAINT "hours_approvals_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hours_adjustments" ADD CONSTRAINT "hours_adjustments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hours_adjustments" ADD CONSTRAINT "hours_adjustments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-9: a calendar month `YYYY-MM`, and an adjustment always changes the hours (the application validates the same).
ALTER TABLE "hours_approvals" ADD CONSTRAINT "hours_approvals_month_check" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "hours_adjustments" ADD CONSTRAINT "hours_adjustments_month_check" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "hours_adjustments" ADD CONSTRAINT "hours_adjustments_hours_check" CHECK ("hours" <> 0);
