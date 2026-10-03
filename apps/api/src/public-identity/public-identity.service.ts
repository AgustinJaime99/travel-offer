import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  type Applicant as ApplicantDto,
  type ContactInput,
  PRIVACY_NOTICE_VERSION,
} from '@travel-rock/shared';
import { ApiException } from '../common/api-exception.js';
import { RateLimiter } from '../common/rate-limiter.js';
import { ENV, type Env } from '../config/env.js';
import { type OtpChallenge, Prisma } from '../generated/prisma/client.js';
import { VerificationSender } from '../mail/verification-sender.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type AuthenticatedApplicant,
  ApplicantSessionsService,
} from './applicant-sessions.service.js';
import { hashOtpCode, otpCodeFor, OTP_MAX_ATTEMPTS, OTP_TTL_MS, otpCodeMatches } from './otp.js';

const MINUTE = 60_000;
// ARCHITECTURE.md → rate limits (initial targets).
const OTP_PER_CONTACT = { limit: 3, windowMs: 15 * MINUTE };
const OTP_PER_IP = { limit: 10, windowMs: 60 * MINUTE };
const VERIFY_PER_IP = { limit: 30, windowMs: 15 * MINUTE };

/** Same answer for wrong, expired, used or unknown codes: nothing is revealed about the contact. */
const invalidCode = () =>
  new ApiException(400, 'INVALID_CODE', 'El código es incorrecto o venció. Pedí uno nuevo.');
const rateLimited = () =>
  new ApiException(
    429,
    'RATE_LIMITED',
    'Hiciste muchos intentos. Esperá unos minutos y probá de nuevo.',
  );

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class PublicIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ApplicantSessionsService,
    private readonly sender: VerificationSender,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Creates a challenge and emails the code. The response never depends on whether the contact
   * belongs to someone (neutral), only on rate limits and on the email actually being sent.
   */
  async requestCode(
    contact: ContactInput,
    ip: string,
    applicantId: string | null = null,
  ): Promise<string> {
    const contactKey = `${contact.type}:${contact.value}`;
    const allowed = this.limiter.tryConsume([
      {
        key: `otp-cooldown:${contactKey}`,
        limit: 1,
        windowMs: this.env.OTP_RESEND_COOLDOWN_SECONDS * 1000,
      },
      { key: `otp-contact:${contactKey}`, ...OTP_PER_CONTACT },
      { key: `otp-ip:${ip}`, ...OTP_PER_IP },
    ]);
    if (!allowed) throw rateLimited();

    const code = otpCodeFor(this.env);
    const id = randomUUID(); // known before insert: the code hash is bound to it
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        id,
        type: contact.type,
        valueNormalized: contact.value,
        applicantId,
        codeHash: hashOtpCode(this.env.AUTH_HMAC_SECRET, id, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    try {
      await this.sender.sendCode(contact.value, code);
    } catch {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new ApiException(
        503,
        'EMAIL_UNAVAILABLE',
        'No pudimos enviar el código. Probá de nuevo en unos minutos.',
      );
    }
    return challenge.id;
  }

  /**
   * Passwordless sign-in / sign-up. A verified contact signs in its applicant; an unknown one creates
   * the applicant with that verified contact (needs a name and the accepted privacy notice).
   */
  async signIn(
    input: {
      challengeId: string;
      code: string;
      fullName?: string | undefined;
      privacyNoticeVersion?: string | undefined;
    },
    ip: string,
  ): Promise<{ token: string; applicantId: string }> {
    const challenge = await this.checkCode(input.challengeId, input.code, ip);
    if (challenge.applicantId) throw invalidCode(); // a code for adding a contact cannot sign in

    const existing = await this.findVerifiedContact(challenge);
    if (!existing) {
      // Only reached with a correct code: asking for the name reveals nothing to someone without it.
      const issues = [];
      if (!input.fullName)
        issues.push({ path: 'fullName', message: 'Ingresá tu nombre y apellido.' });
      if (input.privacyNoticeVersion !== PRIVACY_NOTICE_VERSION) {
        issues.push({
          path: 'privacyNoticeVersion',
          message: 'Aceptá el aviso de privacidad para continuar.',
        });
      }
      if (issues.length > 0)
        throw new ApiException(400, 'VALIDATION_FAILED', 'Revisá los datos ingresados.', issues);
    }
    await this.consume(challenge);

    let applicantId = existing?.applicantId;
    if (!applicantId) {
      try {
        const now = new Date();
        const applicant = await this.prisma.applicant.create({
          data: {
            fullName: input.fullName!,
            privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
            privacyAcceptedAt: now,
            contacts: {
              create: {
                type: challenge.type,
                valueNormalized: challenge.valueNormalized,
                verifiedAt: now,
              },
            },
          },
        });
        applicantId = applicant.id;
      } catch (error) {
        // Two sign-ups of the same contact at once: the partial unique index lets one win; join it.
        if (!isUniqueViolation(error)) throw error;
        applicantId = (await this.findVerifiedContact(challenge))!.applicantId;
      }
    }
    return { token: await this.sessions.create(applicantId), applicantId };
  }

  async addContact(
    applicant: AuthenticatedApplicant,
    input: { challengeId: string; code: string },
    ip: string,
  ): Promise<void> {
    const challenge = await this.checkCode(input.challengeId, input.code, ip);
    if (challenge.applicantId !== applicant.applicant.id) throw invalidCode();
    await this.consume(challenge);
    const owner = await this.findVerifiedContact(challenge);
    if (owner?.applicantId === applicant.applicant.id) return;
    if (owner) throw contactTaken();
    try {
      await this.prisma.applicantContact.create({
        data: {
          applicantId: applicant.applicant.id,
          type: challenge.type,
          valueNormalized: challenge.valueNormalized,
          verifiedAt: new Date(),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw contactTaken();
      throw error;
    }
  }

  /** Keeps the invariant "always at least one verified contact" under concurrency (applicant row lock). */
  async removeContact(applicant: AuthenticatedApplicant, contactId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Applicant" WHERE id = ${applicant.applicant.id}::uuid FOR UPDATE`;
      const contacts = await tx.applicantContact.findMany({
        where: { applicantId: applicant.applicant.id, verifiedAt: { not: null } },
      });
      if (!contacts.some((contact) => contact.id === contactId)) {
        throw new ApiException(404, 'NOT_FOUND', 'Contacto no encontrado.');
      }
      if (contacts.length <= 1) {
        throw new ApiException(
          409,
          'LAST_CONTACT',
          'Tenés que conservar al menos un email verificado.',
        );
      }
      await tx.applicantContact.delete({ where: { id: contactId } });
    });
  }

  async profile(applicant: AuthenticatedApplicant): Promise<ApplicantDto> {
    const contacts = await this.prisma.applicantContact.findMany({
      where: { applicantId: applicant.applicant.id },
      orderBy: { createdAt: 'asc' },
    });
    return {
      fullName: applicant.applicant.fullName,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        type: contact.type,
        value: contact.valueNormalized,
        verified: contact.verifiedAt !== null,
      })),
    };
  }

  async signOut(applicant: AuthenticatedApplicant): Promise<void> {
    await this.sessions.revoke(applicant.sessionId);
  }

  /**
   * Validates a code without consuming the challenge. Every verification takes one of its 5 attempts
   * atomically BEFORE the comparison, so concurrent guesses cannot all be checked against a stale
   * counter.
   */
  private async checkCode(challengeId: string, code: string, ip: string): Promise<OtpChallenge> {
    if (!this.limiter.tryConsume([{ key: `otp-verify-ip:${ip}`, ...VERIFY_PER_IP }]))
      throw rateLimited();
    const now = new Date();
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challengeId,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (count !== 1) throw invalidCode();
    const challenge = await this.prisma.otpChallenge.findUniqueOrThrow({
      where: { id: challengeId },
    });
    if (!otpCodeMatches(this.env.AUTH_HMAC_SECRET, challenge.id, code, challenge.codeHash)) {
      throw invalidCode();
    }
    return challenge;
  }

  /** Single use: of two concurrent verifications with the right code, only one consumes it. */
  private async consume(challenge: OtpChallenge): Promise<void> {
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) throw invalidCode();
  }

  private findVerifiedContact(challenge: OtpChallenge) {
    return this.prisma.applicantContact.findFirst({
      where: {
        type: challenge.type,
        valueNormalized: challenge.valueNormalized,
        verifiedAt: { not: null },
      },
      select: { applicantId: true },
    });
  }
}

const contactTaken = () =>
  new ApiException(409, 'CONTACT_TAKEN', 'Ese email ya está verificado en otra cuenta.');
