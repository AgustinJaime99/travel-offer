import { Module } from '@nestjs/common';
import { ExpiredDataPurger } from './expired-data.purger.js';

@Module({ providers: [ExpiredDataPurger] })
export class MaintenanceModule {}
