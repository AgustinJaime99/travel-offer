import type { SchoolGroup } from '@travel-rock/shared';
import type { Prisma } from '../generated/prisma/client.js';

export const schoolGroupInclude = {
  school: { select: { id: true, name: true, city: true, province: true, active: true } },
} satisfies Prisma.SchoolGroupInclude;

export type SchoolGroupRecord = Prisma.SchoolGroupGetPayload<{
  include: typeof schoolGroupInclude;
}>;

/** Explicit mapping: the access code hash never leaves the API. */
export function toSchoolGroupDto(group: SchoolGroupRecord): SchoolGroup {
  return {
    id: group.id,
    school: group.school,
    name: group.name,
    travelYear: group.travelYear,
    estimatedStudents: group.estimatedStudents,
    status: group.status,
    accessCode: {
      configured: group.accessCodeHash !== null,
      rotatedAt: group.accessCodeRotatedAt?.toISOString() ?? null,
    },
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}
