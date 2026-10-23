-- AC-1: the internal student number comes from a sequence (zero-padded 6 digits, never reused).
CREATE SEQUENCE student_number_seq;

-- CreateEnum
CREATE TYPE "registration_type" AS ENUM ('FIRST_TIME', 'SECOND_PROGRAM', 'TRANSFER');

-- CreateEnum
CREATE TYPE "enrollment_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'DEREGISTERED', 'GRADUATED');

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "birth_place" TEXT,
ADD COLUMN     "residence" TEXT;

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "student_number" TEXT NOT NULL DEFAULT lpad((nextval('student_number_seq'::regclass))::text, 6, '0'::text),
    "nim" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "cohort_id" TEXT NOT NULL,
    "registration_type" "registration_type" NOT NULL,
    "status" "enrollment_status" NOT NULL DEFAULT 'ACTIVE',
    "started_at" DATE NOT NULL,
    "ended_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_registrations" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "year_of_study" INTEGER NOT NULL,
    "group_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "year_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment_status_events" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "from_status" "enrollment_status",
    "to_status" "enrollment_status" NOT NULL,
    "reason" TEXT,
    "effective_date" DATE NOT NULL,
    "document_ref" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "enrollment_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_person_id_key" ON "students"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_student_number_key" ON "students"("student_number");

-- CreateIndex
CREATE UNIQUE INDEX "students_nim_key" ON "students"("nim");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "enrollments_program_id_status_idx" ON "enrollments"("program_id", "status");

-- CreateIndex
CREATE INDEX "enrollments_cohort_id_idx" ON "enrollments"("cohort_id");

-- CreateIndex
CREATE INDEX "year_registrations_group_id_idx" ON "year_registrations"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "year_registrations_enrollment_id_academic_year_id_key" ON "year_registrations"("enrollment_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "enrollment_status_events_enrollment_id_created_at_idx" ON "enrollment_status_events"("enrollment_id", "created_at");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_registrations" ADD CONSTRAINT "year_registrations_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_registrations" ADD CONSTRAINT "year_registrations_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_registrations" ADD CONSTRAINT "year_registrations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "student_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment_status_events" ADD CONSTRAINT "enrollment_status_events_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-3: one open (ACTIVE or SUSPENDED) enrollment per student and program.
CREATE UNIQUE INDEX "enrollments_one_open_per_program" ON "enrollments" ("student_id", "program_id") WHERE "status" IN ('ACTIVE', 'SUSPENDED');

-- AC-2/AC-7: dates and years make sense.
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_dates_check" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at");
ALTER TABLE "year_registrations" ADD CONSTRAINT "year_registrations_year_check" CHECK ("year_of_study" >= 1);
