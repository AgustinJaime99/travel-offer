import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from './app.js';

let app: TestApp;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

/** Objects Prisma does not manage (ADR-06): a migration that drops one must fail here. */
describe('hand-written database objects', () => {
  it('the pg_trgm extension and trigram indexes exist', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexdef LIKE '%gin_trgm_ops%' ORDER BY 1`;
    expect(indexes.map((row) => row.indexname)).toEqual([
      'School_normalizedCity_trgm_idx',
      'School_normalizedName_trgm_idx',
      'Service_normalizedName_trgm_idx',
    ]);
  });

  it('CHECK constraints exist', async () => {
    const checks = await prisma.$queryRaw<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE contype = 'c' AND conrelid <> 0 ORDER BY 1`;
    expect(checks.map((row) => row.conname)).toEqual([
      'ApplicantContact_email_normalized_check',
      'ApplicantContact_phone_e164_check',
      'CommercialProposal_amounts_check',
      'CommercialProposal_status_consistency_check',
      'CommercialProposal_validity_check',
      'CommercialProposal_version_check',
      'Enrollment_studentNormalizedName_format_check',
      'OtpChallenge_attempts_check',
      'PaymentPlan_amounts_check',
      'PaymentPlan_installments_check',
      'PaymentPlan_passengerCount_check',
      'PaymentPlan_tnaBps_check',
      'PlanPreference_installments_check',
      'ProposalItem_amounts_check',
      'ProposalItem_position_check',
      'ProposalItem_quantity_check',
      'SchoolGroup_accessCode_consistency_check',
      'SchoolGroup_estimatedStudents_check',
      'SchoolGroup_normalizedName_format_check',
      'SchoolGroup_travelYear_check',
      'SchoolRequest_travelYear_check',
      'SchoolRequest_type_school_check',
      'School_cue_format_check',
      'School_normalized_format_check',
      'Service_basePriceMinor_check',
      'Service_normalizedName_format_check',
      'StaffUser_email_normalized_check',
    ]);
  });

  it('proposal partial unique indexes and immutability triggers exist', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'CommercialProposal' AND indexdef LIKE '%WHERE%' ORDER BY 1`;
    expect(indexes.map((row) => row.indexname)).toEqual([
      'CommercialProposal_one_draft_per_group',
      'CommercialProposal_one_published_per_group',
    ]);
    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1`;
    expect(triggers.map((row) => row.tgname)).toEqual([
      'CommercialProposal_immutable_delete',
      'CommercialProposal_immutable_update',
      'PaymentPlan_draft_only',
      'ProposalItem_draft_only',
    ]);
  });

  it('rejects malformed values even if the application did not', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO "School" (id, name, "normalizedName", province, city, "normalizedCity", cue, "updatedAt")
        VALUES (gen_random_uuid(), 'X', 'X Mayúscula', 'SALTA', 'Salta', 'salta', '123', now())`,
    ).rejects.toThrow();
  });
});
