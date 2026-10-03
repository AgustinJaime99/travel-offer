import { canEditCatalog, provinceLabels, schoolGroupListSchema } from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PatchButton } from '@/components/patch-button';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { GroupsTable } from '../../groups/groups-table';
import { loadSchool } from './load-school';
import type { ReactNode } from 'react';
import { activeTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Colegio · Travel Rock' };

export default async function SchoolPage({ params }: { params: Promise<{ schoolId: string }> }) {
  const { schoolId } = await params;
  const [school, staff] = await Promise.all([loadSchool(schoolId), getCurrentStaff()]);
  const groups = await serverApiGet(
    `/api/admin/school-groups?schoolId=${school.id}&status=all&pageSize=100`,
    schoolGroupListSchema,
  );
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const details: [string, ReactNode][] = [
    ['Provincia', provinceLabels[school.province]],
    ['Localidad', school.city],
    ['Dirección', school.address ?? '—'],
    ['CUE', school.cue ?? '—'],
    [
      'Estado',
      <StatusBadge key="status" tone={activeTone(school.active)}>
        {school.active ? 'Activo' : 'Inactivo'}
      </StatusBadge>,
    ],
  ];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/schools"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← Colegios
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{school.name}</h1>
      </div>
      <dl className="grid max-w-2xl grid-cols-[max-content_1fr] gap-x-8 gap-y-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/admin/schools/${school.id}/edit`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Editar
          </Link>
          <PatchButton
            path={`/api/admin/schools/${school.id}`}
            body={{ active: !school.active }}
            label={school.active ? 'Desactivar' : 'Reactivar'}
            {...(school.active
              ? {
                  confirmMessage: `¿Desactivar "${school.name}"? No se borra: deja de aparecer en las búsquedas por defecto.`,
                }
              : {})}
          />
        </div>
      ) : null}

      <section aria-labelledby="groups-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="groups-title" className="text-lg font-semibold text-slate-900">
            Grupos
          </h2>
          {canEdit && school.active ? (
            <Link
              href={`/admin/groups/new?schoolId=${school.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-800 shadow-sm hover:bg-slate-50"
            >
              + Crear grupo
            </Link>
          ) : null}
        </div>
        {canEdit && !school.active ? (
          <p className="text-sm text-slate-600">Reactivá el colegio para crear grupos.</p>
        ) : null}
        {groups && groups.items.length > 0 ? (
          <GroupsTable groups={groups.items} showSchool={false} />
        ) : (
          <p>Este colegio todavía no tiene grupos.</p>
        )}
      </section>
    </section>
  );
}
