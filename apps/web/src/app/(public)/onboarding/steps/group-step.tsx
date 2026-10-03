'use client';

import { type PublicGroup, publicGroupListSchema, type PublicSchool } from '@travel-rock/shared';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { RequestForm } from './request-form';

export function GroupStep({
  school,
  selected,
  onSelect,
  onUnauthenticated,
}: {
  school: PublicSchool;
  selected: PublicGroup | null;
  onSelect: (group: PublicGroup) => void;
  onUnauthenticated: () => void;
}) {
  const [groups, setGroups] = useState<{ schoolId: string; items: PublicGroup[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/public/schools/${school.id}/groups`, publicGroupListSchema).then(
      (page) => {
        if (!cancelled) setGroups({ schoolId: school.id, items: page.items });
      },
      (caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiRequestError && caught.status === 401) onUnauthenticated();
        else setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [school.id, onUnauthenticated, reloadKey]);

  const items = groups?.schoolId === school.id ? groups.items : null;
  if (reporting) {
    return (
      <RequestForm
        target={{ type: 'GROUP_NOT_FOUND', schoolId: school.id, schoolName: school.name }}
        onCancel={() => setReporting(false)}
        onUnauthenticated={onUnauthenticated}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p>
        Grupos de <strong>{school.name}</strong>:
      </p>
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setReloadKey((key) => key + 1);
            }}
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 hover:border-orange-300 hover:bg-orange-50"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {items === null && !error ? <p>Cargando…</p> : null}
      {items && items.length === 0 ? (
        <p>Este colegio todavía no tiene grupos habilitados.</p>
      ) : null}
      {items && items.length > 0 ? (
        <ul aria-label="Grupos del colegio" className="flex flex-col gap-2">
          {items.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onSelect(group)}
                aria-pressed={selected?.id === group.id}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left hover:border-orange-300 hover:bg-orange-50 aria-pressed:border-orange-500 aria-pressed:bg-orange-50"
              >
                <span className="font-medium">{group.name}</span>{' '}
                <span className="text-slate-600">· viaje {group.travelYear}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {items || error ? (
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="inline-flex min-h-11 items-center self-start underline"
        >
          No encuentro mi grupo
        </button>
      ) : null}
    </div>
  );
}
