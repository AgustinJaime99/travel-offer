import { Module } from '@nestjs/common';
import { SchoolGroupsController } from './school-groups.controller.js';
import { SchoolGroupsService } from './school-groups.service.js';

@Module({
  controllers: [SchoolGroupsController],
  providers: [SchoolGroupsService],
  exports: [SchoolGroupsService],
})
export class SchoolGroupsModule {}
