-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" TEXT NOT NULL,
    "assignment_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "room" TEXT,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_entries_assignment_id_idx" ON "timetable_entries"("assignment_id");

-- CreateIndex
CREATE INDEX "timetable_entries_weekday_idx" ON "timetable_entries"("weekday");

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "teaching_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1: ranges (the application validates the same).
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7);
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_time_check" CHECK ("start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute");
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_dates_check" CHECK ("valid_from" <= "valid_to");
