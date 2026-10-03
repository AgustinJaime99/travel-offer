'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/form';
import { ApiRequestError, apiCall, errorMessage } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

/** PATCHes a resource (e.g. activate/deactivate), optionally after a confirmation, then refreshes the page. */
export function PatchButton({
  path,
  body,
  label,
  confirmMessage,
}: {
  path: string;
  body: object;
  label: string;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(true);
    setError(null);
    try {
      await apiCall(path, { method: 'PATCH', body });
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
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
      >
        {label}
      </button>
      <FormAlert message={error} />
    </>
  );
}
