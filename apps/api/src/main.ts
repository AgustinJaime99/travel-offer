import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { ENV, type Env } from './config/env.js';
import { configureApp } from './configure-app.js';

// Local convenience only; variables already set in the environment take precedence.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const app = await NestFactory.create<NestExpressApplication>(AppModule);
configureApp(app);
if (app.get<Env>(ENV).OTP_FIXED_CODE) {
  // Never the code itself: logs may be shared.
  console.warn('OTP_FIXED_CODE is set: every verification code is the fixed test code.');
}
if (app.get<Env>(ENV).MAIL_DISABLED) {
  console.warn('MAIL_DISABLED is set: verification emails are not sent.');
}
await app.listen(app.get<Env>(ENV).API_PORT);
