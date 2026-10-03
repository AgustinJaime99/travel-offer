import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { EnvModule } from './config/env.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { EnrollmentsModule } from './enrollments/enrollments.module.js';
import { HealthModule } from './health/health.module.js';
import { MailModule } from './mail/mail.module.js';
import { MaintenanceModule } from './maintenance/maintenance.module.js';
import { PricingModule } from './pricing/pricing.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProposalsModule } from './proposals/proposals.module.js';
import { PublicCatalogModule } from './public-catalog/public-catalog.module.js';
import { PublicIdentityModule } from './public-identity/public-identity.module.js';
import { SchoolGroupsModule } from './school-groups/school-groups.module.js';
import { SchoolRequestsModule } from './school-requests/school-requests.module.js';
import { SchoolsModule } from './schools/schools.module.js';
import { ServicesModule } from './services/services.module.js';
import { StaffAuthModule } from './staff-auth/staff-auth.module.js';
import { StaffUsersModule } from './staff-users/staff-users.module.js';

@Module({
  imports: [
    EnvModule,
    PrismaModule,
    HealthModule,
    StaffAuthModule,
    StaffUsersModule,
    SchoolsModule,
    SchoolGroupsModule,
    ServicesModule,
    PricingModule,
    ProposalsModule,
    MailModule,
    PublicIdentityModule,
    PublicCatalogModule,
    EnrollmentsModule,
    SchoolRequestsModule,
    DashboardModule,
    MaintenanceModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiExceptionFilter }],
})
export class AppModule {}
