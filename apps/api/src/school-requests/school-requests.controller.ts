import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  type AdminSchoolRequest,
  CATALOG_EDITOR_ROLES,
  type Paginated,
  SCHOOL_REQUEST_CONFIRMATION,
  type SchoolRequestInput,
  type SchoolRequestListQuery,
  schoolRequestListQuerySchema,
  schoolRequestSchema,
  type UpdateRequestReview,
  updateRequestReviewSchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ApplicantAuthGuard, CurrentApplicant } from '../public-identity/applicant-auth.js';
import type { AuthenticatedApplicant } from '../public-identity/applicant-sessions.service.js';
import type { AuthenticatedStaff } from '../staff-auth/authenticated-staff.js';
import { CurrentStaff, Public, Roles } from '../staff-auth/decorators.js';
import { SchoolRequestsService } from './school-requests.service.js';

/** Verified families report a school or group they cannot find. */
@Public()
@UseGuards(ApplicantAuthGuard)
@Controller('public/school-requests')
export class PublicSchoolRequestsController {
  constructor(private readonly requests: SchoolRequestsService) {}

  @Post()
  @HttpCode(202)
  async submit(
    @CurrentApplicant() applicant: AuthenticatedApplicant,
    @Body(new ZodValidationPipe(schoolRequestSchema)) body: SchoolRequestInput,
  ): Promise<{ message: typeof SCHOOL_REQUEST_CONFIRMATION }> {
    await this.requests.submit(applicant, body);
    return { message: SCHOOL_REQUEST_CONFIRMATION };
  }
}

/** Staff triage queue. Read: every staff role (without contact data for VIEWER). Review: ADMIN, COMMERCIAL. */
@Controller('admin/school-requests')
export class AdminSchoolRequestsController {
  constructor(private readonly requests: SchoolRequestsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(schoolRequestListQuerySchema)) query: SchoolRequestListQuery,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<Paginated<AdminSchoolRequest>> {
    return this.requests.list(query, staff.user.role);
  }

  @Get(':id')
  get(
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<AdminSchoolRequest> {
    return this.requests.get(id, staff.user.role);
  }

  @Patch(':id')
  @Roles(...CATALOG_EDITOR_ROLES)
  review(
    @Param('id', new ZodValidationPipe(z.uuid())) id: string,
    @Body(new ZodValidationPipe(updateRequestReviewSchema)) body: UpdateRequestReview,
    @CurrentStaff() staff: AuthenticatedStaff,
  ): Promise<AdminSchoolRequest> {
    return this.requests.review(id, body, staff);
  }
}
