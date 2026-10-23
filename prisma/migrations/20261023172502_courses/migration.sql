-- CreateTable
CREATE TABLE "course_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_sq" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "course_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "default_credits" INTEGER NOT NULL,
    "category_id" TEXT,
    "hours_lecture" INTEGER NOT NULL DEFAULT 0,
    "hours_seminar" INTEGER NOT NULL DEFAULT 0,
    "hours_lab" INTEGER NOT NULL DEFAULT 0,
    "department_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_categories_code_key" ON "course_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_department_id_idx" ON "courses"("department_id");

-- CreateIndex
CREATE INDEX "courses_category_id_idx" ON "courses"("category_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "course_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AC-1: numeric ranges (Q-28 working assumption); the app validates the same limits.
ALTER TABLE "courses" ADD CONSTRAINT "courses_credits_check" CHECK ("default_credits" BETWEEN 0 AND 60);
ALTER TABLE "courses" ADD CONSTRAINT "courses_hours_check" CHECK (
  "hours_lecture" BETWEEN 0 AND 500 AND "hours_seminar" BETWEEN 0 AND 500 AND "hours_lab" BETWEEN 0 AND 500
);
