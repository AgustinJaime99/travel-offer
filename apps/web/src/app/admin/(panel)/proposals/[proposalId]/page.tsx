import {
  canEditCatalog,
  formatArs,
  itemPerPassengerMinor,
  pricingUnitLabels,
  proposalSchema,
  schoolGroupSchema,
  proposalStatusLabels,
  serviceCategoryLabels,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PricingBreakdown } from '@/components/pricing-breakdown';
import { formatDate, formatDateTime } from '@/lib/format';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { ProposalActionButton } from '../proposal-actions';
import { ProposalBuilder } from './proposal-builder';
import { proposalTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Propuesta · Travel Rock' };

export default async function ProposalPage({
  params,
}: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  if (!z.uuid().safeParse(proposalId).success) notFound();
  const [proposal, staff] = await Promise.all([
    serverApiGet(`/api/admin/proposals/${proposalId}`, proposalSchema),
    getCurrentStaff(),
  ]);
  if (!proposal) notFound();
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const group = proposal.schoolGroup;
  const editing = proposal.status === 'DRAFT' && canEdit;
  // The builder pre-fills the passenger count of per-group services with the group's estimate.
  const groupDetail = editing
    ? await serverApiGet(`/api/admin/school-groups/${group.id}`, schoolGroupSchema)
    : null;

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/admin/groups/${group.id}`}
          className="inline-flex items-center gap-1 self-start text-sm font-medium text-slate-600 hover:text-orange-800"
        >
          ← {group.name} · {group.school.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Propuesta · versión {proposal.version}
            {/* The status is part of the heading for screen readers; the badge shows it. */}
            <span className="sr-only"> ({proposalStatusLabels[proposal.status]})</span>
          </h1>
          <span aria-hidden="true">
            <StatusBadge tone={proposalTone[proposal.status]}>
              {proposalStatusLabels[proposal.status]}
            </StatusBadge>
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Grupo {group.name} ({group.travelYear}) de {group.school.name}
          {proposal.publishedAt && proposal.publishedBy
            ? ` · Publicada el ${formatDateTime(proposal.publishedAt)} por ${proposal.publishedBy.fullName}`
            : ''}
          {proposal.archivedAt ? ` · Archivada el ${formatDateTime(proposal.archivedAt)}` : ''}
        </p>
      </div>

      {editing ? (
        <ProposalBuilder
          proposal={proposal}
          estimatedStudents={groupDetail?.estimatedStudents ?? null}
        />
      ) : (
        <>
          <p>
            {proposal.validUntil
              ? `Válida ${proposal.validFrom ? `desde el ${formatDate(proposal.validFrom)} ` : ''}hasta el ${formatDate(proposal.validUntil)}.`
              : 'Sin fecha de vencimiento.'}
          </p>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <caption className="pb-2 text-left font-semibold">
                Servicios (precios por pasajero)
              </caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="px-4 py-3">
                    Servicio
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Cantidad
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Precio
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Descuento
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Importe
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Por alumno
                  </th>
                </tr>
              </thead>
              <tbody>
                {proposal.pricing.items.map((item) => (
                  <tr
                    key={item.serviceId}
                    className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40"
                  >
                    <td className="px-4 py-3">
                      {item.serviceName}{' '}
                      <span className="text-slate-600">
                        · {serviceCategoryLabels[item.serviceCategory]} ·{' '}
                        {pricingUnitLabels[item.pricingUnit]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatArs(item.unitPriceMinor)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatArs(item.discountMinor)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatArs(item.lineNetMinor)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatArs(itemPerPassengerMinor(item))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {proposal.pricing.passengerCount ? (
            <p className="text-sm text-slate-600">
              Los costos del grupo se dividen entre {proposal.pricing.passengerCount} pasajeros,
              redondeando hacia arriba al centavo.
            </p>
          ) : null}
          <div className="max-w-xl">
            <PricingBreakdown pricing={proposal.pricing} />
          </div>
          {canEdit && proposal.status !== 'DRAFT' ? (
            <div className="flex flex-wrap items-start gap-3">
              <ProposalActionButton action="clone" proposalId={proposal.id} />
              {proposal.status === 'PUBLISHED' ? (
                <ProposalActionButton action="withdraw" proposalId={proposal.id} />
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
