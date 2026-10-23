-- CreateTable
CREATE TABLE "cohorts" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "start_academic_year_id" TEXT NOT NULL,
    "curriculum_plan_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_groups" (
    "id" TEXT NOT NULL,
    "cohort_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "year_of_study" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "student_groups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cohorts_curriculum_plan_id_idx" ON "cohorts"("curriculum_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "cohorts_program_id_start_academic_year_id_name_key" ON "cohorts"("program_id", "start_academic_year_id", "name");

-- CreateIndex
CREATE INDEX "student_groups_academic_year_id_idx" ON "student_groups"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_groups_cohort_id_academic_year_id_year_of_study_nam_key" ON "student_groups"("cohort_id", "academic_year_id", "year_of_study", "name");

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_start_academic_year_id_fkey" FOREIGN KEY ("start_academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_curriculum_plan_id_fkey" FOREIGN KEY ("curriculum_plan_id") REFERENCES "curriculum_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-6: ranges (the application validates the same).
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_year_check" CHECK ("year_of_study" >= 1);
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_capacity_check" CHECK ("capacity" IS NULL OR "capacity" BETWEEN 1 AND 1000);
