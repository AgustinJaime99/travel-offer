-- DropIndex
DROP INDEX "OtpChallenge_type_valueNormalized_createdAt_idx";

-- CreateIndex
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

-- CreateIndex
CREATE INDEX "SchoolRequest_status_createdAt_idx" ON "SchoolRequest"("status", "createdAt");
