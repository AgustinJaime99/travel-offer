'use client';

import { normalizeText, provinceLabels, type School, schoolListSchema } from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

export type SchoolOption = Pick<School, 'id' | 'name' | 'city' | 'province' | 'active'>;

const MIN_QUERY = 2;

/** Searchable selector of active schools (global "new group" path). */
export function SchoolPicker({
  value,
  onChange,
  error,
}: {
  value: SchoolOption | null;
  onChange: (school: SchoolOption | null) => void;
  error?: string | undefined;
}) {
  const id = useId();
  const router = useRouter();
  const searchInput = useRef<HTMLInputElement>(null);
  const changeButton = useRef<HTMLButtonElement>(null);
  // Set when the user picks or clears a school, so focus follows the swapped content (not on mount).
  const moveFocus = useRef(false);
  const [query, setQuery] = useState('');
  // Results are kept with the query that produced them, so stale responses are never shown.
  const [results, setResults] = useState<{ query: string; items: SchoolOption[] } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchable = normalizeText(query).length >= MIN_QUERY;

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, pageSize: '8', status: 'active' });
      apiFetch(`/api/admin/schools?${params.toString()}`, schoolListSchema).then(
        (page) => {
          if (!cancelled) setResults({ query, items: page.items });
        },
        (caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof ApiRequestError && caught.status === 401) {
            router.replace(currentAdminLoginHref());
            return;
          }
          setSearchError('No se pudo buscar colegios. Probá de nuevo.');
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchable, router]);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (value) changeButton.current?.focus();
    else searchInput.current?.focus();
  }, [value]);

  function select(school: SchoolOption | null) {
    moveFocus.current = true;
    onChange(school);
  }

  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Colegio</span>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
          <span>
            <strong>{value.name}</strong> — {value.city}, {provinceLabels[value.province]}
          </span>
          <button
            ref={changeButton}
            type="button"
            onClick={() => select(null)}
            className="text-sm underline"
          >
            Cambiar
          </button>
        </div>
      </div>
    );
  }

  const shown = searchable && results?.query === query ? results.items : null;
  const searching = searchable && !shown && !searchError;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-search`} className="text-sm font-medium">
        Colegio
      </label>
      <input
        ref={searchInput}
        id={`${id}-search`}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSearchError(null);
        }}
        placeholder="Buscá por nombre o CUE"
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-controls={`${id}-results`}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm aria-invalid:border-red-600"
      />
      <p id={`${id}-hint`} className="text-sm text-slate-600">
        Escribí al menos {MIN_QUERY} letras y elegí el colegio de la lista.
      </p>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div id={`${id}-results`} aria-live="polite">
        {searchError ? (
          <p role="alert" className="text-sm text-red-700">
            {searchError}
          </p>
        ) : null}
        {searching ? <p className="text-sm text-slate-600">Buscando…</p> : null}
        {shown && shown.length === 0 ? (
          <p className="text-sm">
            No hay colegios activos que coincidan.{' '}
            <Link
              href="/admin/schools/new"
              className="font-medium text-orange-800 underline underline-offset-2"
            >
              Cargar un colegio nuevo
            </Link>
          </p>
        ) : null}
        {shown && shown.length > 0 ? (
          <ul
            aria-label="Colegios encontrados"
            className="flex flex-col divide-y divide-slate-200 rounded-md border border-slate-200"
          >
            {shown.map((school) => (
              <li key={school.id}>
                <button
                  type="button"
                  onClick={() => select(school)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-100"
                >
                  <span className="font-medium">{school.name}</span>{' '}
                  <span className="text-slate-600">
                    — {school.city}, {provinceLabels[school.province]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
