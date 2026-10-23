-- CreateEnum
CREATE TYPE "document_template_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "document_templates" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "status" "document_template_status" NOT NULL DEFAULT 'DRAFT',
    "html" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("type","year")
);

-- CreateTable
CREATE TABLE "issued_documents" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "verify_code" TEXT NOT NULL,
    "subject_type" TEXT,
    "subject_id" TEXT,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by_id" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,

    CONSTRAINT "issued_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_templates_type_status_idx" ON "document_templates"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_type_version_language_key" ON "document_templates"("type", "version", "language");

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_number_key" ON "issued_documents"("number");

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_file_id_key" ON "issued_documents"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "issued_documents_verify_code_key" ON "issued_documents"("verify_code");

-- CreateIndex
CREATE INDEX "issued_documents_type_issued_at_idx" ON "issued_documents"("type", "issued_at");

-- CreateIndex
CREATE INDEX "issued_documents_subject_type_subject_id_idx" ON "issued_documents"("subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1: a published or archived template never changes; only its status moves forward.
CREATE FUNCTION document_templates_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'document template is frozen' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (
    NEW.type IS DISTINCT FROM OLD.type
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.language IS DISTINCT FROM OLD.language
    OR NEW.valid_from IS DISTINCT FROM OLD.valid_from
    OR NEW.valid_to IS DISTINCT FROM OLD.valid_to
    OR NEW.html IS DISTINCT FROM OLD.html
    OR (OLD.status = 'ARCHIVED' AND NEW.status IS DISTINCT FROM OLD.status)
    OR (OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT')
  ) THEN
    RAISE EXCEPTION 'document template is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_templates_frozen
  BEFORE UPDATE OR DELETE ON document_templates
  FOR EACH ROW EXECUTE FUNCTION document_templates_frozen();
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_dates_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from");
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_last_check" CHECK ("last" >= 0);

-- AC-5/AC-9: an issued document never changes except for its cancellation fields.
CREATE FUNCTION issued_documents_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'issued documents are never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.type IS DISTINCT FROM OLD.type OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.file_id IS DISTINCT FROM OLD.file_id
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.verify_code IS DISTINCT FROM OLD.verify_code
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR (OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at) THEN
    RAISE EXCEPTION 'issued documents are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER issued_documents_immutable
  BEFORE UPDATE OR DELETE ON issued_documents
  FOR EACH ROW EXECUTE FUNCTION issued_documents_immutable();
