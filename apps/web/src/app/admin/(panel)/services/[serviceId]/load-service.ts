import { serviceSchema } from '@travel-rock/shared';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { serverApiGet } from '@/lib/staff-session';

export async function loadService(serviceId: string) {
  if (!z.uuid().safeParse(serviceId).success) notFound();
  const service = await serverApiGet(`/api/admin/services/${serviceId}`, serviceSchema);
  if (!service) notFound();
  return service;
}
