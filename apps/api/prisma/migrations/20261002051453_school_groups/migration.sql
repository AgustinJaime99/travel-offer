-- CreateEnum
CREATE TYPE "SchoolGroupStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "SchoolGroup" (
    "id" UUID NOT NULL,
    "schoolId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "travelYear" INTEGER NOT NULL,
    "estimatedStudents" INTEGER,
    "status" "SchoolGroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "accessCodeHash" TEXT,
    "accessCodeRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolGroup_travelYear_status_idx" ON "SchoolGroup"("travelYear", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolGroup_schoolId_normalizedName_travelYear_key" ON "SchoolGroup"("schoolId", "normalizedName", "travelYear");

-- AddForeignKey
ALTER TABLE "SchoolGroup" ADD CONSTRAINT "SchoolGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (ADR-06): the application validates; the database refuses impossible values.
ALTER TABLE "SchoolGroup"
  ADD CONSTRAINT "SchoolGroup_estimatedStudents_check" CHECK ("estimatedStudents" > 0),
  ADD CONSTRAINT "SchoolGroup_travelYear_check" CHECK ("travelYear" BETWEEN 2000 AND 2100),
  ADD CONSTRAINT "SchoolGroup_normalizedName_format_check" CHECK ("normalizedName" ~ '^[a-z0-9]+( [a-z0-9]+)*$'),
  ADD CONSTRAINT "SchoolGroup_accessCode_consistency_check" CHECK (("accessCodeHash" IS NULL) = ("accessCodeRotatedAt" IS NULL));
