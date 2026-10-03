import { Module } from '@nestjs/common';
import { PublicIdentityModule } from '../public-identity/public-identity.module.js';
import { SchoolsModule } from '../schools/schools.module.js';
import { PublicCatalogController } from './public-catalog.controller.js';

@Module({
  imports: [PublicIdentityModule, SchoolsModule],
  controllers: [PublicCatalogController],
})
export class PublicCatalogModule {}
