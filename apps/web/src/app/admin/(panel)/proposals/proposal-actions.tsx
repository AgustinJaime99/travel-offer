'use client';

import { proposalSchema } from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/form';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

type Action = 'create' | 'clone' | 'withdraw';

const labels: Record<Action, string> = {
  create: 'Crear propuesta',
  clone: 'Crear nueva versión',
  withdraw: 'Retirar publicación',
};

/** Version-level actions; each one lands on the resulting proposal. */
export function ProposalActionButton({
  action,
  groupId,
  proposalId,
}: {
  action: Action;
  groupId?: string;
  proposalId?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (
      action === 'withdraw' &&
      !window.confirm(
        '¿Retirar la publicación? Las familias dejarán de verla hasta que publiques otra versión.',
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const proposal =
        action === 'create'
          ? await apiFetch('/api/admin/proposals', proposalSchema, {
              method: 'POST',
              body: { schoolGroupId: groupId },
            })
          : await apiFetch(
              `/api/admin/proposals/${proposalId}/${action === 'clone' ? 'versions' : 'archive'}`,
              proposalSchema,
              { method: 'POST' },
            );
      router.push(`/admin/proposals/${proposal.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.replace(currentAdminLoginHref());
        return;
      }
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={pending}
        className={
          action === 'withdraw'
            ? 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60'
            : 'inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:opacity-60'
        }
      >
        {labels[action]}
      </button>
      <FormAlert message={error} />
    </div>
  );
}
