import { formatArs, type ProposalSummary, proposalStatusLabels } from '@travel-rock/shared';
import Link from 'next/link';
import { formatDate, formatDateTime } from '@/lib/format';
import { proposalTone, StatusBadge } from '@/components/status-badge';

export function ProposalsTable({
  proposals,
  showGroup,
}: {
  proposals: ProposalSummary[];
  showGroup: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <th scope="col" className="px-4 py-3">
              Versión
            </th>
            {showGroup ? (
              <th scope="col" className="px-4 py-3">
                Grupo
              </th>
            ) : null}
            <th scope="col" className="px-4 py-3">
              Estado
            </th>
            <th scope="col" className="px-4 py-3 text-right">
              Total por pasajero
            </th>
            <th scope="col" className="px-4 py-3">
              Válida hasta
            </th>
            <th scope="col" className="px-4 py-3">
              Actualizada
            </th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((proposal) => (
            <tr
              key={proposal.id}
              className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40"
            >
              <td className="px-4 py-3">
                <Link
                  href={`/admin/proposals/${proposal.id}`}
                  className="font-semibold whitespace-nowrap text-slate-900 underline-offset-2 hover:text-orange-800 hover:underline"
                >
                  Versión {proposal.version}
                </Link>
              </td>
              {showGroup ? (
                <td className="px-4 py-3">
                  {proposal.schoolGroup.name} ({proposal.schoolGroup.travelYear}) ·{' '}
                  {proposal.schoolGroup.school.name}
                </td>
              ) : null}
              <td className="px-4 py-3">
                <StatusBadge tone={proposalTone[proposal.status]}>
                  {proposalStatusLabels[proposal.status]}
                </StatusBadge>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatArs(proposal.totalPayableMinor)}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {proposal.validUntil ? formatDate(proposal.validUntil) : '—'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                {formatDateTime(proposal.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
