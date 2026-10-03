// `prisma migrate dev <args>` followed by `prisma generate` (Prisma 7 no longer generates on migrate).
import { execFileSync } from 'node:child_process';

const prisma = (args) => execFileSync('prisma', args, { stdio: 'inherit' });

prisma(['migrate', 'dev', ...process.argv.slice(2)]);
prisma(['generate']);
