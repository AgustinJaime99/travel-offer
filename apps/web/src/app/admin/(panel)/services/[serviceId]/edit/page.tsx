import { canEditCatalog } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoPermission } from '@/components/no-permission';
import { getCurrentStaff } from '@/lib/staff-session';
import { ServiceForm } from '../../service-form';
import { loadService } from '../load-service';

export const metadata: Metadata = { title: 'Editar servicio · Travel Rock' };

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const staff = await getCurrentStaff();
  if (!staff || !canEditCatalog(staff.role)) return <NoPermission title="Editar servicio" />;
  const service = await loadService(serviceId);
  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href={`/admin/services/${service.id}`}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← {service.name}
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Editar servicio</h1>
      </div>
      <ServiceForm service={service} />
    </section>
  );
}
