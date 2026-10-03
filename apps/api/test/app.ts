import 'reflect-metadata';
import type { DynamicModule, Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';

export type TestApp = NestExpressApplication;

export async function createTestApp(
  options: {
    imports?: (Type | DynamicModule)[];
    controllers?: Type[];
    customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  } = {},
): Promise<TestApp> {
  const builder = Test.createTestingModule({
    imports: [AppModule, ...(options.imports ?? [])],
    controllers: options.controllers ?? [],
  });
  const moduleRef = await (options.customize?.(builder) ?? builder).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}
