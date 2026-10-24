-- CreateTable
CREATE TABLE "registration_notices" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "academic_year_id" TEXT NOT NULL,
    "program_id" TEXT,
    "registration_deadline" DATE NOT NULL,
    "documents" TEXT[],
    "contract_excerpt" TEXT NOT NULL DEFAULT '',
    "show_fees" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "registration_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_notices_announcement_id_key" ON "registration_notices"("announcement_id");

-- CreateIndex
CREATE INDEX "registration_notices_academic_year_id_idx" ON "registration_notices"("academic_year_id");

-- AddForeignKey
ALTER TABLE "registration_notices" ADD CONSTRAINT "registration_notices_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_notices" ADD CONSTRAINT "registration_notices_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_notices" ADD CONSTRAINT "registration_notices_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "study_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ADM-06 AC-1: at most 20 required-document lines per notice.
ALTER TABLE "registration_notices"
  ADD CONSTRAINT "registration_notices_documents_max" CHECK (cardinality("documents") <= 20);
