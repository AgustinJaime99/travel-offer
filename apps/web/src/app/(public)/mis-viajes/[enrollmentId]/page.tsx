import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { TripOffer } from './trip-offer';

export const metadata: Metadata = { title: 'Propuesta del viaje · Travel Rock' };

export default async function TripPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  if (!z.uuid().safeParse(enrollmentId).success) notFound();
  return <TripOffer enrollmentId={enrollmentId} />;
}
