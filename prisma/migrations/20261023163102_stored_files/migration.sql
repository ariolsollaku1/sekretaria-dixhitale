-- CreateEnum
CREATE TYPE "file_status" AS ENUM ('PENDING', 'ATTACHED');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "file_status" NOT NULL DEFAULT 'PENDING',
    "entity_type" TEXT,
    "entity_id" TEXT,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attached_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storage_key_key" ON "stored_files"("storage_key");

-- CreateIndex
CREATE INDEX "stored_files_entity_type_entity_id_idx" ON "stored_files"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "stored_files_status_created_at_idx" ON "stored_files"("status", "created_at");
