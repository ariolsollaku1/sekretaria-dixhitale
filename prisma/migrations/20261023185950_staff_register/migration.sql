-- CreateEnum
CREATE TYPE "gender" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "staff_kind" AS ENUM ('ACADEMIC', 'ADMINISTRATIVE');

-- CreateEnum
CREATE TYPE "staff_category" AS ENUM ('PAE', 'PAK', 'VOLUNTEER');

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "father_name" TEXT,
    "gender" "gender" NOT NULL,
    "birth_date" DATE NOT NULL,
    "national_id" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "kind" "staff_kind" NOT NULL,
    "category" "staff_category" NOT NULL,
    "degree" TEXT,
    "title" TEXT,
    "department_id" TEXT,
    "retired" BOOLEAN NOT NULL DEFAULT false,
    "primary_employer" TEXT,
    "contract_start" DATE NOT NULL,
    "contract_end" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persons_national_id_key" ON "persons"("national_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_email_key" ON "persons"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_person_id_key" ON "staff"("person_id");

-- CreateIndex
CREATE INDEX "staff_department_id_idx" ON "staff"("department_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AC-2: the contract cannot end before it starts.
ALTER TABLE "staff" ADD CONSTRAINT "staff_contract_check" CHECK ("contract_end" IS NULL OR "contract_end" >= "contract_start");
