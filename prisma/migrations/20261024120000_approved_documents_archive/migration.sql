-- CreateEnum
CREATE TYPE "approved_document_kind" AS ENUM ('DIPLOMA_FORM', 'DIPLOMA_SUPPLEMENT', 'DECISION', 'OTHER');

-- CreateEnum
CREATE TYPE "approved_document_status" AS ENUM ('ACTIVE', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "approved_documents" (
    "id" TEXT NOT NULL,
    "kind" "approved_document_kind" NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "program_id" TEXT,
    "title" TEXT NOT NULL,
    "decision_ref" TEXT,
    "decision_date" DATE,
    "file_id" TEXT NOT NULL,
    "template_id" TEXT,
    "notes" TEXT,
    "status" "approved_document_status" NOT NULL DEFAULT 'ACTIVE',
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_by_id" TEXT,
    "withdraw_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "approved_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approved_documents_file_id_key" ON "approved_documents"("file_id");

-- CreateIndex
CREATE INDEX "approved_documents_academic_year_id_program_id_idx" ON "approved_documents"("academic_year_id", "program_id");

-- AddForeignKey
ALTER TABLE "approved_documents" ADD CONSTRAINT "approved_documents_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_documents" ADD CONSTRAINT "approved_documents_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_documents" ADD CONSTRAINT "approved_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AC-4: withdrawal needs a reason and is consistent.
ALTER TABLE "approved_documents" ADD CONSTRAINT "approved_documents_withdrawn_check" CHECK (
  ("status" = 'ACTIVE' AND "withdrawn_at" IS NULL AND "withdraw_reason" IS NULL)
  OR ("status" = 'WITHDRAWN' AND "withdrawn_at" IS NOT NULL AND length(trim("withdraw_reason")) > 0)
);

-- AC-3/AC-4: archive documents are never deleted; kind, year, program and file never change.
CREATE FUNCTION approved_documents_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'approved document is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.academic_year_id IS DISTINCT FROM OLD.academic_year_id
    OR NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.file_id IS DISTINCT FROM OLD.file_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.status = 'WITHDRAWN' AND NEW.status IS DISTINCT FROM OLD.status)
  THEN
    RAISE EXCEPTION 'approved document is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER approved_documents_frozen
  BEFORE UPDATE OR DELETE ON approved_documents
  FOR EACH ROW EXECUTE FUNCTION approved_documents_frozen();
