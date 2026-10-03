import {
  canEditCatalog,
  formatArs,
  pricingUnitLabels,
  serviceCategoryLabels,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PatchButton } from '@/components/patch-button';
import { getCurrentStaff } from '@/lib/staff-session';
import { loadService } from './load-service';
import type { ReactNode } from 'react';
import { activeTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Servicio · Travel Rock' };

export default async function ServicePage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const [service, staff] = await Promise.all([loadService(serviceId), getCurrentStaff()]);
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const details: [string, ReactNode][] = [
    ['Categoría', serviceCategoryLabels[service.category]],
    [
      'Precio base',
      `${formatArs(service.basePriceMinor)} ${pricingUnitLabels[service.pricingUnit]}`,
    ],
    ['Descripción', service.description ?? '—'],
    [
      'Estado',
      <StatusBadge key="status" tone={activeTone(service.active)}>
        {service.active ? 'Activo' : 'Inactivo'}
      </StatusBadge>,
    ],
  ];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/services"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← Servicios
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{service.name}</h1>
      </div>
      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-8 gap-y-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="max-w-xl text-sm text-slate-600">
        El precio base es el sugerido para propuestas nuevas. Cambiarlo no modifica propuestas ya
        publicadas.
      </p>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/services/${service.id}/edit`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Editar
          </Link>
          <PatchButton
            path={`/api/admin/services/${service.id}`}
            body={{ active: !service.active }}
            label={service.active ? 'Desactivar' : 'Reactivar'}
            {...(service.active
              ? {
                  confirmMessage: `¿Desactivar "${service.name}"? No se borra: deja de ofrecerse para propuestas nuevas.`,
                }
              : {})}
          />
        </div>
      ) : null}
    </section>
  );
}
