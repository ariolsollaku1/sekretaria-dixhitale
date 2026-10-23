-- CreateEnum
CREATE TYPE "form_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "form_audience" AS ENUM ('PUBLIC', 'AUTHENTICATED');

-- CreateEnum
CREATE TYPE "form_event_kind" AS ENUM ('SUBMITTED', 'STATE', 'ASSIGNED', 'COMMENT');

-- CreateTable
CREATE TABLE "form_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "form_status" NOT NULL DEFAULT 'DRAFT',
    "audience" "form_audience" NOT NULL,
    "owner_roles" "role"[],
    "definition" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "submitter_id" TEXT,
    "answers" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "assignee_id" TEXT,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submission_events" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "kind" "form_event_kind" NOT NULL,
    "from_state" TEXT,
    "to_state" TEXT,
    "comment" TEXT,
    "actor_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submission_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_definitions_key_version_key" ON "form_definitions"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_submissions_reference_key" ON "form_submissions"("reference");

-- CreateIndex
CREATE INDEX "form_submissions_definition_id_state_idx" ON "form_submissions"("definition_id", "state");

-- CreateIndex
CREATE INDEX "form_submissions_submitter_id_idx" ON "form_submissions"("submitter_id");

-- CreateIndex
CREATE INDEX "form_submission_events_submission_id_created_at_idx" ON "form_submission_events"("submission_id", "created_at");

-- CreateIndex
CREATE INDEX "rate_limit_hits_bucket_at_idx" ON "rate_limit_hits"("bucket", "at");

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "form_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_submitter_id_fkey" FOREIGN KEY ("submitter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission_events" ADD CONSTRAINT "form_submission_events_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1: at most one PUBLISHED version per form key.
CREATE UNIQUE INDEX "form_definitions_one_published_per_key" ON "form_definitions" ("key") WHERE "status" = 'PUBLISHED';
ALTER TABLE "form_definitions" ADD CONSTRAINT "form_definitions_version_check" CHECK ("version" >= 1);
-- AC-3: a published or archived definition never changes (its status may only move forward).
CREATE FUNCTION form_definitions_frozen() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'form definition is frozen' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'DRAFT' AND (
    NEW.key IS DISTINCT FROM OLD.key
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.audience IS DISTINCT FROM OLD.audience
    OR NEW.owner_roles IS DISTINCT FROM OLD.owner_roles
    OR NEW.definition IS DISTINCT FROM OLD.definition
    OR (OLD.status = 'ARCHIVED' AND NEW.status IS DISTINCT FROM OLD.status)
    OR (OLD.status = 'PUBLISHED' AND NEW.status = 'DRAFT')
  ) THEN
    RAISE EXCEPTION 'form definition is frozen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER form_definitions_frozen
  BEFORE UPDATE OR DELETE ON form_definitions
  FOR EACH ROW EXECUTE FUNCTION form_definitions_frozen();
