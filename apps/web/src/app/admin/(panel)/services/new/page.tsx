import { canEditCatalog } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff } from '@/lib/staff-session';
import { ServiceForm } from '../service-form';

export const metadata: Metadata = { title: 'Nuevo servicio · Travel Rock' };

export default async function NewServicePage() {
  const staff = await getCurrentStaff();
  if (!staff || !canEditCatalog(staff.role)) return <NoPermission title="Nuevo servicio" />;
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/services"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← Servicios
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Nuevo servicio</h1>
      </div>
      <ServiceForm />
    </section>
  );
}
