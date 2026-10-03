import type { School } from '@travel-rock/shared';
import type { School as SchoolRecord } from '../generated/prisma/client.js';

export function toSchoolDto(school: SchoolRecord): School {
  return {
    id: school.id,
    name: school.name,
    province: school.province,
    city: school.city,
    address: school.address,
    cue: school.cue,
    active: school.active,
    createdAt: school.createdAt.toISOString(),
    updatedAt: school.updatedAt.toISOString(),
  };
}
