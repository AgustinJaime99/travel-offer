import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { DashboardAnalyticsService } from './dashboard-analytics.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, DashboardAnalyticsService],
})
export class DashboardModule {}
