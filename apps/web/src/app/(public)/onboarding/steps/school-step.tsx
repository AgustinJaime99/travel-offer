'use client';

import {
  normalizeText,
  type Province,
  provinceLabels,
  type PublicSchool,
  publicSchoolListSchema,
} from '@travel-rock/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { RequestForm } from './request-form';

const MIN_QUERY = 3;

export function SchoolStep({
  location,
  selected,
  onSelect,
  onUnauthenticated,
}: {
  location: { province: Province; city: string };
  selected: PublicSchool | null;
  onSelect: (school: PublicSchool) => void;
  onUnauthenticated: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ query: string; items: PublicSchool[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const searchable = normalizeText(query).length >= MIN_QUERY;

  useEffect(() => {
    if (!searchable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, province: location.province });
      if (location.city) params.set('city', location.city);
      apiFetch(`/api/public/schools?${params.toString()}`, publicSchoolListSchema).then(
        (page) => {
          if (!cancelled) setResults({ query, items: page.items });
        },
        (caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof ApiRequestError && caught.status === 401) onUnauthenticated();
          else setError(errorMessage(caught));
        },
      );
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, searchable, location.province, location.city, onUnauthenticated]);

  const shown = searchable && results?.query === query ? results.items : null;
  const searching = searchable && !shown && !error;
  if (reporting) {
    return (
      <RequestForm
        target={{ type: 'SCHOOL_NOT_FOUND', province: location.province, city: location.city }}
        onCancel={() => setReporting(false)}
        onUnauthenticated={onUnauthenticated}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-700">
        Buscando en {location.city ? `${location.city}, ` : ''}
        {provinceLabels[location.province]}.
      </p>
      {selected ? (
        <p>
          Elegiste <strong>{selected.name}</strong> ({selected.city}).
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="school-search" className="text-sm font-medium">
          Nombre del colegio
        </label>
        <input
          id="school-search"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
          }}
          autoComplete="off"
          aria-describedby="school-search-hint"
          aria-controls="school-results"
          className="rounded-xl border border-slate-200 bg-white px-3 py-3"
        />
        <p id="school-search-hint" className="text-sm text-slate-600">
          Escribí al menos {MIN_QUERY} letras.
        </p>
      </div>
      <div id="school-results" aria-live="polite" className="flex flex-col gap-2">
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {searching ? <p className="text-sm text-slate-600">Buscando…</p> : null}
        {shown && shown.length === 0 ? (
          <p>
            No encontramos colegios con ese nombre. Revisá la búsqueda, la provincia o la localidad.
          </p>
        ) : null}
        {shown && shown.length > 0 ? (
          <ul aria-label="Colegios encontrados" className="flex flex-col gap-2">
            {shown.map((school) => (
              <li key={school.id}>
                <button
                  type="button"
                  onClick={() => onSelect(school)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50"
                >
                  <span className="block font-medium">{school.name}</span>
                  <span className="text-sm text-slate-600">
                    {school.city}, {provinceLabels[school.province]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="button" onClick={() => setReporting(true)} className="self-start underline">
        No encuentro mi colegio
      </button>
    </div>
  );
}
