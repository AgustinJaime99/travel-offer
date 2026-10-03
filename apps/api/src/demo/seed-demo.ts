import type { INestApplicationContext } from '@nestjs/common';
import {
  createSchoolGroupRequestSchema,
  createSchoolRequestSchema,
  createServiceRequestSchema,
  PRIVACY_NOTICE_VERSION,
  type StaffRole,
  schoolRequestSchema,
  travelYearRange,
  updateProposalDraftRequestSchema,
} from '@travel-rock/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { ProposalsService } from '../proposals/proposals.service.js';
import { SchoolGroupsService } from '../school-groups/school-groups.service.js';
import { SchoolRequestsService } from '../school-requests/school-requests.service.js';
import { SchoolsService } from '../schools/schools.service.js';
import { ServicesService } from '../services/services.service.js';
import { hashPassword } from '../staff-auth/password.js';

/** Development-only accounts (documented in the README). Never use these outside a local demo. */
export const DEMO_STAFF: readonly {
  email: string;
  fullName: string;
  role: StaffRole;
  password: string;
}[] = [
  {
    email: 'admin@demo.travelrock.local',
    fullName: 'Ana Admin (demo)',
    role: 'ADMIN',
    password: 'demo-admin-travelrock',
  },
  {
    email: 'comercial@demo.travelrock.local',
    fullName: 'Carlos Comercial (demo)',
    role: 'COMMERCIAL',
    password: 'demo-comercial-travelrock',
  },
  {
    email: 'lectura@demo.travelrock.local',
    fullName: 'Lucía Lectura (demo)',
    role: 'VIEWER',
    password: 'demo-lectura-travelrock',
  },
];
export const DEMO_FAMILY_EMAIL = 'familia.demo@example.com';

export interface DemoSeedResult {
  travelYear: number;
  offer: { school: string; group: string; accessCode: string; proposalId: string };
  preparing: { school: string; group: string; accessCode: string };
  requestSchoolName: string;
}

/** Tables the demo writes to: it only runs on a database without staff or catalog data. */
export async function isEmptyForDemo(prisma: PrismaService): Promise<boolean> {
  const [staff, schools, services] = await Promise.all([
    prisma.staffUser.count(),
    prisma.school.count(),
    prisma.service.count(),
  ]);
  return staff + schools + services === 0;
}

/**
 * Demo data built through the real application services, so pricing, snapshots, access codes and
 * request dedup behave exactly as in the UI: one school with a published offer (DOMAIN.md worked
 * example), one school whose group has a code but no offer yet, and one pending school request.
 */
export async function seedDemo(app: INestApplicationContext): Promise<DemoSeedResult> {
  const prisma = app.get(PrismaService);
  if (!(await isEmptyForDemo(prisma))) {
    throw new Error('The demo seed needs a database without staff users, schools or services.');
  }

  const staff = [];
  for (const user of DEMO_STAFF) {
    staff.push(
      await prisma.staffUser.create({
        data: {
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          mustChangePassword: false,
          passwordHash: await hashPassword(user.password),
        },
      }),
    );
  }
  const commercial = { sessionId: 'demo-seed', user: staff[1]! };
  const travelYear = travelYearRange().min + 2;

  const services = app.get(ServicesService);
  const items = [];
  for (const [name, category, basePriceMinor] of [
    ['Bus semicama ida y vuelta', 'TRANSPORT', '110000000'],
    ['Hotel 3 estrellas, 7 noches', 'LODGING', '150000000'],
    ['Excursiones y entradas', 'EXCURSIONS', '50000000'],
  ] as const) {
    const service = await services.create(
      createServiceRequestSchema.parse({ name, category, basePriceMinor }),
    );
    items.push({ serviceId: service.id, quantity: 1 });
  }

  const schools = app.get(SchoolsService);
  const groups = app.get(SchoolGroupsService);
  const proposals = app.get(ProposalsService);

  const offerSchool = await schools.create(
    createSchoolRequestSchema.parse({
      name: 'Colegio Demo San Martín',
      province: 'CORDOBA',
      city: 'Villa María',
    }),
  );
  const offerGroup = await groups.create(
    createSchoolGroupRequestSchema.parse({
      schoolId: offerSchool.id,
      name: '5° A',
      travelYear,
      estimatedStudents: 32,
    }),
  );
  const offerCode = (await groups.rotateAccessCode(offerGroup.id)).accessCode;
  const draft = await proposals.createDraft(offerGroup.id, commercial);
  await proposals.replaceDraft(
    draft.id,
    updateProposalDraftRequestSchema.parse({
      items,
      commercialDiscountMinor: '10000000',
      downPaymentMinor: '60000000',
      installments: 18,
      tnaBps: 3500,
      validUntil: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    }),
  );
  await proposals.publish(draft.id, commercial);

  const preparingSchool = await schools.create(
    createSchoolRequestSchema.parse({
      name: 'Escuela Demo Belgrano',
      province: 'MENDOZA',
      city: 'Godoy Cruz',
    }),
  );
  const preparingGroup = await groups.create(
    createSchoolGroupRequestSchema.parse({
      schoolId: preparingSchool.id,
      name: '5° B',
      travelYear,
    }),
  );
  const preparingCode = (await groups.rotateAccessCode(preparingGroup.id)).accessCode;

  // A family that could not find its school (signs in as DEMO_FAMILY_EMAIL with a code from Mailpit).
  const applicant = await prisma.applicant.create({
    data: {
      fullName: 'Familia Demo',
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyAcceptedAt: new Date(),
      contacts: {
        create: { type: 'EMAIL', valueNormalized: DEMO_FAMILY_EMAIL, verifiedAt: new Date() },
      },
    },
  });
  const requestSchoolName = 'Instituto Demo Güemes';
  await app.get(SchoolRequestsService).submit(
    { sessionId: 'demo-seed', applicant },
    schoolRequestSchema.parse({
      type: 'SCHOOL_NOT_FOUND',
      schoolName: requestSchoolName,
      province: 'SALTA',
      city: 'Salta',
      course: '5° C',
      travelYear,
    }),
  );

  return {
    travelYear,
    offer: {
      school: offerSchool.name,
      group: offerGroup.name,
      accessCode: offerCode,
      proposalId: draft.id,
    },
    preparing: {
      school: preparingSchool.name,
      group: preparingGroup.name,
      accessCode: preparingCode,
    },
    requestSchoolName,
  };
}
