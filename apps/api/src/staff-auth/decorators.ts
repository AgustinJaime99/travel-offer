import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { StaffRole } from '@travel-rock/shared';
import type { AuthenticatedStaff, StaffRequest } from './authenticated-staff.js';

export const IS_PUBLIC_KEY = 'auth:isPublic';
export const ROLES_KEY = 'auth:roles';
export const ALLOW_PENDING_PASSWORD_CHANGE_KEY = 'auth:allowPendingPasswordChange';

/** Opts a route out of the default-deny staff guard. Every use is listed in the route inventory test. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or controller) to the given staff roles. Without it, any active staff user passes. */
export const Roles = (...roles: StaffRole[]) => SetMetadata(ROLES_KEY, roles);

/** Routes still reachable while the user must change a temporary password. */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedStaff => {
    const staff = context.switchToHttp().getRequest<StaffRequest>().staff;
    if (!staff) throw new Error('CurrentStaff used on a route without staff authentication');
    return staff;
  },
);
