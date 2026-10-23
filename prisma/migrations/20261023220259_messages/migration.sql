-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('PENDING', 'SENT');

-- CreateEnum
CREATE TYPE "delivery_state" AS ENUM ('QUEUED', 'DELIVERED', 'NO_ACCOUNT');

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source_table" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'PENDING',
    "recipient_count" INTEGER NOT NULL,
    "no_account_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "user_id" TEXT,
    "state" "delivery_state" NOT NULL DEFAULT 'QUEUED',
    "notification_id" TEXT,
    "email_outbox_id" TEXT,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_created_by_id_created_at_idx" ON "messages"("created_by_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_status_created_at_idx" ON "messages"("status", "created_at");

-- CreateIndex
CREATE INDEX "message_recipients_message_id_state_idx" ON "message_recipients"("message_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipients_message_id_person_id_key" ON "message_recipients"("message_id", "person_id");

-- CreateIndex
CREATE INDEX "message_templates_archived_at_name_idx" ON "message_templates"("archived_at", "name");

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- NTF-03: sanity checks on the counters (subject/body limits are enforced by the service)
ALTER TABLE "messages" ADD CONSTRAINT "messages_counts_check" CHECK ("recipient_count" > 0 AND "no_account_count" >= 0 AND "no_account_count" <= "recipient_count");
