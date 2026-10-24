-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'ENROLLED');

-- CreateTable
CREATE TABLE "application_cycles" (
    "id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "opens_on" DATE NOT NULL,
    "closes_on" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "application_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_cycle_documents" (
    "id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label_sq" TEXT NOT NULL,
    "label_en" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "application_cycle_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "status" "application_status" NOT NULL DEFAULT 'SUBMITTED',
    "locale" TEXT NOT NULL DEFAULT 'sq',
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "father_name" TEXT,
    "gender" "gender" NOT NULL,
    "birth_date" DATE NOT NULL,
    "birth_place" TEXT,
    "national_id" TEXT,
    "email" TEXT NOT NULL,
    "email_key" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "residence" TEXT,
    "school_name" TEXT NOT NULL,
    "school_city" TEXT,
    "graduation_year" INTEGER NOT NULL,
    "average_grade" DECIMAL(4,2) NOT NULL,
    "consent_at" TIMESTAMPTZ(3) NOT NULL,
    "token_hash" TEXT NOT NULL,
    "token_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_documents" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "document_key" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_at" TIMESTAMPTZ(3),

    CONSTRAINT "application_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "application_cycles_academic_year_id_name_key" ON "application_cycles"("academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "application_cycle_documents_cycle_id_key_key" ON "application_cycle_documents"("cycle_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "applications_reference_key" ON "applications"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "applications_token_hash_key" ON "applications"("token_hash");

-- CreateIndex
CREATE INDEX "applications_program_id_idx" ON "applications"("program_id");

-- CreateIndex
CREATE INDEX "applications_status_submitted_at_idx" ON "applications"("status", "submitted_at");

-- CreateIndex
CREATE UNIQUE INDEX "applications_cycle_id_program_id_email_key_key" ON "applications"("cycle_id", "program_id", "email_key");

-- CreateIndex
CREATE UNIQUE INDEX "application_documents_file_id_key" ON "application_documents"("file_id");

-- CreateIndex
CREATE INDEX "application_documents_application_id_document_key_idx" ON "application_documents"("application_id", "document_key");

-- AddForeignKey
ALTER TABLE "application_cycles" ADD CONSTRAINT "application_cycles_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_cycle_documents" ADD CONSTRAINT "application_cycle_documents_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "application_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "application_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_documents" ADD CONSTRAINT "application_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
