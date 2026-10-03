import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type LoginRequest,
  loginRequestSchema,
  STAFF_SESSION_COOKIE,
  type StaffUser,
} from '@travel-rock/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { toStaffUserDto } from '../staff-users/staff-user.mapper.js';
import type { AuthenticatedStaff } from './authenticated-staff.js';
import { AllowPendingPasswordChange, CurrentStaff, Public } from './decorators.js';
import {
  clearSessionCookieOptions,
  readSessionToken,
  sessionCookieOptions,
} from './session-cookie.js';
import { StaffAuthService } from './staff-auth.service.js';
import { StaffSessionsService } from './staff-sessions.service.js';

@Controller('admin/auth')
export class StaffAuthController {
  constructor(
    private readonly auth: StaffAuthService,
    private readonly sessions: StaffSessionsService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StaffUser> {
    const { token, user } = await this.auth.login(body, {
      ip: request.ip ?? 'unknown',
      previousToken: readSessionToken(request),
    });
    response.cookie(STAFF_SESSION_COOKIE, token, sessionCookieOptions);
    return toStaffUserDto(user);
  }

  @AllowPendingPasswordChange()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.revokeSession(staff.sessionId);
    response.clearCookie(STAFF_SESSION_COOKIE, clearSessionCookieOptions);
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentStaff() staff: AuthenticatedStaff): StaffUser {
    return toStaffUserDto(staff.user);
  }

  @AllowPendingPasswordChange()
  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentStaff() staff: AuthenticatedStaff,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.changePassword(staff, body, { ip: request.ip ?? 'unknown' });
  }
}
