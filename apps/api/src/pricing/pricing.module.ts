import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller.js';

@Module({
  controllers: [PricingController],
})
export class PricingModule {}
