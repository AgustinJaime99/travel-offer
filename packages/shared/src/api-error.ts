import { z } from 'zod';

export const apiErrorCodes = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'PASSWORD_CHANGE_REQUIRED',
  'INVALID_CREDENTIALS',
  'INVALID_CURRENT_PASSWORD',
  'PASSWORD_EQUALS_EMAIL',
  'EMAIL_TAKEN',
  'CUE_TAKEN',
  'GROUP_TAKEN',
  'SERVICE_NAME_TAKEN',
  'SCHOOL_INACTIVE',
  'GROUP_INACTIVE',
  'DRAFT_EXISTS',
  'PROPOSAL_READ_ONLY',
  'PROPOSAL_CHANGED',
  'OFFER_NOT_AVAILABLE',
  'CONFLICT',
  'REQUEST_DUPLICATE',
  'INVALID_CODE',
  'INVALID_ACCESS_CODE',
  'CONTACT_TAKEN',
  'LAST_CONTACT',
  'EMAIL_UNAVAILABLE',
  'LAST_ADMIN',
  'SELF_MODIFICATION',
  'ADMIN_EXISTS',
  'NOT_FOUND',
  'ORIGIN_NOT_ALLOWED',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export const apiErrorCodeSchema = z.enum(apiErrorCodes);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: apiErrorCodeSchema,
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
