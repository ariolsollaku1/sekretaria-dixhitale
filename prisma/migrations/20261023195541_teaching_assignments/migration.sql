-- CreateEnum
CREATE TYPE "teaching_kind" AS ENUM ('LECTURE', 'SEMINAR', 'LAB');

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "plan_course_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,
    "kind" "teaching_kind" NOT NULL,
    "semester" INTEGER NOT NULL,
    "planned_hours" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teaching_assignments_staff_id_idx" ON "teaching_assignments"("staff_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_plan_course_id_idx" ON "teaching_assignments"("plan_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_assignments_group_id_plan_course_id_kind_staff_id_key" ON "teaching_assignments"("group_id", "plan_course_id", "kind", "staff_id");

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_plan_course_id_fkey" FOREIGN KEY ("plan_course_id") REFERENCES "plan_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1: ranges (the application validates the same).
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_semester_check" CHECK ("semester" IN (1, 2));
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_hours_check" CHECK ("planned_hours" BETWEEN 0 AND 500);
