import { Module } from '@nestjs/common';
import { StaffAuthModule } from '../staff-auth/staff-auth.module.js';
import { StaffUsersController } from './staff-users.controller.js';
import { StaffUsersService } from './staff-users.service.js';

@Module({
  imports: [StaffAuthModule],
  controllers: [StaffUsersController],
  providers: [StaffUsersService],
  exports: [StaffUsersService],
})
export class StaffUsersModule {}
