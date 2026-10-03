import {
  adminSchoolRequestListSchema,
  provinceLabels,
  requestStatuses,
  requestStatusLabels,
  requestTypeLabels,
  requestTypes,
  schoolRequestListQuerySchema,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { serverApiGet } from '@/lib/staff-session';
import { requestTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Solicitudes · Travel Rock' };

const PAGE_SIZE = 20;
type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SchoolRequestsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const form = {
    q: first(raw['q']) ?? '',
    type: first(raw['type']) ?? '',
    status: first(raw['status']) ?? 'open',
  };
  const parsed = schoolRequestListQuerySchema.safeParse({
    ...form,
    page: first(raw['page']),
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success
    ? parsed.data
    : schoolRequestListQuerySchema.parse({ pageSize: PAGE_SIZE });
  const params = new URLSearchParams({
    status: query.status,
    page: String(query.page),
    pageSize: String(PAGE_SIZE),
  });
  if (query.q) params.set('q', query.q);
  if (query.type) params.set('type', query.type);
  const result = await serverApiGet(
    `/api/admin/school-requests?${params.toString()}`,
    adminSchoolRequestListSchema,
  );
  const requests = result ?? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
  const totalPages = Math.max(1, Math.ceil(requests.total / PAGE_SIZE));
  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    next.delete('pageSize');
    next.set('page', String(page));
    return `/admin/school-requests?${next.toString()}`;
  };

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
        Solicitudes de familias
      </h1>
      <p className="text-sm text-slate-600">
        Colegios o grupos que las familias no encontraron. No se crean solos: revisalos y cargalos
        desde Colegios o Grupos.
      </p>
      <form
        method="get"
        role="search"
        aria-label="Filtrar solicitudes"
        className="grid grid-cols-1 gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            Colegio
          </label>
          <input
            id="q"
            name="q"
            defaultValue={form.q}
            maxLength={100}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="type" className="text-sm font-medium">
            Tipo
          </label>
          <select
            id="type"
            name="type"
            defaultValue={form.type}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="">Todos</option>
            {requestTypes.map((type) => (
              <option key={type} value={type}>
                {requestTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>
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
            <option value="open">Abiertas</option>
            {requestStatuses.map((status) => (
              <option key={status} value={status}>
                {requestStatusLabels[status]}
              </option>
            ))}
            <option value="all">Todas</option>
          </select>
        </div>
        <div className="sm:col-span-4">
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Filtrar
          </button>
        </div>
      </form>

      {requests.total === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 text-slate-600 p-6">
          No hay solicitudes con estos filtros.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="px-4 py-3">
                    Recibida
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tipo
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Colegio
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Curso · año
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Demanda
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {requests.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/school-requests/${item.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {formatDateTime(item.createdAt)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{requestTypeLabels[item.type]}</td>
                    <td className="px-4 py-3">
                      {item.school.name}
                      <span className="block text-slate-600">
                        {item.school.city}, {provinceLabels[item.school.province]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.course} · {item.travelYear}
                    </td>
                    <td
                      className="px-4 py-3 text-right"
                      title="Solicitudes abiertas para el mismo colegio"
                    >
                      {item.openRequestsForSchool}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={requestTone[item.status]}>
                        {requestStatusLabels[item.status]}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 ? (
            <nav
              aria-label="Paginación"
              className="flex items-center justify-between gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 px-4 py-2.5 text-sm text-slate-600"
            >
              {requests.page > 1 ? (
                <Link
                  href={pageHref(requests.page - 1)}
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Anterior
                </Link>
              ) : null}
              <span>
                Página {requests.page} de {totalPages}
              </span>
              {requests.page < totalPages ? (
                <Link
                  href={pageHref(requests.page + 1)}
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
