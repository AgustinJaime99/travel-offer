import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  accessCodeRequestSchema,
  type Enrollment,
  type EnrollmentOffer,
  type EnrollmentRequest,
  enrollmentRequestSchema,
  type PlanPreferenceRequest,
  planPreferenceRequestSchema,
} from '@travel-rock/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApplicantAuthGuard, CurrentApplicant } from '../public-identity/applicant-auth.js';
import type { AuthenticatedApplicant } from '../public-identity/applicant-sessions.service.js';
import { Public } from '../staff-auth/decorators.js';
import { EnrollmentsService } from './enrollments.service.js';

const enrollmentIdPipe = new ZodValidationPipe(z.uuid());
const clientIp = (request: Request) => request.ip ?? 'unknown';

@Public()
@UseGuards(ApplicantAuthGuard)
@Controller('public/enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  /** 201 when created; 200 for an idempotent retry or a student already registered in the group. */
  @Post()
  async submit(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Body(new ZodValidationPipe(enrollmentRequestSchema)) body: EnrollmentRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ enrollment: Enrollment; alreadyRegistered: boolean }> {
    const result = await this.enrollments.submit(applicant, body, clientIp(request));
    response.status(result.created ? 201 : 200);
    return { enrollment: result.enrollment, alreadyRegistered: result.alreadyRegistered };
  }

  @Get()
  async list(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
  ): Promise<{ items: Enrollment[] }> {
    return { items: await this.enrollments.listOwn(applicant) };
  }

  @Post(':id/access-code')
  @HttpCode(200)
  enterAccessCode(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Param('id', enrollmentIdPipe) id: string,
    @Body(new ZodValidationPipe(accessCodeRequestSchema)) body: { code: string },
    @Req() request: Request,
  ): Promise<Enrollment> {
    return this.enrollments.enterAccessCode(applicant, id, body.code, clientIp(request));
  }

  @Get(':id/proposal')
  offer(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Param('id', enrollmentIdPipe) id: string,
  ): Promise<EnrollmentOffer> {
    return this.enrollments.offer(applicant, id);
  }

  @Put(':id/preference')
  setPreference(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Param('id', enrollmentIdPipe) id: string,
    @Body(new ZodValidationPipe(planPreferenceRequestSchema)) body: PlanPreferenceRequest,
  ): Promise<{ installments: number }> {
    return this.enrollments.setPreference(applicant, id, body);
  }
}
