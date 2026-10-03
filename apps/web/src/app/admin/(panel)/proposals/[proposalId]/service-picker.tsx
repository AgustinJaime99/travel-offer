'use client';

import {
  formatArs,
  normalizeText,
  type Service,
  serviceCategoryLabels,
  serviceListSchema,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type RefObject, useEffect, useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

const MIN_QUERY = 2;

/** Searches active services and adds one to the proposal; services already added are not offered. */
export function ServicePicker({
  excludedIds,
  onAdd,
  inputRef,
}: {
  excludedIds: ReadonlySet<string>;
  onAdd: (service: Service) => void;
  /** The search input, so the builder can return focus to it. */
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; items: Service[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const searchable = normalizeText(query).length >= MIN_QUERY;

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, pageSize: '10', status: 'active' });
      apiFetch(`/api/admin/services?${params.toString()}`, serviceListSchema).then(
        (page) => {
          if (!cancelled) setResults({ query, items: page.items });
        },
        (caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof ApiRequestError && caught.status === 401) {
            router.replace(currentAdminLoginHref());
            return;
          }
          setFailed(true);
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchable, router]);

  const shown =
    searchable && results?.query === query
      ? results.items.filter((service) => !excludedIds.has(service.id))
      : null;
  const searching = searchable && !shown && !failed;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="service-search" className="text-sm font-medium">
        Agregar servicio
      </label>
      <input
        ref={inputRef}
        id="service-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setFailed(false);
        }}
        placeholder="Buscá por nombre"
        autoComplete="off"
        aria-controls="service-results"
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
      />
      <div id="service-results" aria-live="polite">
        {failed ? (
          <p role="alert" className="text-sm text-red-700">
            No se pudo buscar servicios. Probá de nuevo.
          </p>
        ) : null}
        {searching ? <p className="text-sm text-slate-600">Buscando…</p> : null}
        {shown && shown.length === 0 ? (
          <p className="text-sm">
            No hay servicios activos que coincidan.{' '}
            <Link
              href="/admin/services/new"
              target="_blank"
              rel="noopener"
              className="font-medium text-orange-800 underline underline-offset-2"
            >
              Cargar un servicio nuevo
            </Link>
          </p>
        ) : null}
        {shown && shown.length > 0 ? (
          <ul
            aria-label="Servicios encontrados"
            className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200"
          >
            {shown.map((service) => (
              <li key={service.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(service);
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="flex w-full flex-wrap justify-between gap-2 px-3 py-2 text-left hover:bg-slate-100"
                >
                  <span>
                    <span className="font-medium">{service.name}</span>{' '}
                    <span className="text-slate-600">
                      · {serviceCategoryLabels[service.category]}
                    </span>
                  </span>
                  <span className="tabular-nums">{formatArs(service.basePriceMinor)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
