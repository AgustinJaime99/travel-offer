import { Inject, Injectable } from '@nestjs/common';
import {
  type Enrollment,
  type EnrollmentOffer,
  type EnrollmentRequest,
  type PlanPreferenceRequest,
  normalizeAccessCode,
  normalizeText,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedApplicant } from '../public-identity/applicant-sessions.service.js';
import { getDummyPasswordHash, verifyPassword } from '../staff-auth/password.js';
import {
  eligiblePublicationWhere,
  offerState,
  preferableInstallments,
  publicationInclude,
  toPublicProposal,
} from './offers.js';

const SUBMISSIONS_PER_APPLICANT = { limit: 20, windowMs: 60 * 60_000 };
// ARCHITECTURE.md → access code 5/15 min per applicant (+ a per-IP ceiling across accounts).
const CODE_ATTEMPTS_PER_APPLICANT = { limit: 5, windowMs: 15 * 60_000 };
const CODE_ATTEMPTS_PER_IP = { limit: 20, windowMs: 15 * 60_000 };
const PREFERENCES_PER_APPLICANT = { limit: 30, windowMs: 15 * 60_000 };

export const enrollmentInclude = {
  schoolGroup: {
    select: {
      name: true,
      travelYear: true,
      accessCodeHash: true,
      school: { select: { name: true, city: true, province: true } },
    },
  },
} satisfies Prisma.EnrollmentInclude;
type EnrollmentRecord = Prisma.EnrollmentGetPayload<{ include: typeof enrollmentInclude }>;

const invalid = (path: string, message: string) =>
  new ApiException(400, 'VALIDATION_FAILED', 'Revisá los datos ingresados.', [{ path, message }]);
/** Same answer whether the code is wrong or the group has no code: nothing is revealed. */
const invalidAccessCode = () =>
  new ApiException(
    400,
    'INVALID_ACCESS_CODE',
    'El código no es válido para este grupo. Revisalo con tu asesor.',
    [
      {
        path: 'accessCode',
        message: 'El código no es válido para este grupo. Revisalo con tu asesor.',
      },
    ],
  );
const notFound = () => new ApiException(404, 'NOT_FOUND', 'No encontramos esa inscripción.');

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
  ) {}

  /**
   * Atomic, idempotent expression of interest (no contract, no payment). Retrying with the same key
   * returns the same enrollment; the same student in the same group is never registered twice.
   * An optional access code is checked first: a wrong code creates nothing.
   */
  async submit(
    applicant: AuthenticatedApplicant,
    input: EnrollmentRequest,
    ip: string,
  ): Promise<{ enrollment: Enrollment; created: boolean; alreadyRegistered: boolean }> {
    const applicantId = applicant.applicant.id;
    const replay = await this.prisma.enrollment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: enrollmentInclude,
    });
    if (replay) {
      if (replay.applicantId !== applicantId)
        throw invalid('idempotencyKey', 'Clave de envío inválida.');
      return { enrollment: await this.toDto(replay), created: false, alreadyRegistered: false };
    }
    if (
      !this.limiter.tryConsume([
        { key: `enrollments:${applicantId}`, ...SUBMISSIONS_PER_APPLICANT },
      ])
    ) {
      throw new ApiException(429, 'RATE_LIMITED', 'Demasiados envíos. Probá más tarde.');
    }

    // Server-side association check: the group must belong to the chosen school and both be active.
    const group = await this.prisma.schoolGroup.findUnique({
      where: { id: input.schoolGroupId },
      select: {
        schoolId: true,
        status: true,
        accessCodeHash: true,
        school: { select: { active: true } },
      },
    });
    if (!group || group.schoolId !== input.schoolId) {
      throw invalid('schoolGroupId', 'El grupo no corresponde al colegio elegido.');
    }
    if (group.status !== 'ACTIVE' || !group.school.active) {
      throw invalid('schoolGroupId', 'Ese grupo no está disponible. Elegí otro.');
    }
    if (input.accessCode !== undefined)
      await this.checkAccessCode(applicantId, ip, group.accessCodeHash, input.accessCode);
    const accessGrantedAt = input.accessCode !== undefined ? new Date() : null;

    const studentNormalizedName = normalizeText(
      `${input.studentFirstName} ${input.studentLastName}`,
    );
    const findSameStudent = () =>
      this.prisma.enrollment.findUnique({
        where: {
          applicantId_schoolGroupId_studentNormalizedName: {
            applicantId,
            schoolGroupId: input.schoolGroupId,
            studentNormalizedName,
          },
        },
        include: enrollmentInclude,
      });
    const sameStudent = await findSameStudent();
    if (sameStudent) {
      const updated = accessGrantedAt ? await this.grant(sameStudent.id) : sameStudent;
      return { enrollment: await this.toDto(updated), created: false, alreadyRegistered: true };
    }

    try {
      const enrollment = await this.prisma.enrollment.create({
        data: {
          applicantId,
          schoolGroupId: input.schoolGroupId,
          studentFirstName: input.studentFirstName,
          studentLastName: input.studentLastName,
          studentNormalizedName,
          relationship: input.relationship,
          consentTextVersion: input.consentTextVersion,
          consentedAt: new Date(),
          accessGrantedAt,
          idempotencyKey: input.idempotencyKey,
        },
        include: enrollmentInclude,
      });
      return { enrollment: await this.toDto(enrollment), created: true, alreadyRegistered: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
      // A concurrent retry won the race: answer with what it stored.
      const stored =
        (await this.prisma.enrollment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          include: enrollmentInclude,
        })) ?? (await findSameStudent());
      if (!stored || stored.applicantId !== applicantId) throw error;
      // This request checked a valid code: it must not be lost to the request that won the race.
      const answer =
        accessGrantedAt && !stored.accessGrantedAt ? await this.grant(stored.id) : stored;
      return {
        enrollment: await this.toDto(answer),
        created: false,
        alreadyRegistered: stored.idempotencyKey !== input.idempotencyKey,
      };
    }
  }

  async listOwn(applicant: AuthenticatedApplicant): Promise<Enrollment[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { applicantId: applicant.applicant.id },
      include: enrollmentInclude,
      orderBy: { createdAt: 'desc' },
    });
    const eligible = new Set(
      (
        await this.prisma.commercialProposal.findMany({
          where: {
            ...eligiblePublicationWhere(new Date()),
            schoolGroupId: { in: enrollments.map((e) => e.schoolGroupId) },
          },
          select: { schoolGroupId: true },
        })
      ).map((proposal) => proposal.schoolGroupId),
    );
    return enrollments.map((enrollment) =>
      this.mapEnrollment(enrollment, eligible.has(enrollment.schoolGroupId)),
    );
  }

  /** Grants access to the group's offers with the code the advisor shared (rate-limited). */
  async enterAccessCode(
    applicant: AuthenticatedApplicant,
    enrollmentId: string,
    code: string,
    ip: string,
  ): Promise<Enrollment> {
    const enrollment = await this.findOwn(applicant, enrollmentId);
    if (!enrollment.accessGrantedAt) {
      await this.checkAccessCode(
        applicant.applicant.id,
        ip,
        enrollment.schoolGroup.accessCodeHash,
        code,
      );
      return this.toDto(await this.grant(enrollment.id));
    }
    return this.toDto(enrollment);
  }

  /**
   * The group's current eligible publication, for an enrollment of this applicant with access.
   * Always the current version; every version shown is recorded in ProposalView.
   */
  async offer(applicant: AuthenticatedApplicant, enrollmentId: string): Promise<EnrollmentOffer> {
    const enrollment = await this.findOwn(applicant, enrollmentId);
    if (!enrollment.accessGrantedAt) return { state: 'CODE_REQUIRED' };
    const publication = await this.prisma.commercialProposal.findFirst({
      where: { ...eligiblePublicationWhere(new Date()), schoolGroupId: enrollment.schoolGroupId },
      include: publicationInclude,
    });
    if (!publication) return { state: 'PREPARING' };
    await this.prisma.proposalView.createMany({
      data: [{ enrollmentId: enrollment.id, proposalId: publication.id }],
      skipDuplicates: true,
    });
    const preference = await this.prisma.planPreference.findUnique({
      where: { enrollmentId: enrollment.id },
    });
    return {
      state: 'AVAILABLE',
      proposal: toPublicProposal(publication),
      // A preference for an older version does not carry over to a new one.
      preferredInstallments:
        preference?.proposalId === publication.id ? preference.installments : null,
    };
  }

  /**
   * "Me interesa esta opción" for the version the family is seeing: contado (0) or one of its
   * installment options. An expression of interest only, never an acceptance or a commitment.
   */
  async setPreference(
    applicant: AuthenticatedApplicant,
    enrollmentId: string,
    input: PlanPreferenceRequest,
  ): Promise<{ installments: number }> {
    const allowed = this.limiter.tryConsume([
      { key: `plan-preference:${applicant.applicant.id}`, ...PREFERENCES_PER_APPLICANT },
    ]);
    if (!allowed)
      throw new ApiException(
        429,
        'RATE_LIMITED',
        'Hiciste muchos intentos. Esperá unos minutos y probá de nuevo.',
      );
    const enrollment = await this.findOwn(applicant, enrollmentId);
    const publication = enrollment.accessGrantedAt
      ? await this.prisma.commercialProposal.findFirst({
          where: {
            ...eligiblePublicationWhere(new Date()),
            schoolGroupId: enrollment.schoolGroupId,
          },
          include: publicationInclude,
        })
      : null;
    if (!publication) {
      throw new ApiException(
        409,
        'OFFER_NOT_AVAILABLE',
        'La propuesta no está disponible. Recargá la página.',
      );
    }
    if (!preferableInstallments(publication).includes(input.installments)) {
      throw invalid('installments', 'Elegí una de las opciones de la propuesta.');
    }
    await this.prisma.planPreference.upsert({
      where: { enrollmentId: enrollment.id },
      create: {
        enrollmentId: enrollment.id,
        proposalId: publication.id,
        installments: input.installments,
      },
      update: { proposalId: publication.id, installments: input.installments },
    });
    return { installments: input.installments };
  }

  /** Other applicants' enrollments are "not found": their existence is not revealed. */
  private async findOwn(
    applicant: AuthenticatedApplicant,
    enrollmentId: string,
  ): Promise<EnrollmentRecord> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: enrollmentInclude,
    });
    if (!enrollment || enrollment.applicantId !== applicant.applicant.id) throw notFound();
    return enrollment;
  }

  private async checkAccessCode(
    applicantId: string,
    ip: string,
    codeHash: string | null,
    code: string,
  ): Promise<void> {
    const allowed = this.limiter.tryConsume([
      { key: `access-code:${applicantId}`, ...CODE_ATTEMPTS_PER_APPLICANT },
      { key: `access-code-ip:${ip}`, ...CODE_ATTEMPTS_PER_IP },
    ]);
    if (!allowed)
      throw new ApiException(
        429,
        'RATE_LIMITED',
        'Hiciste muchos intentos. Esperá 15 minutos y probá de nuevo.',
      );
    // A group without a code costs the same hash verification: timing reveals nothing either.
    const matches = await verifyPassword(
      codeHash ?? (await getDummyPasswordHash()),
      normalizeAccessCode(code),
    );
    if (!codeHash || !matches) throw invalidAccessCode();
  }

  /** Keeps the first grant time: a later valid code (or a concurrent one) does not move it. */
  private async grant(enrollmentId: string): Promise<EnrollmentRecord> {
    await this.prisma.enrollment.updateMany({
      where: { id: enrollmentId, accessGrantedAt: null },
      data: { accessGrantedAt: new Date() },
    });
    return this.prisma.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      include: enrollmentInclude,
    });
  }

  private async toDto(enrollment: EnrollmentRecord): Promise<Enrollment> {
    const hasEligible =
      enrollment.accessGrantedAt !== null &&
      (await this.prisma.commercialProposal.count({
        where: { ...eligiblePublicationWhere(new Date()), schoolGroupId: enrollment.schoolGroupId },
      })) > 0;
    return this.mapEnrollment(enrollment, hasEligible);
  }

  private mapEnrollment(enrollment: EnrollmentRecord, hasEligiblePublication: boolean): Enrollment {
    const accessGranted = enrollment.accessGrantedAt !== null;
    return {
      id: enrollment.id,
      school: enrollment.schoolGroup.school,
      group: { name: enrollment.schoolGroup.name, travelYear: enrollment.schoolGroup.travelYear },
      studentFirstName: enrollment.studentFirstName,
      studentLastName: enrollment.studentLastName,
      relationship: enrollment.relationship,
      status: enrollment.status,
      accessGranted,
      offerState: offerState(accessGranted, hasEligiblePublication),
      createdAt: enrollment.createdAt.toISOString(),
    };
  }
}
