import type { Metadata } from 'next';
import { MyTrips } from './my-trips';

export const metadata: Metadata = { title: 'Mis viajes · Travel Rock' };

export default function MyTripsPage() {
  return <MyTrips />;
}
