import type { Metadata } from 'next';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff } from '@/lib/staff-session';
import { UsersManager } from './users-manager';

export const metadata: Metadata = { title: 'Usuarios · Travel Rock' };

export default async function UsersPage() {
  const staff = await getCurrentStaff();
  if (staff?.role !== 'ADMIN') return <NoPermission title="Usuarios" />;
  return <UsersManager currentStaffId={staff.id} />;
}
