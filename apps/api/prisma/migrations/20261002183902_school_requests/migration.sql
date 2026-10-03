-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('SCHOOL_NOT_FOUND', 'GROUP_NOT_FOUND');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "SchoolRequest" (
    "id" UUID NOT NULL,
    "type" "RequestType" NOT NULL,
    "applicantId" UUID NOT NULL,
    "schoolId" UUID,
    "schoolName" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "city" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "travelYear" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "dedupKey" TEXT NOT NULL,
    "demandKey" TEXT NOT NULL,
    "staffNotes" TEXT,
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolRequest_type_status_createdAt_idx" ON "SchoolRequest"("type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SchoolRequest_demandKey_status_idx" ON "SchoolRequest"("demandKey", "status");

-- AddForeignKey
ALTER TABLE "SchoolRequest" ADD CONSTRAINT "SchoolRequest_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolRequest" ADD CONSTRAINT "SchoolRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolRequest" ADD CONSTRAINT "SchoolRequest_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "StaffUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (ADR-06, B11).
CREATE UNIQUE INDEX "SchoolRequest_open_dedupKey_key"
  ON "SchoolRequest" ("dedupKey") WHERE status IN ('PENDING', 'REVIEWING');

ALTER TABLE "SchoolRequest"
  ADD CONSTRAINT "SchoolRequest_type_school_check"
    CHECK ((type = 'GROUP_NOT_FOUND') = ("schoolId" IS NOT NULL)),
  ADD CONSTRAINT "SchoolRequest_travelYear_check" CHECK ("travelYear" BETWEEN 2000 AND 2100);
