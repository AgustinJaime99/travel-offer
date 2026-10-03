import { Module } from '@nestjs/common';
import { RateLimiter } from '../common/rate-limiter.js';
import { ApplicantAuthGuard } from './applicant-auth.js';
import { ApplicantSessionsService } from './applicant-sessions.service.js';
import { PublicIdentityController } from './public-identity.controller.js';
import { PublicIdentityService } from './public-identity.service.js';

@Module({
  controllers: [PublicIdentityController],
  providers: [
    ApplicantSessionsService,
    ApplicantAuthGuard,
    PublicIdentityService,
    // One in-memory limiter for every public endpoint (single API instance, ADR-09).
    { provide: RateLimiter, useFactory: () => new RateLimiter() },
  ],
  exports: [ApplicantSessionsService, ApplicantAuthGuard, RateLimiter],
})
export class PublicIdentityModule {}
