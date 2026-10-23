-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('PLANNED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "attendance_status" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');

-- CreateTable
CREATE TABLE "class_sessions" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL,
    "topic" TEXT,
    "status" "session_status" NOT NULL DEFAULT 'PLANNED',
    "timetable_entry_id" TEXT,
    "held_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_marks" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "attendance_status" NOT NULL,
    "note" TEXT,
    "marked_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_sessions_date_idx" ON "class_sessions"("date");

-- CreateIndex
CREATE INDEX "class_sessions_timetable_entry_id_idx" ON "class_sessions"("timetable_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_sessions_assignment_id_date_start_minute_key" ON "class_sessions"("assignment_id", "date", "start_minute");

-- CreateIndex
CREATE INDEX "attendance_marks_student_id_idx" ON "attendance_marks"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_marks_session_id_student_id_key" ON "attendance_marks"("session_id", "student_id");

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_timetable_entry_id_fkey" FOREIGN KEY ("timetable_entry_id") REFERENCES "timetable_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks" ADD CONSTRAINT "attendance_marks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1: ranges (the application validates the same).
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_hours_check" CHECK ("hours" BETWEEN 1 AND 12);
ALTER TABLE "class_sessions" ADD CONSTRAINT "class_sessions_time_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute");
