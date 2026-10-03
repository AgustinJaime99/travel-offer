import {
  canEditCatalog,
  schoolGroupListQuerySchema,
  schoolGroupListSchema,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import { GroupsTable } from './groups-table';

export const metadata: Metadata = { title: 'Grupos · Travel Rock' };

const PAGE_SIZE = 20;
const statusLabels = { active: 'Activos', inactive: 'Inactivos', all: 'Todos' } as const;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const form = {
    q: first(raw['q']) ?? '',
    travelYear: first(raw['travelYear']) ?? '',
    status: first(raw['status']) ?? 'active',
  };
  const parsed = schoolGroupListQuerySchema.safeParse({
    ...form,
    page: first(raw['page']),
    pageSize: PAGE_SIZE,
  });
  const query = parsed.success
    ? parsed.data
    : schoolGroupListQuerySchema.parse({ pageSize: PAGE_SIZE });

  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(PAGE_SIZE),
    status: query.status,
  });
  if (query.q) params.set('q', query.q);
  if (query.travelYear !== undefined) params.set('travelYear', String(query.travelYear));

  const [staff, result] = await Promise.all([
    getCurrentStaff(),
    serverApiGet(`/api/admin/school-groups?${params.toString()}`, schoolGroupListSchema),
  ]);
  const groups = result ?? { items: [], page: 1, pageSize: PAGE_SIZE, total: 0 };
  const canEdit = staff ? canEditCatalog(staff.role) : false;
  const filtered = Boolean(query.q) || query.travelYear !== undefined || query.status !== 'active';
  const totalPages = Math.max(1, Math.ceil(groups.total / PAGE_SIZE));
  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    next.delete('pageSize');
    next.set('page', String(page));
    return `/admin/groups?${next.toString()}`;
  };

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Grupos</h1>
          <p className="text-sm text-slate-600">
            Cursos que viajan, con su año de viaje, código de acceso y propuestas.
          </p>
        </div>
        {canEdit ? (
          <Link
            href="/admin/groups/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Nuevo grupo
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        role="search"
        aria-label="Buscar grupos"
        className="grid grid-cols-1 gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5 sm:grid-cols-4"
      >
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="q" className="text-sm font-medium">
            Grupo o colegio
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
          <label htmlFor="travelYear" className="text-sm font-medium">
            Año de viaje
          </label>
          <input
            id="travelYear"
            name="travelYear"
            type="number"
            defaultValue={form.travelYear}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          />
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
            <Link href="/admin/groups" className="text-sm underline">
              Limpiar filtros
            </Link>
          ) : null}
        </div>
      </form>

      {groups.total === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 text-slate-600 p-6">
          {filtered ? (
            <p>No hay grupos que coincidan con la búsqueda.</p>
          ) : (
            <>
              <p>Todavía no hay grupos cargados.</p>
              {canEdit ? (
                <Link
                  href="/admin/groups/new"
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Crear el primer grupo
                </Link>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {groups.total === 1 ? '1 grupo' : `${groups.total} grupos`}
          </p>
          <GroupsTable groups={groups.items} showSchool />
          {totalPages > 1 ? (
            <nav
              aria-label="Paginación"
              className="flex items-center justify-between gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 px-4 py-2.5 text-sm text-slate-600"
            >
              {groups.page > 1 ? (
                <Link
                  href={pageHref(groups.page - 1)}
                  className="font-medium text-orange-800 underline underline-offset-2"
                >
                  Anterior
                </Link>
              ) : null}
              <span>
                Página {groups.page} de {totalPages}
              </span>
              {groups.page < totalPages ? (
                <Link
                  href={pageHref(groups.page + 1)}
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
