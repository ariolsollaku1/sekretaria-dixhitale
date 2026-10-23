-- CreateEnum
CREATE TYPE "study_cycle" AS ENUM ('FIRST', 'SECOND');

-- CreateTable
CREATE TABLE "study_programs" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "cycle" "study_cycle" NOT NULL,
    "subtype" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "duration_years" INTEGER NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "study_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_programs_code_key" ON "study_programs"("code");

-- CreateIndex
CREATE INDEX "study_programs_department_id_idx" ON "study_programs"("department_id");

-- AddForeignKey
ALTER TABLE "study_programs" ADD CONSTRAINT "study_programs_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Shape checks (cycle-specific durations are validated in the app against settings).
ALTER TABLE "study_programs" ADD CONSTRAINT "study_programs_duration_check" CHECK ("duration_years" BETWEEN 1 AND 3);
ALTER TABLE "study_programs" ADD CONSTRAINT "study_programs_credits_check" CHECK ("total_credits" BETWEEN 1 AND 600);
ALTER TABLE "study_programs" ADD CONSTRAINT "study_programs_subtype_check" CHECK ("subtype" IS NULL OR "cycle" = 'SECOND');
