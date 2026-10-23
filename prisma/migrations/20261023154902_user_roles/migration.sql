-- CreateEnum
CREATE TYPE "role" AS ENUM ('sysadmin', 'secretary', 'student_affairs', 'lecturer', 'finance', 'hr', 'quality', 'library', 'administration', 'student', 'head_of_department', 'program_coordinator', 'erasmus');

-- CreateEnum
CREATE TYPE "scope_type" AS ENUM ('INSTITUTION', 'FACULTY', 'DEPARTMENT', 'PROGRAM', 'SELF');

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "scope_type" "scope_type" NOT NULL,
    "scope_id" TEXT,
    "valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_scope_type_scope_id_key" ON "user_roles"("user_id", "role", "scope_type", "scope_id") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
