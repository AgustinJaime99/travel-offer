import {
  analyticsPeriodLabels,
  analyticsPeriods,
  type DashboardAnalytics,
  dashboardAnalyticsQuerySchema,
  dashboardAnalyticsSchema,
  dashboardSummarySchema,
  formatArs,
  provinceLabels,
  requestStatusLabels,
  requestTypeLabels,
  travelYearRange,
} from '@travel-rock/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDate, formatDateTime } from '@/lib/format';
import { getCurrentStaff, serverApiGet } from '@/lib/staff-session';
import {
  ACCENT,
  BarList,
  COMPARE,
  Funnel,
  TableView,
  TrendChart,
  YearColumns,
} from './dashboard/charts';
import {
  formatArsShort,
  formatBucket,
  formatCount,
  formatDelta,
  formatShare,
} from './dashboard/format';

export const metadata: Metadata = { title: 'Panel · Travel Rock' };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const card =
  'flex min-w-0 flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70';

function Card({
  title,
  subtitle,
  action,
  className = '',
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={`${card} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Stat tile: label, value, change against the previous period and an optional sparkline. */
function Kpi({
  label,
  value,
  delta,
  tone = 'neutral',
  note,
  trend,
  hero = false,
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: 'good' | 'bad' | 'neutral';
  note: string;
  trend?: number[];
  hero?: boolean;
}) {
  const toneClass =
    tone === 'good'
      ? 'text-green-800 bg-green-50'
      : tone === 'bad'
        ? 'text-red-800 bg-red-50'
        : 'text-slate-700 bg-slate-100';
  return (
    <div className={`${card} gap-2 ${hero ? 'sm:col-span-2 lg:col-span-1' : ''}`}>
      <p className="text-sm text-slate-600">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p
          className={`font-semibold tracking-tight text-slate-900 ${hero ? 'text-5xl' : 'text-3xl'}`}
        >
          {value}
        </p>
        {trend && trend.length > 1 ? <Sparkline values={trend} /> : null}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {delta ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${toneClass}`}
          >
            <span aria-hidden="true">
              {delta.startsWith('+') ? '▲' : delta.startsWith('−') ? '▼' : '●'}
            </span>
            {delta}
          </span>
        ) : null}
        {note}
      </p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const width = 96;
  const height = 32;
  const max = Math.max(...values, 1);
  const x = (index: number) => (index / (values.length - 1)) * (width - 4) + 2;
  const y = (value: number) => height - 3 - (value / max) * (height - 6);
  const path = values
    .map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`)
    .join(' ');
  const last = values.length - 1;
  return (
    <svg aria-hidden="true" width={width} height={height} className="shrink-0">
      <path d={path} fill="none" stroke={COMPARE} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last]!)} r={3} fill={ACCENT} />
    </svg>
  );
}

/** Min–max range of per-passenger prices with the median marked. */
function PriceRange({
  label,
  stats,
  scale,
}: {
  label: string;
  stats: { min: string; median: string; max: string };
  scale: { min: number; max: number };
}) {
  const position = (minor: string) => {
    const span = scale.max - scale.min;
    return span === 0 ? 50 : ((Number(minor) - scale.min) / span) * 100;
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-slate-600">{label}</p>
        <p className="text-right">
          <span className="text-xl font-semibold text-slate-900">
            {formatArsShort(stats.median)}
          </span>
          <span className="ml-1 text-xs text-slate-500">mediana</span>
        </p>
      </div>
      <div aria-hidden="true" className="relative h-4">
        <div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-slate-200" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{
            left: `${position(stats.min)}%`,
            width: `${Math.max(position(stats.max) - position(stats.min), 0.5)}%`,
            backgroundColor: ACCENT,
            opacity: 0.35,
          }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{ left: `${position(stats.median)}%`, backgroundColor: ACCENT }}
        />
      </div>
      <p className="flex justify-between text-xs text-slate-500 tabular-nums">
        <span>mín. {formatArsShort(stats.min)}</span>
        <span>máx. {formatArsShort(stats.max)}</span>
      </p>
    </div>
  );
}

type Stat = { label: string; value: number; href?: string; warn?: boolean };

/** Current-state counts; each one matches a filter of a list page. */
function StatCard({ title, stats }: { title: string; stats: Stat[] }) {
  return (
    <section aria-label={title} className={`${card} gap-3`}>
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
        {stats.map((stat) => (
          <div key={stat.label} className="contents">
            <dt
              className={
                // The warning mark is a pseudo-element: it is not part of the label's text.
                stat.warn && stat.value > 0
                  ? "font-medium text-amber-800 before:mr-1 before:content-['▲']"
                  : 'text-slate-600'
              }
            >
              {stat.href ? (
                <Link
                  href={stat.href}
                  className="underline-offset-2 hover:text-orange-800 hover:underline"
                >
                  {stat.label}
                </Link>
              ) : (
                stat.label
              )}
            </dt>
            <dd className="text-right text-base font-semibold text-slate-900 tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = dashboardAnalyticsQuerySchema.safeParse({
    travelYear: first(params['travelYear']),
    period: first(params['period']),
  });
  const query = parsed.success ? parsed.data : dashboardAnalyticsQuerySchema.parse({});
  const year = query.travelYear;
  const yearQuery = year === undefined ? '' : `travelYear=${year}`;
  const [staff, summary, analytics] = await Promise.all([
    getCurrentStaff(),
    serverApiGet(
      `/api/admin/dashboard/summary${yearQuery ? `?${yearQuery}` : ''}`,
      dashboardSummarySchema,
    ),
    serverApiGet(
      `/api/admin/dashboard/analytics?period=${query.period}${yearQuery ? `&${yearQuery}` : ''}`,
      dashboardAnalyticsSchema,
    ),
  ]);
  if (!summary) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Panel</h1>
        <p role="alert">No pudimos cargar el resumen del panel. Probá de nuevo en unos minutos.</p>
      </section>
    );
  }
  const yearParam = year === undefined ? '' : `&travelYear=${year}`;
  const { min, max } = travelYearRange();
  const years = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  const select =
    'rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus-visible:border-orange-500 focus-visible:ring-4 focus-visible:ring-orange-100';

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Panel</h1>
          <p className="text-slate-600">
            Hola, {staff?.fullName}. Así viene la actividad comercial.
          </p>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="period" className="text-xs font-medium text-slate-600">
              Período
            </label>
            <select id="period" name="period" defaultValue={query.period} className={select}>
              {analyticsPeriods.map((period) => (
                <option key={period} value={period}>
                  {analyticsPeriodLabels[period]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="travelYear" className="text-xs font-medium text-slate-600">
              Año de viaje
            </label>
            <select id="travelYear" name="travelYear" defaultValue={year ?? ''} className={select}>
              <option value="">Todos</option>
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            Ver
          </button>
        </form>
      </div>

      {analytics ? (
        <Analytics analytics={analytics} year={year ?? null} summary={summary} />
      ) : (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          No pudimos cargar la analítica. El resumen de abajo sigue disponible.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Estado actual</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Colegios"
            stats={[
              { label: 'Activos', value: summary.schools.active, href: '/admin/schools' },
              {
                label: 'Inactivos',
                value: summary.schools.inactive,
                href: '/admin/schools?status=inactive',
              },
            ]}
          />
          <StatCard
            title="Grupos"
            stats={[
              {
                label: 'Activos',
                value: summary.groups.active,
                href: `/admin/groups?status=active${yearParam}`,
              },
              {
                label: 'Inactivos',
                value: summary.groups.inactive,
                href: `/admin/groups?status=inactive${yearParam}`,
              },
              { label: 'Con código de acceso', value: summary.groups.withAccessCode },
            ]}
          />
          <StatCard
            title="Propuestas"
            stats={[
              {
                label: 'Borradores',
                value: summary.proposals.draft,
                href: '/admin/proposals?status=DRAFT',
              },
              {
                label: 'Publicadas vigentes',
                value: summary.proposals.publishedCurrent,
                href: '/admin/proposals?status=PUBLISHED',
              },
              {
                label: 'Publicadas vencidas',
                value: summary.proposals.publishedExpired,
                href: '/admin/proposals?status=PUBLISHED',
                warn: true,
              },
              {
                label: 'Publicadas por empezar',
                value: summary.proposals.publishedScheduled,
                href: '/admin/proposals?status=PUBLISHED',
              },
              {
                label: 'Archivadas',
                value: summary.proposals.archived,
                href: '/admin/proposals?status=ARCHIVED',
              },
            ]}
          />
          <StatCard
            title="Inscripciones de familias"
            stats={[
              { label: 'Total', value: summary.enrollments.total },
              { label: 'Con código del grupo', value: summary.enrollments.withAccess },
              { label: 'Sin código todavía', value: summary.enrollments.withoutAccess },
            ]}
          />
          <StatCard
            title="Solicitudes"
            stats={[
              {
                label: 'Pendientes',
                value: summary.requests.pending,
                href: '/admin/school-requests?status=PENDING',
                warn: true,
              },
              {
                label: 'En revisión',
                value: summary.requests.reviewing,
                href: '/admin/school-requests?status=REVIEWING',
              },
            ]}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {year === undefined
          ? 'Todos los años de viaje'
          : `Año de viaje ${year} (los colegios no tienen año)`}{' '}
        · actualizado {formatDateTime(summary.generatedAt)}
      </p>
    </section>
  );
}

function Analytics({
  analytics,
  year,
  summary,
}: {
  analytics: DashboardAnalytics;
  year: number | null;
  summary: {
    proposals: Record<
      'draft' | 'publishedCurrent' | 'publishedExpired' | 'publishedScheduled' | 'archived',
      number
    >;
  };
}) {
  const { enrollments, funnel, previousFunnel, requests, prices } = analytics;
  const periodLabel = analyticsPeriodLabels[analytics.period].toLowerCase();
  const points = enrollments.series.map((point) => ({
    label: formatBucket(point.bucket, analytics.granularity),
    previousLabel: formatBucket(point.previousBucket, analytics.granularity),
    current: point.current,
    previous: point.previous,
  }));
  const accessRate = formatShare(funnel.withAccess, funnel.enrolled);
  const viewRate = formatShare(funnel.viewedProposal, funnel.enrolled);
  const priceValues = [prices.cash, prices.totalPayable].flatMap((stats) =>
    stats ? [Number(stats.min), Number(stats.max)] : [],
  );
  const priceScale = { min: Math.min(...priceValues), max: Math.max(...priceValues) };
  const openRequests =
    (requests.byStatus.find((row) => row.status === 'PENDING')?.count ?? 0) +
    (requests.byStatus.find((row) => row.status === 'REVIEWING')?.count ?? 0);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          hero
          label={`Inscripciones · ${periodLabel}`}
          value={formatCount(enrollments.current)}
          delta={formatDelta(enrollments.current, enrollments.previous)}
          tone={
            enrollments.current > enrollments.previous
              ? 'good'
              : enrollments.current < enrollments.previous
                ? 'bad'
                : 'neutral'
          }
          note={`vs. ${formatCount(enrollments.previous)} el período anterior`}
          trend={enrollments.series.map((point) => point.current)}
        />
        <Kpi
          label="Con código del grupo"
          value={accessRate}
          note={`${formatCount(funnel.withAccess)} de ${formatCount(funnel.enrolled)} inscripciones · antes ${formatShare(previousFunnel.withAccess, previousFunnel.enrolled)}`}
        />
        <Kpi
          label="Vieron la propuesta"
          value={viewRate}
          note={`${formatCount(funnel.viewedProposal)} de ${formatCount(funnel.enrolled)} inscripciones · antes ${formatShare(previousFunnel.viewedProposal, previousFunnel.enrolled)}`}
        />
        <Kpi
          label="Solicitudes nuevas"
          value={formatCount(requests.createdCurrent)}
          delta={formatDelta(requests.createdCurrent, requests.createdPrevious)}
          note={`colegios o grupos que las familias no encontraron · ${formatCount(openRequests)} abiertas`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          className="lg:col-span-2"
          title="Inscripciones en el tiempo"
          subtitle={`${analyticsPeriodLabels[analytics.period]} por ${analytics.granularity === 'day' ? 'día' : analytics.granularity === 'week' ? 'semana' : 'mes'}, comparado con el período anterior`}
        >
          <TrendChart points={points} title="Inscripciones en el tiempo" />
        </Card>
        <Card title="Embudo de conversión" subtitle="Inscripciones del período">
          <Funnel
            caption="Embudo de conversión"
            stages={[
              {
                label: 'Registraron interés',
                value: funnel.enrolled,
                previous: previousFunnel.enrolled,
              },
              {
                label: 'Con código del grupo',
                value: funnel.withAccess,
                previous: previousFunnel.withAccess,
              },
              {
                label: 'Vieron la propuesta',
                value: funnel.viewedProposal,
                previous: previousFunnel.viewedProposal,
              },
            ]}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Inscripciones por provincia" subtitle="Provincia del colegio, en el período">
          <BarList
            caption="Inscripciones por provincia"
            valueHeader="Inscripciones"
            empty="Sin inscripciones en el período."
            data={analytics.byProvince.slice(0, 8).map((row) => ({
              key: row.province,
              label: provinceLabels[row.province],
              value: row.enrollments,
            }))}
          />
        </Card>
        <Card title="Colegios con más inscripciones" subtitle="En el período">
          <BarList
            caption="Colegios con más inscripciones"
            valueHeader="Inscripciones"
            empty="Sin inscripciones en el período."
            data={analytics.topSchools.map((row) => ({
              key: row.schoolId,
              label: row.name,
              detail: `${row.city}, ${provinceLabels[row.province]} · ${row.groups} ${row.groups === 1 ? 'grupo' : 'grupos'}`,
              value: row.enrollments,
            }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Propuestas por estado"
          subtitle="Estado actual"
          action={
            <Link
              href="/admin/proposals"
              className="text-xs font-medium text-orange-800 hover:underline"
            >
              Ver todas
            </Link>
          }
        >
          <BarList
            caption="Propuestas por estado"
            valueHeader="Propuestas"
            empty="Todavía no hay propuestas."
            data={[
              { key: 'current', label: 'Vigentes', value: summary.proposals.publishedCurrent },
              {
                key: 'scheduled',
                label: 'Por empezar',
                value: summary.proposals.publishedScheduled,
              },
              { key: 'draft', label: 'Borradores', value: summary.proposals.draft },
              {
                key: 'expired',
                label: 'Vencidas',
                value: summary.proposals.publishedExpired,
                ...(summary.proposals.publishedExpired > 0 ? { flag: 'revisar' } : {}),
              },
              { key: 'archived', label: 'Archivadas', value: summary.proposals.archived },
            ]}
          />
        </Card>
        <Card title="Vencen en los próximos 30 días" subtitle="Propuestas publicadas vigentes">
          {analytics.expiringSoon.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Ninguna vence en los próximos 30 días.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {analytics.expiringSoon.map((proposal) => (
                <li
                  key={proposal.proposalId}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/admin/proposals/${proposal.proposalId}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-orange-800 hover:underline"
                    >
                      {proposal.groupName} · viaje {proposal.travelYear}
                    </Link>
                    <span className="block truncate text-xs text-slate-500">
                      {proposal.schoolName} · versión {proposal.version}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {formatDate(proposal.validUntil)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card
          title="Precio por pasajero"
          subtitle={`${formatCount(prices.proposals)} ${prices.proposals === 1 ? 'propuesta vigente' : 'propuestas vigentes'}`}
        >
          {prices.cash && prices.totalPayable ? (
            <div className="flex flex-col gap-5">
              <PriceRange label="Precio contado" stats={prices.cash} scale={priceScale} />
              <PriceRange label="Total financiado" stats={prices.totalPayable} scale={priceScale} />
              <TableView caption="Precio por pasajero de las propuestas vigentes">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    <th className="py-1.5 pr-3 font-medium" />
                    <th className="py-1.5 pr-3 text-right font-medium">Mínimo</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Mediana</th>
                    <th className="py-1.5 text-right font-medium">Máximo</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Contado', prices.cash],
                      ['Financiado', prices.totalPayable],
                    ] as const
                  ).map(([label, stats]) => (
                    <tr key={label} className="border-b border-slate-100">
                      <th scope="row" className="py-1.5 pr-3 font-normal">
                        {label}
                      </th>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {formatArs(stats.min)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {formatArs(stats.median)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatArs(stats.max)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableView>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No hay propuestas vigentes.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Grupos por año de viaje" subtitle="Todos los años, estado actual">
          <YearColumns
            data={analytics.groupsByYear}
            caption="Grupos por año de viaje"
            highlight={year}
          />
        </Card>
        <Card
          title="Solicitudes por estado"
          subtitle="Estado actual"
          action={
            <Link
              href="/admin/school-requests"
              className="text-xs font-medium text-orange-800 hover:underline"
            >
              Ver todas
            </Link>
          }
        >
          <BarList
            caption="Solicitudes por estado"
            valueHeader="Solicitudes"
            empty="Todavía no hay solicitudes."
            data={requests.byStatus.map((row) => ({
              key: row.status,
              label: requestStatusLabels[row.status],
              value: row.count,
              ...(row.status === 'PENDING' && row.count > 0 ? { flag: 'atender' } : {}),
            }))}
          />
          <p className="text-xs text-slate-500">
            {requests.byType
              .map((row) => `${requestTypeLabels[row.type]}: ${formatCount(row.count)}`)
              .join(' · ')}
          </p>
        </Card>
        <Card title="Colegios más pedidos" subtitle="Solicitudes abiertas de familias">
          {requests.topDemand.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No hay solicitudes abiertas.</p>
          ) : (
            <ol className="flex flex-col divide-y divide-slate-100">
              {requests.topDemand.map((row, index) => (
                <li
                  key={`${row.schoolName}-${row.city}`}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-orange-50 text-xs font-semibold text-orange-800">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {row.schoolName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {row.city}, {provinceLabels[row.province]}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">
                    {formatCount(row.requests)}
                    <span className="sr-only"> solicitudes</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
