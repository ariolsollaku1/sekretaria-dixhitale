-- CreateEnum
CREATE TYPE "exam_session_type" AS ENUM ('WINTER', 'SUMMER', 'AUTUMN', 'MINI');

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "type" "exam_session_type" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sittings" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "plan_course_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "room" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "exam_sittings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sitting_examiners" (
    "sitting_id" TEXT NOT NULL,
    "staff_id" TEXT NOT NULL,

    CONSTRAINT "exam_sitting_examiners_pkey" PRIMARY KEY ("sitting_id","staff_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_academic_year_id_type_key" ON "exam_sessions"("academic_year_id", "type");

-- CreateIndex
CREATE INDEX "exam_sittings_date_idx" ON "exam_sittings"("date");

-- CreateIndex
CREATE INDEX "exam_sittings_plan_course_id_idx" ON "exam_sittings"("plan_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sittings_session_id_plan_course_id_key" ON "exam_sittings"("session_id", "plan_course_id");

-- CreateIndex
CREATE INDEX "exam_sitting_examiners_staff_id_idx" ON "exam_sitting_examiners"("staff_id");

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sittings" ADD CONSTRAINT "exam_sittings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "exam_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sittings" ADD CONSTRAINT "exam_sittings_plan_course_id_fkey" FOREIGN KEY ("plan_course_id") REFERENCES "plan_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sitting_examiners" ADD CONSTRAINT "exam_sitting_examiners_sitting_id_fkey" FOREIGN KEY ("sitting_id") REFERENCES "exam_sittings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sitting_examiners" ADD CONSTRAINT "exam_sitting_examiners_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CAL-03 AC-1/AC-2: ranges (the application validates the same).
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_dates_check" CHECK ("start_date" <= "end_date");
ALTER TABLE "exam_sittings" ADD CONSTRAINT "exam_sittings_time_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute");
