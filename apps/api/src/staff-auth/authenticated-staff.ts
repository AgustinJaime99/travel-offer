import type { Request } from 'express';
import type { StaffUser as StaffUserRecord } from '../generated/prisma/client.js';

export interface AuthenticatedStaff {
  sessionId: string;
  user: StaffUserRecord;
}

export interface StaffRequest extends Request {
  staff?: AuthenticatedStaff;
}
