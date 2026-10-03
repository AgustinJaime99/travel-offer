'use client';

import {
  adminSchoolRequestSchema,
  type RequestStatus,
  requestStatuses,
  requestStatusLabels,
} from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

export function ReviewForm({
  requestId,
  status,
  staffNotes,
}: {
  requestId: string;
  status: RequestStatus;
  staffNotes: string | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [nextStatus, setNextStatus] = useState(status);
  const [notes, setNotes] = useState(staffNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await apiFetch(`/api/admin/school-requests/${requestId}`, adminSchoolRequestSchema, {
        method: 'PATCH',
        body: { status: nextStatus, staffNotes: notes },
      });
      setSaved(true);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.replace(currentAdminLoginHref());
        return;
      }
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      aria-labelledby="review-title"
      className="max-w-2xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6"
    >
      <fieldset
        disabled={!hydrated || pending}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0"
      >
        <h2 id="review-title" className="text-lg font-semibold text-slate-900">
          Seguimiento
        </h2>
        <FormAlert message={error} />
        {saved ? (
          <p role="status" className="text-sm text-green-800">
            Cambios guardados.
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="status"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as RequestStatus)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          >
            {requestStatuses.map((value) => (
              <option key={value} value={value}>
                {requestStatusLabels[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notas internas
          </label>
          <textarea
            id="notes"
            rows={4}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          />
        </div>
        <div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      </fieldset>
    </form>
  );
}
