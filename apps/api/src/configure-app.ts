import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { originCheck } from './common/origin-check.js';
import { securityHeaders } from './common/security-headers.js';
import { ENV, type Env } from './config/env.js';

/** HTTP setup shared by main.ts and integration tests, so tests exercise the real configuration. */
export function configureApp(app: NestExpressApplication): void {
  const env = app.get<Env>(ENV);
  // Only trusted hops (the Next.js server by default) may set X-Forwarded-For; see README.
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cookieParser());
  app.use(originCheck(env.WEB_ORIGINS));
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
