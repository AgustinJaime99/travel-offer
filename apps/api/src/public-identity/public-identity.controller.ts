import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type Applicant,
  APPLICANT_SESSION_COOKIE,
  type ContactInput,
  contactInputSchema,
  contactVerifyRequestSchema,
  type OtpVerifyRequest,
  otpRequestSchema,
  otpVerifyRequestSchema,
} from '@travel-rock/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Public } from '../staff-auth/decorators.js';
import {
  ApplicantAuthGuard,
  applicantCookieOptions,
  clearApplicantCookieOptions,
  CurrentApplicant,
} from './applicant-auth.js';
import {
  ApplicantSessionsService,
  type AuthenticatedApplicant,
} from './applicant-sessions.service.js';
import { PublicIdentityService } from './public-identity.service.js';

const clientIp = (request: Request) => request.ip ?? 'unknown';

/** Public, passwordless identity (T1, F-e): email + one-time code. No staff session involved. */
@Public()
@Controller('public')
export class PublicIdentityController {
  constructor(
    private readonly identity: PublicIdentityService,
    private readonly sessions: ApplicantSessionsService,
  ) {}

  @Post('auth/otp/request')
  @HttpCode(202)
  async requestCode(
    @Body(new ZodValidationPipe(otpRequestSchema)) body: ContactInput,
    @Req() request: Request,
  ): Promise<{ challengeId: string }> {
    return { challengeId: await this.identity.requestCode(body, clientIp(request)) };
  }

  @Post('auth/otp/verify')
  @HttpCode(200)
  async verify(
    @Body(new ZodValidationPipe(otpVerifyRequestSchema)) body: OtpVerifyRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Applicant> {
    const { token } = await this.identity.signIn(body, clientIp(request));
    response.cookie(APPLICANT_SESSION_COOKIE, token, applicantCookieOptions);
    const session = await this.sessions.resolve(token);
    return this.identity.profile(session!);
  }

  @Post('auth/logout')
  @HttpCode(204)
  @UseGuards(ApplicantAuthGuard)
  async logout(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.identity.signOut(applicant);
    response.clearCookie(APPLICANT_SESSION_COOKIE, clearApplicantCookieOptions);
  }

  @Get('me')
  @UseGuards(ApplicantAuthGuard)
  me(@CurrentApplicant() applicant: AuthenticatedApplicant): Promise<Applicant> {
    return this.identity.profile(applicant);
  }

  /** Step 1 of changing/adding an email: a code is sent to the new address. */
  @Post('me/contacts')
  @HttpCode(202)
  @UseGuards(ApplicantAuthGuard)
  async addContact(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Body(new ZodValidationPipe(contactInputSchema)) body: ContactInput,
    @Req() request: Request,
  ): Promise<{ challengeId: string }> {
    return {
      challengeId: await this.identity.requestCode(body, clientIp(request), applicant.applicant.id),
    };
  }

  /** Step 2: the new address is added once its code is verified. */
  @Post('me/contacts/verify')
  @UseGuards(ApplicantAuthGuard)
  async verifyContact(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Body(new ZodValidationPipe(contactVerifyRequestSchema))
    body: { challengeId: string; code: string },
    @Req() request: Request,
  ): Promise<Applicant> {
    await this.identity.addContact(applicant, body, clientIp(request));
    return this.identity.profile(applicant);
  }

  @Delete('me/contacts/:id')
  @UseGuards(ApplicantAuthGuard)
  async removeContact(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
  ): Promise<Applicant> {
    await this.identity.removeContact(applicant, id);
    return this.identity.profile(applicant);
  }
}
