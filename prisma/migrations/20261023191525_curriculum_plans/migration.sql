-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "curriculum_plans" (
    "id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "valid_from_academic_year_id" TEXT NOT NULL,
    "status" "plan_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "curriculum_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_courses" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "year_of_study" INTEGER NOT NULL,
    "semester" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "category_id" TEXT,
    "hours_lecture" INTEGER NOT NULL DEFAULT 0,
    "hours_seminar" INTEGER NOT NULL DEFAULT 0,
    "hours_lab" INTEGER NOT NULL DEFAULT 0,
    "is_elective" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plan_courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_plans_program_id_status_idx" ON "curriculum_plans"("program_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_plans_program_id_version_key" ON "curriculum_plans"("program_id", "version");

-- CreateIndex
CREATE INDEX "plan_courses_plan_id_year_of_study_semester_idx" ON "plan_courses"("plan_id", "year_of_study", "semester");

-- CreateIndex
CREATE UNIQUE INDEX "plan_courses_plan_id_course_id_key" ON "plan_courses"("plan_id", "course_id");

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_valid_from_academic_year_id_fkey" FOREIGN KEY ("valid_from_academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "curriculum_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "course_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AC-2: ranges (Q-28 limits; the application validates the same).
ALTER TABLE "curriculum_plans" ADD CONSTRAINT "curriculum_plans_version_check" CHECK ("version" >= 1);
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_position_check" CHECK ("year_of_study" >= 1 AND "semester" IN (1, 2));
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_credits_check" CHECK ("credits" BETWEEN 0 AND 60);
ALTER TABLE "plan_courses" ADD CONSTRAINT "plan_courses_hours_check" CHECK (
  "hours_lecture" BETWEEN 0 AND 500 AND "hours_seminar" BETWEEN 0 AND 500 AND "hours_lab" BETWEEN 0 AND 500
);

-- AC-4: an approved or archived plan is frozen, whatever the application does.
CREATE FUNCTION plan_courses_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  plan_status plan_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT status INTO plan_status FROM curriculum_plans WHERE id = OLD.plan_id;
  ELSE
    SELECT status INTO plan_status FROM curriculum_plans WHERE id = NEW.plan_id;
  END IF;
  -- the parent is gone already (cascade of a deleted draft): nothing to protect
  IF plan_status IS NOT NULL AND plan_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'plan is frozen' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER plan_courses_frozen
  BEFORE INSERT OR UPDATE OR DELETE ON plan_courses
  FOR EACH ROW EXECUTE FUNCTION plan_courses_frozen();

CREATE FUNCTION curriculum_plans_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'plan is frozen' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (
    NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.valid_from_academic_year_id IS DISTINCT FROM OLD.valid_from_academic_year_id
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id
    OR (OLD.status = 'ARCHIVED' AND NEW.status IS DISTINCT FROM OLD.status)
    OR (OLD.status = 'APPROVED' AND NEW.status = 'DRAFT')
  ) THEN
    RAISE EXCEPTION 'plan is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER curriculum_plans_frozen
  BEFORE UPDATE OR DELETE ON curriculum_plans
  FOR EACH ROW EXECUTE FUNCTION curriculum_plans_frozen();
