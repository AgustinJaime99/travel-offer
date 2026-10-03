-- Hand-written migration (ADR-06): emails are stored normalized so the unique index is case-insensitive in practice.
ALTER TABLE "StaffUser"
  ADD CONSTRAINT "StaffUser_email_normalized_check" CHECK ("email" = lower(btrim("email")));
