import {
  canEditCatalog,
  groupPlanPreferencesSchema,
  proposalListSchema,
  provinceLabels,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PatchButton } from '@/components/patch-button';
import { formatDateTime } from '@/lib/format';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { ProposalActionButton } from '../../proposals/proposal-actions';
import { ProposalsTable } from '../../proposals/proposals-table';
import { AccessCodePanel } from './access-code-panel';
import { loadGroup } from './load-group';
import type { ReactNode } from 'react';
import { activeTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Grupo · Travel Rock' };

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [group, staff, proposals, preferences] = await Promise.all([
    loadGroup(groupId),
    getCurrentStaff(),
    serverApiGet(`/api/admin/proposals?schoolGroupId=${groupId}&pageSize=100`, proposalListSchema),
    serverApiGet(
      `/api/admin/school-groups/${groupId}/plan-preferences`,
      groupPlanPreferencesSchema,
    ),
  ]);
  const interested = preferences?.options.reduce((sum, option) => sum + option.families, 0) ?? 0;
  const versions = [...(proposals?.items ?? [])].sort((a, b) => b.version - a.version);
  const draft = versions.find((proposal) => proposal.status === 'DRAFT');
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const active = group.status === 'ACTIVE';
  const details: [string, ReactNode][] = [
    ['Año de viaje', String(group.travelYear)],
    ['Alumnos estimados', group.estimatedStudents === null ? '—' : String(group.estimatedStudents)],
    [
      'Estado',
      <StatusBadge key="status" tone={activeTone(active)}>
        {active ? 'Activo' : 'Inactivo'}
      </StatusBadge>,
    ],
  ];

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/groups"
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← Grupos
        </Link>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{group.name}</h1>
        <p>
          <Link
            href={`/admin/schools/${group.school.id}`}
            className="font-medium text-orange-800 underline underline-offset-2"
          >
            {group.school.name}
          </Link>
          {' — '}
          {group.school.city}, {provinceLabels[group.school.province]}
          {group.school.active ? null : <span className="text-slate-500"> (colegio inactivo)</span>}
        </p>
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
            href={`/admin/groups/${group.id}/edit`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Editar
          </Link>
          <PatchButton
            path={`/api/admin/school-groups/${group.id}`}
            body={{ status: active ? 'INACTIVE' : 'ACTIVE' }}
            label={active ? 'Desactivar' : 'Reactivar'}
            {...(active
              ? { confirmMessage: `¿Desactivar el grupo "${group.name}"? No se borra.` }
              : {})}
          />
        </div>
      ) : null}
      <AccessCodePanel
        groupId={group.id}
        configured={group.accessCode.configured}
        rotatedAtLabel={
          group.accessCode.rotatedAt ? formatDateTime(group.accessCode.rotatedAt) : null
        }
        canEdit={canEdit}
      />

      <section aria-labelledby="proposals-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="proposals-title" className="text-lg font-semibold text-slate-900">
            Propuestas
          </h2>
          {canEdit && draft ? (
            <Link
              href={`/admin/proposals/${draft.id}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
            >
              Continuar borrador
            </Link>
          ) : null}
          {canEdit && !draft ? <ProposalActionButton action="create" groupId={group.id} /> : null}
        </div>
        {versions.length > 0 ? (
          <ProposalsTable proposals={versions} showGroup={false} />
        ) : (
          <p>Este grupo todavía no tiene propuestas.</p>
        )}
      </section>

      {preferences?.proposal ? (
        <section
          aria-labelledby="preferences-title"
          className="flex max-w-2xl flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70"
        >
          <div>
            <h2 id="preferences-title" className="text-lg font-semibold text-slate-900">
              Cómo prefieren pagar las familias
            </h2>
            <p className="text-sm text-slate-600">
              Versión {preferences.proposal.version} publicada · {interested} de{' '}
              {preferences.enrollments} {preferences.enrollments === 1 ? 'familia' : 'familias'}{' '}
              eligieron una opción. Es interés, no una aceptación.
            </p>
          </div>
          {preferences.options.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía nadie eligió una opción.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {preferences.options.map((option) => (
                <li key={option.installments} className="flex flex-col gap-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-700">
                      {option.installments === 0 ? 'Contado' : `${option.installments} cuotas`}
                    </span>
                    <span className="font-semibold text-slate-900 tabular-nums">
                      {option.families}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-r-[4px] bg-slate-100">
                    <div
                      className="h-full rounded-r-[4px] bg-[#eb6834]"
                      style={{ width: `${(option.families / Math.max(interested, 1)) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  );
}
