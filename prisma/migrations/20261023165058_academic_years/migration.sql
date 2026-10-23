-- CreateEnum
CREATE TYPE "academic_year_status" AS ENUM ('PLANNED', 'CURRENT', 'CLOSED');

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "academic_year_status" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_code_key" ON "academic_years"("code");

-- CreateIndex
CREATE INDEX "academic_years_status_idx" ON "academic_years"("status");

-- CreateIndex
CREATE UNIQUE INDEX "semesters_academic_year_id_number_key" ON "semesters"("academic_year_id", "number");

-- AddForeignKey
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-4: at most one CURRENT academic year, enforced by the database.
CREATE UNIQUE INDEX "one_current_academic_year" ON "academic_years" ("status") WHERE "status" = 'CURRENT';

-- AC-2/AC-3: shape checks (ordering across years and semesters is validated in the app).
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_number_check" CHECK ("number" IN (1, 2));
ALTER TABLE "semesters" ADD CONSTRAINT "semesters_dates_check" CHECK ("start_date" < "end_date");
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_check" CHECK ("start_date" < "end_date");
