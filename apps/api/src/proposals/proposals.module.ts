import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller.js';
import { ProposalsService } from './proposals.service.js';

@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService],
})
export class ProposalsModule {}
