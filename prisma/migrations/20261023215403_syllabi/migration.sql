-- CreateEnum
CREATE TYPE "syllabus_status" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "syllabi" (
    "id" TEXT NOT NULL,
    "plan_course_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "syllabus_status" NOT NULL DEFAULT 'DRAFT',
    "file_id" TEXT NOT NULL,
    "notes" TEXT,
    "approved_at" TIMESTAMPTZ(3),
    "approved_by_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "syllabi_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "syllabi_file_id_key" ON "syllabi"("file_id");

-- CreateIndex
CREATE INDEX "syllabi_plan_course_id_academic_year_id_status_idx" ON "syllabi"("plan_course_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "syllabi_academic_year_id_idx" ON "syllabi"("academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "syllabi_plan_course_id_academic_year_id_version_key" ON "syllabi"("plan_course_id", "academic_year_id", "version");

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_plan_course_id_fkey" FOREIGN KEY ("plan_course_id") REFERENCES "plan_courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-4: at most one approved syllabus per plan course and academic year.
CREATE UNIQUE INDEX "syllabi_one_approved_key" ON "syllabi"("plan_course_id", "academic_year_id") WHERE "status" = 'APPROVED';
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_version_check" CHECK ("version" >= 1);

-- AC-5: an approved or archived syllabus never changes (only APPROVED -> ARCHIVED) and is never deleted.
CREATE FUNCTION syllabi_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'syllabus is frozen' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (
    NEW.plan_course_id IS DISTINCT FROM OLD.plan_course_id
    OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.file_id IS DISTINCT FROM OLD.file_id
    OR NEW.notes IS DISTINCT FROM OLD.notes
    OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
    OR NEW.approved_by_id IS DISTINCT FROM OLD.approved_by_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'APPROVED' AND NEW.status = 'ARCHIVED'))
  ) THEN
    RAISE EXCEPTION 'syllabus is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER syllabi_frozen
  BEFORE UPDATE OR DELETE ON syllabi
  FOR EACH ROW EXECUTE FUNCTION syllabi_frozen();
