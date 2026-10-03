import { Controller, Get, Query } from '@nestjs/common';
import {
  type DashboardAnalytics,
  type DashboardAnalyticsQuery,
  dashboardAnalyticsQuerySchema,
  type DashboardQuery,
  dashboardQuerySchema,
  type DashboardSummary,
} from '@travel-rock/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardAnalyticsService } from './dashboard-analytics.service.js';

/** Every staff role (counts only, no personal data). */
@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly analyticsService: DashboardAnalyticsService,
  ) {}

  @Get('summary')
  summary(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardSummary> {
    return this.dashboard.summary(query);
  }

  /** Aggregates only (counts, distributions, price statistics); no personal data. */
  @Get('analytics')
  analytics(
    @Query(new ZodValidationPipe(dashboardAnalyticsQuerySchema)) query: DashboardAnalyticsQuery,
  ): Promise<DashboardAnalytics> {
    return this.analyticsService.analytics(query);
  }
}
