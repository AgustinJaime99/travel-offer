import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoginAttemptLimiter } from './login-attempt-limiter.js';
import { StaffAuthController } from './staff-auth.controller.js';
import { StaffAuthGuard } from './staff-auth.guard.js';
import { StaffAuthService } from './staff-auth.service.js';
import { StaffSessionsService } from './staff-sessions.service.js';

@Module({
  controllers: [StaffAuthController],
  providers: [
    StaffSessionsService,
    StaffAuthService,
    { provide: LoginAttemptLimiter, useFactory: () => new LoginAttemptLimiter() },
    { provide: APP_GUARD, useClass: StaffAuthGuard },
  ],
  exports: [StaffSessionsService],
})
export class StaffAuthModule {}
