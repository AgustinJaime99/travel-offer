import { type ApiError, apiErrorSchema } from '@travel-rock/shared';
import type { z } from 'zod';

const REQUEST_TIMEOUT_MS = 20_000;

/** Error returned by the API, carrying its stable error code when the body is a valid ApiError. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.message ?? `HTTP ${status}`);
  }

  get code(): ApiError['code'] | undefined {
    return this.body?.code;
  }
}

/** A successful response whose body does not match the shared contract. */
export class UnexpectedResponseError extends Error {
  constructor() {
    super('Unexpected API response');
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError';
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
}

async function send(path: string, { method = 'GET', body }: RequestOptions): Promise<Response> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (typeof AbortSignal.timeout === 'function')
    init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
    throw new ApiRequestError(response.status, parsed.success ? parsed.data : null);
  }
  return response;
}

/** Browser call to the same-origin API; the response is validated with the shared schema. */
export async function apiFetch<T extends z.ZodType>(
  path: string,
  schema: T,
  options: RequestOptions = {},
): Promise<z.infer<T>> {
  const response = await send(path, options);
  let data: unknown;
  try {
    data = await response.json();
  } catch (caught) {
    if (isTimeout(caught)) throw caught;
    throw new UnexpectedResponseError();
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new UnexpectedResponseError();
  return parsed.data;
}

/** Browser call whose response has no body (204). */
export async function apiCall(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.body?.message ?? 'No se pudo completar la operación.';
  }
  if (error instanceof UnexpectedResponseError) {
    return 'Respuesta inesperada del servidor. Probá de nuevo.';
  }
  if (isTimeout(error)) {
    return 'El servidor tardó demasiado en responder. Probá de nuevo.';
  }
  return 'No se pudo conectar con el servidor. Probá de nuevo.';
}
