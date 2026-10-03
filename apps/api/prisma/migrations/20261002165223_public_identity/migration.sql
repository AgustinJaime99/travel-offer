-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "Relationship" AS ENUM ('GUARDIAN', 'ADULT_STUDENT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('SUBMITTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Applicant" (
    "id" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "privacyNoticeVersion" TEXT NOT NULL,
    "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Applicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicantContact" (
    "id" UUID NOT NULL,
    "applicantId" UUID NOT NULL,
    "type" "ContactType" NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicantContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "type" "ContactType" NOT NULL,
    "valueNormalized" TEXT NOT NULL,
    "applicantId" UUID,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicantSession" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "applicantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "applicantId" UUID NOT NULL,
    "schoolGroupId" UUID NOT NULL,
    "studentFirstName" TEXT NOT NULL,
    "studentLastName" TEXT NOT NULL,
    "studentNormalizedName" TEXT NOT NULL,
    "relationship" "Relationship" NOT NULL,
    "consentTextVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "accessGrantedAt" TIMESTAMP(3),
    "idempotencyKey" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicantContact_applicantId_idx" ON "ApplicantContact"("applicantId");

-- CreateIndex
CREATE INDEX "ApplicantContact_type_valueNormalized_idx" ON "ApplicantContact"("type", "valueNormalized");

-- CreateIndex
CREATE INDEX "OtpChallenge_type_valueNormalized_createdAt_idx" ON "OtpChallenge"("type", "valueNormalized", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicantSession_tokenHash_key" ON "ApplicantSession"("tokenHash");

-- CreateIndex
CREATE INDEX "ApplicantSession_applicantId_idx" ON "ApplicantSession"("applicantId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_idempotencyKey_key" ON "Enrollment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Enrollment_schoolGroupId_status_idx" ON "Enrollment"("schoolGroupId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_applicantId_schoolGroupId_studentNormalizedName_key" ON "Enrollment"("applicantId", "schoolGroupId", "studentNormalizedName");

-- AddForeignKey
ALTER TABLE "ApplicantContact" ADD CONSTRAINT "ApplicantContact_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicantSession" ADD CONSTRAINT "ApplicantSession_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "Applicant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolGroupId_fkey" FOREIGN KEY ("schoolGroupId") REFERENCES "SchoolGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written (ADR-06). A verified contact belongs to exactly one applicant (T1/T8).
CREATE UNIQUE INDEX "ApplicantContact_verified_value_key"
  ON "ApplicantContact" (type, "valueNormalized") WHERE "verifiedAt" IS NOT NULL;

ALTER TABLE "ApplicantContact"
  ADD CONSTRAINT "ApplicantContact_email_normalized_check"
    CHECK (type <> 'EMAIL' OR "valueNormalized" = lower(btrim("valueNormalized"))),
  ADD CONSTRAINT "ApplicantContact_phone_e164_check"
    CHECK (type <> 'PHONE' OR "valueNormalized" ~ '^\+[1-9][0-9]{6,14}$');

ALTER TABLE "OtpChallenge"
  ADD CONSTRAINT "OtpChallenge_attempts_check" CHECK (attempts BETWEEN 0 AND 5);

ALTER TABLE "Enrollment"
  ADD CONSTRAINT "Enrollment_studentNormalizedName_format_check"
    CHECK ("studentNormalizedName" ~ '^[a-z0-9]+( [a-z0-9]+)*$');
