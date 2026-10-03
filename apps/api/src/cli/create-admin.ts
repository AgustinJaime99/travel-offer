import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { staffEmailSchema, staffFullNameSchema } from '@travel-rock/shared';
import { z } from 'zod';
import { ApiException } from '../common/api-exception.js';
import { EnvModule } from '../config/env.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { StaffUsersModule } from '../staff-users/staff-users.module.js';
import { StaffUsersService } from '../staff-users/staff-users.service.js';

// Usage: pnpm staff:create-admin --email ana@example.com --name "Ana Pérez"
// Creates the first ADMIN of an empty database and prints a one-time temporary password.

@Module({ imports: [EnvModule, PrismaModule, StaffUsersModule] })
class CliModule {}

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { values } = parseArgs({
  options: { email: { type: 'string' }, name: { type: 'string' } },
});
const input = z
  .object({ email: staffEmailSchema, fullName: staffFullNameSchema })
  .safeParse({ email: values.email, fullName: values.name });

if (!input.success) {
  console.error('Usage: pnpm staff:create-admin --email <email> --name "<full name>"');
  process.exitCode = 1;
} else {
  const app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
  try {
    const { user, temporaryPassword } = await app
      .get(StaffUsersService)
      .createInitialAdmin(input.data);
    console.log(`ADMIN created: ${user.email}`);
    console.log(
      `Temporary password (shown once; must be changed at first login): ${temporaryPassword}`,
    );
  } catch (error) {
    if (!(error instanceof ApiException)) throw error;
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}
