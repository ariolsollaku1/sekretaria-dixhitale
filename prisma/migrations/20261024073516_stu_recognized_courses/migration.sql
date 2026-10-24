-- CreateTable
CREATE TABLE "recognized_courses" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "recognized_courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recognized_courses_student_id_idx" ON "recognized_courses"("student_id");

-- CreateIndex
CREATE INDEX "recognized_courses_enrollment_id_idx" ON "recognized_courses"("enrollment_id");

-- CreateIndex
CREATE INDEX "recognized_courses_submission_id_idx" ON "recognized_courses"("submission_id");

-- CreateIndex
CREATE INDEX "recognized_courses_course_id_idx" ON "recognized_courses"("course_id");

-- AddForeignKey
ALTER TABLE "recognized_courses" ADD CONSTRAINT "recognized_courses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognized_courses" ADD CONSTRAINT "recognized_courses_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognized_courses" ADD CONSTRAINT "recognized_courses_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recognized_courses" ADD CONSTRAINT "recognized_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- STU-07 AC-5: one live recognition per enrollment and course; a voided one does not count.
CREATE UNIQUE INDEX "recognized_courses_live_key" ON "recognized_courses" ("enrollment_id", "course_id") WHERE "voided_at" IS NULL;
