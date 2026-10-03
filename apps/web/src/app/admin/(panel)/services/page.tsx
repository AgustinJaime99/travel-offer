import {
  canEditCatalog,
  formatArs,
  serviceCategories,
  pricingUnitLabels,
  serviceCategoryLabels,
  serviceListQuerySchema,
  serviceListSchema,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { activeTone, StatusBadge } from '@/components/status-badge';

export const metadata: Metadata = { title: 'Servicios · Travel Rock' };

const PAGE_SIZE = 20;
const statusLabels = { active: 'Activos', inactive: 'Inactivos', all: 'Todos' } as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const form = {
    q: first(raw['q']) ?? '',
    category: first(raw['category']) ?? '',
    status: first(raw['status']) ?? 'active',
  };
  const parsed = serviceListQuerySchema.safeParse({
    ...form,
    page: first(raw['page']),
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success
    ? parsed.data
    : serviceListQuerySchema.parse({ pageSize: PAGE_SIZE });

  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(PAGE_SIZE),
    status: query.status,
  });
  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);

  const [staff, result] = await Promise.all([
    getCurrentStaff(),
    serverApiGet(`/api/admin/services?${params.toString()}`, serviceListSchema),
  ]);
  const services = result ?? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const filtered = Boolean(query.q) || Boolean(query.category) || query.status !== 'active';
  const totalPages = Math.max(1, Math.ceil(services.total / PAGE_SIZE));
  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    next.delete('pageSize');
    next.set('page', String(page));
    return `/admin/services?${next.toString()}`;
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Servicios</h1>
          <p className="text-sm text-slate-600">
            Servicios con su precio sugerido (por pasajero o por grupo) para armar las propuestas.
          </p>
        </div>
        {canEdit ? (
          <Link
            href="/admin/services/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Nuevo servicio
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        role="search"
        aria-label="Buscar servicios"
        className="grid grid-cols-1 gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            Nombre
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
          <label htmlFor="category" className="text-sm font-medium">
            Categoría
          </label>
          <select
            id="category"
            name="category"
            defaultValue={form.category}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            <option value="">Todas</option>
            {serviceCategories.map((category) => (
              <option key={category} value={category}>
                {serviceCategoryLabels[category]}
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
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 sm:col-span-4">
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Buscar
          </button>
          {filtered ? (
            <Link href="/admin/services" className="text-sm underline">
              Limpiar filtros
            </Link>
          ) : null}
        </div>
      </form>

      {services.total === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 text-slate-600 p-6">
          {filtered ? (
            <p>No hay servicios que coincidan con la búsqueda.</p>
          ) : (
            <>
              <p>Todavía no hay servicios cargados.</p>
              {canEdit ? (
                <Link
                  href="/admin/services/new"
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Cargar el primer servicio
                </Link>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {services.total === 1 ? '1 servicio' : `${services.total} servicios`}
          </p>
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="px-4 py-3">
                    Nombre
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Categoría
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Precio base
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Estado
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.items.map((service) => (
                  <tr
                    key={service.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-orange-50/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/services/${service.id}`}
                        className="font-semibold text-slate-900 underline-offset-2 hover:text-orange-800 hover:underline"
                      >
                        {service.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{serviceCategoryLabels[service.category]}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatArs(service.basePriceMinor)}
                      <span className="block text-xs text-slate-500">
                        {pricingUnitLabels[service.pricingUnit]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={activeTone(service.active)}>
                        {service.active ? 'Activo' : 'Inactivo'}
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
              {services.page > 1 ? (
                <Link
                  href={pageHref(services.page - 1)}
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Anterior
                </Link>
              ) : null}
              <span>
                Página {services.page} de {totalPages}
              </span>
              {services.page < totalPages ? (
                <Link
                  href={pageHref(services.page + 1)}
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
