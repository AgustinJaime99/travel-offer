import {
  proposalListQuerySchema,
  proposalListSchema,
  proposalStatusLabels,
  proposalStatuses,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApiGet } from '@/lib/staff-session';
import { ProposalsTable } from './proposals-table';

export const metadata: Metadata = { title: 'Propuestas · Travel Rock' };

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const parsed = proposalListQuerySchema.safeParse({
    status: first(raw['status']) ?? 'all',
    page: first(raw['page']),
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success
    ? parsed.data
    : proposalListQuerySchema.parse({ pageSize: PAGE_SIZE });
  const params = new URLSearchParams({
    status: query.status,
    page: String(query.page),
    pageSize: String(PAGE_SIZE),
  });
  const result = await serverApiGet(
    `/api/admin/proposals?${params.toString()}`,
    proposalListSchema,
  );
  const proposals = result ?? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
  const totalPages = Math.max(1, Math.ceil(proposals.total / PAGE_SIZE));
  const pageHref = (page: number) => `/admin/proposals?status=${query.status}&page=${page}`;

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Propuestas</h1>
      <p className="text-sm text-slate-600">
        Las propuestas se crean desde el detalle de cada{' '}
        <Link
          href="/admin/groups"
          className="font-medium text-orange-800 underline underline-offset-2"
        >
          grupo
        </Link>
        .
      </p>
      <form
        method="get"
        role="search"
        aria-label="Filtrar propuestas"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue={query.status}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="all">Todas</option>
            {proposalStatuses.map((status) => (
              <option key={status} value={status}>
                {proposalStatusLabels[status]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          Filtrar
        </button>
      </form>
      {proposals.total === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 text-slate-600 p-6">
          No hay propuestas.
        </p>
      ) : (
        <>
          <ProposalsTable proposals={proposals.items} showGroup />
          {totalPages > 1 ? (
            <nav
              aria-label="Paginación"
              className="flex items-center justify-between gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 px-4 py-2.5 text-sm text-slate-600"
            >
              {proposals.page > 1 ? (
                <Link
                  href={pageHref(proposals.page - 1)}
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Anterior
                </Link>
              ) : null}
              <span>
                Página {proposals.page} de {totalPages}
              </span>
              {proposals.page < totalPages ? (
                <Link
                  href={pageHref(proposals.page + 1)}
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Siguiente
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}
