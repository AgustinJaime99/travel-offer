'use client';

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { formatCount } from './format';

/*
 * Chart marks follow the data-viz spec: one accent hue (Travel Rock orange, validated against the
 * white card) for the data, a gray for comparisons, hairline gridlines, 2px lines, ≤ 24px bars with a
 * 4px rounded data end, and a table view for every chart (values never depend on hover or color).
 */
export const ACCENT = '#eb6834';
export const COMPARE = '#a8a29e';
const GRID = '#e7e5e4';
const BASELINE = '#d6d3d1';
const MUTED_TEXT = '#78716c';

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(Math.round(entry.contentRect.width), 240));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Clean axis maximum and ticks (0 / 5 / 10 …) for counts. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((value) => value >= rough)!;
  const top = Math.max(Math.ceil(max / step) * step, 1);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
}

export function TableView({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-9 cursor-pointer items-center text-xs font-medium text-slate-600 hover:text-slate-900">
        <span className="group-open:hidden">Ver tabla</span>
        <span className="hidden group-open:inline">Ocultar tabla</span>
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </details>
  );
}

export function LegendItem({
  color,
  label,
  kind,
}: {
  color: string;
  label: string;
  kind: 'line' | 'box';
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span
        aria-hidden="true"
        className={kind === 'line' ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]'}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export interface TrendPoint {
  label: string;
  previousLabel: string;
  current: number;
  previous: number;
}

/**
 * Enrollments over time: this period (accent line with a 10% wash) against the previous one (gray).
 * Crosshair + tooltip on hover; arrow keys move it when the chart has focus.
 */
export function TrendChart({ points, title }: { points: TrendPoint[]; title: string }) {
  const [box, width] = useWidth<HTMLDivElement>(320);
  const [active, setActive] = useState<number | null>(null);
  const height = 220;
  const margin = { top: 12, right: 12, bottom: 26, left: 32 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const ticks = niceTicks(
    Math.max(...points.map((point) => Math.max(point.current, point.previous))),
  );
  const top = ticks.at(-1)!;
  const x = (index: number) =>
    margin.left + (points.length <= 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (value: number) => margin.top + plotHeight - (value / top) * plotHeight;
  const line = (key: 'current' | 'previous') =>
    points.map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point[key])}`).join(' ');
  const area = `${line('current')} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const labelEvery = Math.ceil(points.length / Math.max(Math.floor(plotWidth / 70), 2));
  const last = points.length - 1;

  const onPointer = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left - margin.left) / plotWidth;
    setActive(Math.min(Math.max(Math.round(ratio * last), 0), last));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' ? -1 : 1;
    setActive((index) => Math.min(Math.max((index ?? last) + step, 0), last));
  };
  const point = active === null ? null : points[active];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        <LegendItem color={ACCENT} label="Este período" kind="line" />
        <LegendItem color={COMPARE} label="Período anterior" kind="line" />
      </div>
      <div ref={box} className="relative min-w-0">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${title}. Usá las flechas para recorrer los valores; la tabla tiene todos los datos.`}
          tabIndex={0}
          onPointerMove={onPointer}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive(last)}
          onBlur={() => setActive(null)}
          onKeyDown={onKey}
          className="block touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? BASELINE : GRID}
              />
              <text
                x={margin.left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                fontSize="11"
                fill={MUTED_TEXT}
                className="tabular-nums"
              >
                {formatCount(tick)}
              </text>
            </g>
          ))}
          {points.map((item, index) =>
            // Regular labels leave room for the last one, which is always shown.
            (index % labelEvery === 0 && last - index >= labelEvery * 0.6) || index === last ? (
              <text
                key={item.label}
                x={x(index)}
                y={height - 6}
                textAnchor={index === 0 ? 'start' : index === last ? 'end' : 'middle'}
                fontSize="11"
                fill={MUTED_TEXT}
              >
                {item.label}
              </text>
            ) : null,
          )}
          <path d={area} fill={ACCENT} fillOpacity={0.1} />
          <path
            d={line('previous')}
            fill="none"
            stroke={COMPARE}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={line('current')}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={x(last)}
            cy={y(points[last]?.current ?? 0)}
            r={4}
            fill={ACCENT}
            stroke="#fff"
            strokeWidth={2}
          />
          {point && active !== null ? (
            <g>
              <line x1={x(active)} x2={x(active)} y1={margin.top} y2={y(0)} stroke={BASELINE} />
              <circle
                cx={x(active)}
                cy={y(point.previous)}
                r={4}
                fill={COMPARE}
                stroke="#fff"
                strokeWidth={2}
              />
              <circle
                cx={x(active)}
                cy={y(point.current)}
                r={4}
                fill={ACCENT}
                stroke="#fff"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
        {point && active !== null ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg bg-white p-2.5 text-xs shadow-lg ring-1 ring-slate-200"
            style={{ left: Math.min(Math.max(x(active) - 88, 0), width - 176) }}
          >
            <TooltipRow color={ACCENT} value={point.current} label={point.label} />
            <TooltipRow color={COMPARE} value={point.previous} label={point.previousLabel} />
          </div>
        ) : null}
      </div>
      <TableView caption={title}>
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Este período</th>
            <th className="py-1.5 pr-3 text-right font-medium">Inscripciones</th>
            <th className="py-1.5 pr-3 font-medium">Período anterior</th>
            <th className="py-1.5 text-right font-medium">Inscripciones</th>
          </tr>
        </thead>
        <tbody>
          {points.map((item) => (
            <tr key={item.label} className="border-b border-slate-100">
              <td className="py-1.5 pr-3">{item.label}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatCount(item.current)}</td>
              <td className="py-1.5 pr-3 text-slate-600">{item.previousLabel}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCount(item.previous)}</td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </div>
  );
}

function TooltipRow({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        aria-hidden="true"
        className="h-0.5 w-3 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-sm font-semibold text-slate-900 tabular-nums">
        {formatCount(value)}
      </span>
      <span className="truncate text-slate-500">{label}</span>
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  /** Optional second line under the label (e.g. a city). */
  detail?: string;
  /** Status cue (icon + text, never color alone). */
  flag?: string;
}

/** Horizontal bars of one series: value at the tip, label above the bar. */
export function BarList({
  data,
  caption,
  valueHeader,
  empty,
  format = formatCount,
}: {
  data: BarDatum[];
  caption: string;
  valueHeader: string;
  empty: string;
  format?: (value: number) => string;
}) {
  if (data.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className="flex flex-col gap-3">
      <ul aria-hidden="true" className="flex flex-col gap-3">
        {data.map((item) => (
          <li key={item.key} className="group flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-slate-700">
                {item.label}
                {item.detail ? (
                  <span className="ml-1.5 text-xs text-slate-500">{item.detail}</span>
                ) : null}
                {item.flag ? (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 text-xs font-medium text-amber-800">
                    ▲ {item.flag}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {format(item.value)}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-r-[4px] bg-slate-100">
              <div
                className="h-full rounded-r-[4px] transition-[filter] group-hover:brightness-110"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  backgroundColor: ACCENT,
                  minWidth: item.value > 0 ? 4 : 0,
                }}
              />
            </div>
          </li>
        ))}
      </ul>
      <TableView caption={caption}>
        <tbody>
          {data.map((item) => (
            <tr key={item.key} className="border-b border-slate-100">
              <th scope="row" className="py-1.5 pr-3 font-normal">
                {item.label}
                {item.detail ? ` (${item.detail})` : ''}
                {item.flag ? ` — ${item.flag}` : ''}
              </th>
              <td className="py-1.5 text-right tabular-nums">
                <span className="sr-only">{valueHeader}: </span>
                {format(item.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </div>
  );
}

/** Funnel stages as bars relative to the first stage, with the share of the first one. */
export function Funnel({
  stages,
  caption,
}: {
  stages: { label: string; value: number; previous: number }[];
  caption: string;
}) {
  const first = stages[0]?.value ?? 0;
  const share = (value: number) => (first === 0 ? '—' : `${Math.round((value / first) * 100)} %`);
  return (
    <div className="flex flex-col gap-4">
      <ol aria-hidden="true" className="flex flex-col gap-4">
        {stages.map((stage, index) => (
          <li key={stage.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-slate-700">
                <span className="mr-1.5 text-xs text-slate-500">{index + 1}.</span>
                {stage.label}
              </span>
              <span className="text-slate-500">
                <span className="mr-2 font-semibold text-slate-900 tabular-nums">
                  {formatCount(stage.value)}
                </span>
                {index > 0 ? share(stage.value) : null}
              </span>
            </div>
            <div className="h-6 w-full rounded-r-[4px] bg-slate-100">
              <div
                className="h-full rounded-r-[4px]"
                style={{
                  width: first === 0 ? 0 : `${(stage.value / first) * 100}%`,
                  minWidth: stage.value > 0 ? 4 : 0,
                  backgroundColor: ACCENT,
                  opacity: 1 - index * 0.22,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
      <TableView caption={caption}>
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Etapa</th>
            <th className="py-1.5 pr-3 text-right font-medium">Este período</th>
            <th className="py-1.5 pr-3 text-right font-medium">% del total</th>
            <th className="py-1.5 text-right font-medium">Período anterior</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((stage) => (
            <tr key={stage.label} className="border-b border-slate-100">
              <th scope="row" className="py-1.5 pr-3 font-normal">
                {stage.label}
              </th>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatCount(stage.value)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{share(stage.value)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatCount(stage.previous)}</td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </div>
  );
}

/** Columns per travel year, active (accent) stacked under inactive (gray) with a 2px surface gap. */
export function YearColumns({
  data,
  caption,
  highlight,
}: {
  data: { travelYear: number; active: number; inactive: number }[];
  caption: string;
  highlight: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0)
    return <p className="py-6 text-center text-sm text-slate-500">Todavía no hay grupos.</p>;
  const ticks = niceTicks(Math.max(...data.map((item) => item.active + item.inactive)));
  const top = ticks.at(-1)!;
  const plot = 160;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4">
        <LegendItem color={ACCENT} label="Activos" kind="box" />
        <LegendItem color={COMPARE} label="Inactivos" kind="box" />
      </div>
      <div aria-hidden="true" className="relative flex gap-2 pl-7">
        <div className="absolute inset-y-0 left-0 w-full" style={{ height: plot }}>
          {ticks.map((tick) => (
            <div
              key={tick}
              className="absolute inset-x-0 flex items-center gap-2"
              style={{ bottom: (tick / top) * plot - 6 }}
            >
              <span className="w-5 text-right text-[11px] text-stone-500 tabular-nums">{tick}</span>
              <span
                className="h-px flex-1"
                style={{ backgroundColor: tick === 0 ? BASELINE : GRID }}
              />
            </div>
          ))}
        </div>
        {data.map((item) => {
          const total = item.active + item.inactive;
          const selected = highlight === item.travelYear;
          return (
            <div
              key={item.travelYear}
              className="relative z-[1] flex flex-1 flex-col items-center"
              onPointerEnter={() => setHover(item.travelYear)}
              onPointerLeave={() => setHover(null)}
            >
              <div
                className="flex w-full flex-col items-center justify-end"
                style={{ height: plot }}
              >
                <span className="mb-1 text-xs font-semibold text-slate-900 tabular-nums">
                  {total}
                </span>
                {item.inactive > 0 ? (
                  <div
                    className="w-full max-w-6 rounded-t-[4px]"
                    style={{ height: (item.inactive / top) * plot, backgroundColor: COMPARE }}
                  />
                ) : null}
                {item.active > 0 ? (
                  <div
                    className={`w-full max-w-6 ${item.inactive > 0 ? 'mt-0.5' : 'rounded-t-[4px]'}`}
                    style={{
                      height: (item.active / top) * plot - (item.inactive > 0 ? 2 : 0),
                      backgroundColor: ACCENT,
                    }}
                  />
                ) : null}
              </div>
              <span
                className={`mt-1.5 text-xs tabular-nums ${selected ? 'font-semibold text-slate-900' : 'text-stone-500'}`}
              >
                {item.travelYear}
              </span>
              {hover === item.travelYear ? (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 w-32 rounded-lg bg-white p-2 text-xs shadow-lg ring-1 ring-slate-200">
                  <p className="mb-1 font-medium text-slate-700">Viaje {item.travelYear}</p>
                  <p>
                    <strong className="text-slate-900 tabular-nums">{item.active}</strong>{' '}
                    <span className="text-slate-500">activos</span>
                  </p>
                  <p>
                    <strong className="text-slate-900 tabular-nums">{item.inactive}</strong>{' '}
                    <span className="text-slate-500">inactivos</span>
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <TableView caption={caption}>
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="py-1.5 pr-3 font-medium">Año de viaje</th>
            <th className="py-1.5 pr-3 text-right font-medium">Activos</th>
            <th className="py-1.5 text-right font-medium">Inactivos</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.travelYear} className="border-b border-slate-100">
              <th scope="row" className="py-1.5 pr-3 font-normal">
                {item.travelYear}
              </th>
              <td className="py-1.5 pr-3 text-right tabular-nums">{item.active}</td>
              <td className="py-1.5 text-right tabular-nums">{item.inactive}</td>
            </tr>
          ))}
        </tbody>
      </TableView>
    </div>
  );
}
