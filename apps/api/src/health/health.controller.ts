import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { HealthResponse } from '@travel-rock/shared';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../staff-auth/decorators.js';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      // Error name only: driver messages can include connection details.
      this.logger.warn(`Database health check failed (${(error as Error).name})`);
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'degraded', database: 'down' };
    }
  }
}
