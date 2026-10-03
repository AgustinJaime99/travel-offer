import { schoolSchema } from '@travel-rock/shared';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { serverApiGet } from '@/lib/staff-session';

export async function loadSchool(schoolId: string) {
  if (!z.uuid().safeParse(schoolId).success) notFound();
  const school = await serverApiGet(`/api/admin/schools/${schoolId}`, schoolSchema);
  if (!school) notFound();
  return school;
}
