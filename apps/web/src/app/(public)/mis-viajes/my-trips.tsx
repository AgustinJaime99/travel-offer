'use client';

import { type Enrollment, enrollmentListSchema } from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { StepShell } from '../onboarding/steps/step-shell';
import { SignOutButton } from '../sign-out-button';

const stateLabels: Record<Enrollment['offerState'], string> = {
  AVAILABLE: 'Propuesta disponible',
  PREPARING: 'Propuesta en preparación',
  CODE_REQUIRED: 'Falta el código del grupo',
};

export function MyTrips() {
  const router = useRouter();
  const [items, setItems] = useState<Enrollment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/public/enrollments', enrollmentListSchema).then(
      (list) => {
        if (!cancelled) setItems(list.items);
      },
      (caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof ApiRequestError && caught.status === 401) router.replace('/ingresar');
        else setError(errorMessage(caught));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  return (
    <StepShell title="Mis viajes">
      {error ? (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-red-700">
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
      {items && items.length === 0 ? <p>Todavía no registraste a ningún alumno.</p> : null}
      {items && items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((enrollment) => (
            <li key={enrollment.id}>
              <Link
                href={`/mis-viajes/${enrollment.id}`}
                className="block rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300 hover:bg-orange-50"
              >
                <span className="block font-medium">
                  {enrollment.studentFirstName} {enrollment.studentLastName}
                </span>
                <span className="block text-sm text-slate-700">
                  {enrollment.group.name} · {enrollment.school.name} · viaje{' '}
                  {enrollment.group.travelYear}
                </span>
                <span className="mt-1 block text-sm font-medium">
                  {stateLabels[enrollment.offerState]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href="/onboarding?paso=alumno"
        className="inline-flex min-h-11 items-center self-start text-sm underline"
      >
        Registrar a otro alumno
      </Link>
      {items || error ? <SignOutButton className="self-start" /> : null}
    </StepShell>
  );
}
