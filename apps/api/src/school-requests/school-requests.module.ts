import { Module } from '@nestjs/common';
import { PublicIdentityModule } from '../public-identity/public-identity.module.js';
import {
  AdminSchoolRequestsController,
  PublicSchoolRequestsController,
} from './school-requests.controller.js';
import { SchoolRequestsService } from './school-requests.service.js';

@Module({
  imports: [PublicIdentityModule],
  controllers: [PublicSchoolRequestsController, AdminSchoolRequestsController],
  providers: [SchoolRequestsService],
})
export class SchoolRequestsModule {}
