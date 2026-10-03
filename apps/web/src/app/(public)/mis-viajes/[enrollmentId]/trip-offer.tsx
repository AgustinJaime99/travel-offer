'use client';

import {
  accessCodeInputSchema,
  type EnrollmentOffer,
  enrollmentOfferSchema,
  enrollmentSchema,
  type PublicProposal,
  provinceLabels,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Icon } from '../../icons';
import { PaymentOptions } from './payment-options';
import { StepShell } from '../../onboarding/steps/step-shell';
import { SignOutButton } from '../../sign-out-button';

export function TripOffer({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [offer, setOffer] = useState<EnrollmentOffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch(
      `/api/public/enrollments/${encodeURIComponent(enrollmentId)}/proposal`,
      enrollmentOfferSchema,
    ).then(
      (result) => {
        if (!cancelled) setOffer(result);
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
  }, [enrollmentId, reloadKey, router]);

  const back = (
    <div className="flex flex-wrap items-center gap-x-6">
      <Link href="/mis-viajes" className="inline-flex min-h-11 items-center text-sm underline">
        ← Mis viajes
      </Link>
      <SignOutButton />
    </div>
  );
  if (error) {
    return (
      <StepShell title="Propuesta del viaje">
        <p role="alert" className="text-red-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setReloadKey((key) => key + 1);
          }}
          className="inline-flex min-h-11 items-center self-start rounded-xl border border-slate-200 bg-white px-4 hover:border-orange-300 hover:bg-orange-50"
        >
          Reintentar
        </button>
        {back}
      </StepShell>
    );
  }
  if (!offer) return <p className="py-12 text-center text-slate-600">Cargando…</p>;

  switch (offer.state) {
    case 'CODE_REQUIRED':
      return (
        <StepShell title="Ingresá el código del grupo">
          <p>
            Registramos tu interés. Para ver la propuesta, ingresá el código que te dio tu asesor de
            Travel Rock.
          </p>
          <AccessCodeForm
            enrollmentId={enrollmentId}
            onGranted={() => setReloadKey((key) => key + 1)}
          />
          {back}
        </StepShell>
      );
    case 'PREPARING':
      return (
        <StepShell title="Tu propuesta se está preparando">
          <p>
            Todavía no hay una propuesta publicada para este grupo. Volvé a consultar más adelante.
          </p>
          {back}
        </StepShell>
      );
    case 'AVAILABLE':
      return (
        <ProposalView
          enrollmentId={enrollmentId}
          proposal={offer.proposal}
          preferredInstallments={offer.preferredInstallments}
          back={back}
        />
      );
  }
}

function AccessCodeForm({
  enrollmentId,
  onGranted,
}: {
  enrollmentId: string;
  onGranted: () => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    const parsed = accessCodeInputSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Código inválido.');
      input.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiFetch(
        `/api/public/enrollments/${encodeURIComponent(enrollmentId)}/access-code`,
        enrollmentSchema,
        { method: 'POST', body: { code } },
      );
      onGranted();
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.replace('/ingresar');
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
        void submit();
      }}
      className="flex flex-col gap-3"
    >
      {error ? (
        <p
          id="code-error"
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <label htmlFor="code" className="text-sm font-medium">
        Código del grupo
      </label>
      <input
        ref={input}
        id="code"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="ABCD-EFGH"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'code-error' : undefined}
        className="rounded-xl border border-slate-200 bg-white px-3 py-3 uppercase aria-invalid:border-red-600"
      />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 text-[1.1875rem] font-bold text-white hover:bg-orange-700 disabled:opacity-60 sm:w-auto"
      >
        {pending ? 'Verificando…' : 'Ver la propuesta'}
      </button>
    </form>
  );
}

/**
 * The published snapshot as a family reads it: the payment options (cash and every installment
 * option, with their disclosures) and what the trip includes. Every amount is per student.
 */
function ProposalView({
  enrollmentId,
  proposal,
  preferredInstallments,
  back,
}: {
  enrollmentId: string;
  proposal: PublicProposal;
  preferredInstallments: number | null;
  back: React.ReactNode;
}) {
  return (
    <StepShell title={`Propuesta para ${proposal.group.name}`} icon="luggage">
      <div className="-mt-2 flex flex-col gap-2">
        <p className="text-slate-600">
          {proposal.school.name} · {proposal.school.city},{' '}
          {provinceLabels[proposal.school.province]} · viaje {proposal.group.travelYear}
        </p>
        <p className="inline-flex items-center gap-2 self-start rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-800 ring-1 ring-green-600/20">
          <Icon name="check" className="size-4" />
          Válida {proposal.validFrom ? `desde el ${formatDate(proposal.validFrom)} ` : ''}hasta el{' '}
          {formatDate(proposal.validUntil)}
        </p>
      </div>
      <PaymentOptions
        enrollmentId={enrollmentId}
        proposal={proposal}
        preferredInstallments={preferredInstallments}
      />
      {back}
    </StepShell>
  );
}
