import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { ApiExceptionFilter } from './api-exception.filter.js';

function respond(exception: unknown) {
  const sent: { status?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as ArgumentsHost;
  new ApiExceptionFilter().catch(exception, host);
  return sent;
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('secret query detail', { code, clientVersion: 'test' });

describe('ApiExceptionFilter', () => {
  it('maps unhandled database errors caused by the request to 4xx, without internals', () => {
    expect(respond(prismaError('P2025'))).toMatchObject({
      status: 404,
      body: { code: 'NOT_FOUND' },
    });
    expect(respond(prismaError('P2002'))).toMatchObject({
      status: 409,
      body: { code: 'CONFLICT' },
    });
    expect(respond(prismaError('P2034'))).toMatchObject({
      status: 409,
      body: { code: 'CONFLICT' },
    });
    expect(respond(prismaError('P2000'))).toMatchObject({
      status: 400,
      body: { code: 'VALIDATION_FAILED' },
    });
    expect(JSON.stringify(respond(prismaError('P2002')).body)).not.toContain('secret');
  });

  it('anything else is a generic 500', () => {
    expect(respond(prismaError('P1001'))).toEqual({
      status: 500,
      body: { statusCode: 500, code: 'INTERNAL', message: 'Ocurrió un error inesperado.' },
    });
    expect(respond(new Error('boom'))).toMatchObject({ status: 500, body: { code: 'INTERNAL' } });
  });
});
