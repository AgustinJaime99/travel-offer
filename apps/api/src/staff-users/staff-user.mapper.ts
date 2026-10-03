import type { StaffUser } from '@travel-rock/shared';
import type { StaffUser as StaffUserRecord } from '../generated/prisma/client.js';

/** Explicit mapping: never serialize passwordHash or other internal columns. */
export function toStaffUserDto(user: StaffUserRecord): StaffUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt.toISOString(),
  };
}
