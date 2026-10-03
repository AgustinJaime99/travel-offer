'use client';

import { accessCodeResponseSchema } from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormAlert } from '@/components/form';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

/** Generates or rotates the group access code (B7). The plaintext is shown only here, once. */
export function AccessCodePanel({
  groupId,
  configured,
  rotatedAtLabel,
  canEdit,
}: {
  groupId: string;
  configured: boolean;
  rotatedAtLabel: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (
      configured &&
      !window.confirm(
        '¿Generar un código nuevo? El código actual dejará de servir para nuevas inscripciones.',
      )
    ) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { accessCode } = await apiFetch(
        `/api/admin/school-groups/${groupId}/access-code`,
        accessCodeResponseSchema,
        {
          method: 'POST',
        },
      );
      setCode(accessCode);
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
    <section
      aria-labelledby="access-code-title"
      className="flex max-w-xl flex-col gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5"
    >
      <h2 id="access-code-title" className="text-lg font-semibold text-slate-900">
        Código de acceso
      </h2>
      <p className="text-sm text-slate-700">
        Las familias lo ingresan para ver la propuesta de este grupo. Compartilo solo con el grupo.
      </p>
      <p>
        {configured
          ? `Configurado${rotatedAtLabel ? ` (generado el ${rotatedAtLabel})` : ''}.`
          : 'Todavía no tiene código.'}
      </p>
      {code ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 p-3"
        >
          <p>
            Código nuevo:{' '}
            <code
              className="rounded bg-white px-2 py-1 font-mono text-lg tracking-widest"
              data-testid="access-code"
            >
              {code}
            </code>
          </p>
          <p className="text-sm">
            Anotalo ahora: no se vuelve a mostrar. Si se pierde, generá uno nuevo.
          </p>
        </div>
      ) : null}
      <FormAlert message={error} />
      {canEdit ? (
        <div>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
          >
            {configured ? 'Generar código nuevo' : 'Generar código'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
