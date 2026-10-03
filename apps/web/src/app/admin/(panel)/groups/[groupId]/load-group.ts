import { schoolGroupSchema } from '@travel-rock/shared';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { serverApiGet } from '@/lib/staff-session';

export async function loadGroup(groupId: string) {
  if (!z.uuid().safeParse(groupId).success) notFound();
  const group = await serverApiGet(`/api/admin/school-groups/${groupId}`, schoolGroupSchema);
  if (!group) notFound();
  return group;
}
