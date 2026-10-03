import {
  adminSchoolRequestSchema,
  canEditCatalog,
  provinceLabels,
  requestStatusLabels,
  requestTypeLabels,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { formatDateTime } from '@/lib/format';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { ReviewForm } from './review-form';
import type { ReactNode } from 'react';
import { requestTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Solicitud · Travel Rock' };

export default async function SchoolRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  if (!z.uuid().safeParse(requestId).success) notFound();
  const [item, staff] = await Promise.all([
    serverApiGet(`/api/admin/school-requests/${requestId}`, adminSchoolRequestSchema),
    getCurrentStaff(),
  ]);
  if (!item) notFound();
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const details: [string, ReactNode][] = [
    ['Tipo', requestTypeLabels[item.type]],
    [
      'Colegio',
      `${item.school.name} (${item.school.city}, ${provinceLabels[item.school.province]})`,
    ],
    ['Curso', item.course],
    ['Año del viaje', String(item.travelYear)],
    ['Solicitudes abiertas para este colegio', String(item.openRequestsForSchool)],
    [
      'Estado',
      <StatusBadge key="status" tone={requestTone[item.status]}>
        {requestStatusLabels[item.status]}
      </StatusBadge>,
    ],
    ['Recibida', formatDateTime(item.createdAt)],
  ];
  if (item.resolvedBy) details.push(['Cerrada por', item.resolvedBy.fullName]);
  if (item.contact)
    details.push(['Contacto', `${item.contact.fullName} · ${item.contact.emails.join(', ')}`]);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/school-requests"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← Solicitudes
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Solicitud de {item.school.name}
        </h1>
      </div>
      <dl className="grid max-w-2xl grid-cols-1 gap-x-8 gap-y-1 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6 text-sm sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-y-3">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="mb-2 break-words sm:mb-0">{value}</dd>
          </div>
        ))}
      </dl>
      {canEdit ? (
        <>
          <p className="text-sm">
            {item.type === 'GROUP_NOT_FOUND' && item.school.id ? (
              <Link
                href={`/admin/groups/new?schoolId=${item.school.id}`}
                className="font-medium text-orange-800 underline underline-offset-2"
              >
                Crear el grupo en este colegio
              </Link>
            ) : (
              <Link
                href="/admin/schools/new"
                className="font-medium text-orange-800 underline underline-offset-2"
              >
                Cargar el colegio
              </Link>
            )}
          </p>
          <ReviewForm requestId={item.id} status={item.status} staffNotes={item.staffNotes} />
        </>
      ) : item.staffNotes ? (
        <p className="whitespace-pre-line text-sm">Notas: {item.staffNotes}</p>
      ) : null}
    </section>
  );
}
