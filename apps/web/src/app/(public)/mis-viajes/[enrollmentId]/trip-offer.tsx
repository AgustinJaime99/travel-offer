'use client';

import {
  accessCodeInputSchema,
  type EnrollmentOffer,
  enrollmentOfferSchema,
  enrollmentSchema,
  formatArs,
  formatBps,
  type PublicProposal,
  provinceLabels,
  serviceCategoryLabels,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PricingBreakdown } from '@/components/pricing-breakdown';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Icon, type IconName } from '../../icons';
import { PlanCarousel } from './plan-carousel';
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
      return <ProposalView proposal={offer.proposal} back={back} />;
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

const categoryIcons: Record<PublicProposal['items'][number]['serviceCategory'], IconName> = {
  TRANSPORT: 'bus',
  LODGING: 'bed',
  MEALS: 'utensils',
  EXCURSIONS: 'mountain',
  INSURANCE: 'shield',
  OTHER: 'star',
};

/** Short "what's included" checklist shared by both pricing cards. */
function Includes({ items }: { items: PublicProposal['items'] }) {
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {items.map((item) => (
        <li key={item.serviceName} className="flex items-start gap-2.5">
          <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-green-100 text-green-800">
            <Icon name="check" className="size-3.5" />
          </span>
          <span className="leading-snug text-slate-700">
            {item.serviceName}
            {item.quantity > 1 ? (
              <span className="ml-1 text-xs text-slate-500">× {item.quantity}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PlanCard({
  icon,
  name,
  badge,
  featured,
  children,
}: {
  icon: IconName;
  name: string;
  badge?: string | undefined;
  featured: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      aria-label={name}
      className={`relative flex h-full flex-col gap-5 rounded-3xl bg-white p-6 shadow-sm ${
        featured ? 'shadow-lg ring-2 ring-orange-600' : 'ring-1 ring-slate-200'
      }`}
    >
      {badge ? (
        <span className="absolute -top-3 left-6 rounded-full bg-orange-700 px-3 py-1 text-xs font-bold tracking-wide text-white uppercase shadow-sm">
          {badge}
        </span>
      ) : null}
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-orange-50 text-orange-600">
          <Icon name={icon} className="size-5" />
        </span>
        <h3 className="text-lg font-semibold text-slate-900">{name}</h3>
      </div>
      {children}
    </article>
  );
}

/**
 * The published snapshot as a family reads it: two pricing cards (cash and installments) with the key
 * disclosures always visible (price, installments, total, TEA and CFT — Ley 24.240 art. 36), and the
 * line-by-line breakdown and schedule behind "Ver más información". Every amount is per student.
 */
function ProposalView({ proposal, back }: { proposal: PublicProposal; back: React.ReactNode }) {
  const { pricing } = proposal;
  const [firstRun, ...otherRuns] = pricing.scheduleSummary;
  const financed = pricing.installments > 0 && firstRun !== undefined;
  const extraForInstallments = BigInt(pricing.totalPayableMinor) - BigInt(pricing.cashPriceMinor);
  const cashIsCheaper = financed && extraForInstallments > 0n;
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

      <section aria-labelledby="plans-title" className="flex flex-col gap-4">
        <div>
          <h2 id="plans-title" className="text-lg font-semibold text-slate-900">
            Elegí cómo pagar
          </h2>
          <p className="text-sm text-slate-600">Precios por alumno, con impuestos incluidos.</p>
        </div>
        <PlanCarousel
          label="Opciones de pago"
          initial={cashIsCheaper || !financed ? 0 : 1}
          slides={[
            {
              key: 'cash',
              label: 'Pago de contado',
              node: (
                <PlanCard
                  icon="star"
                  name="Pago de contado"
                  badge={cashIsCheaper ? 'Mejor precio' : undefined}
                  featured={cashIsCheaper || !financed}
                >
                  <div>
                    <p className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                      <span className="whitespace-nowrap">{formatArs(pricing.cashPriceMinor)}</span>
                    </p>
                    <p className="text-sm text-slate-600">en un solo pago</p>
                  </div>
                  {cashIsCheaper ? (
                    <p className="flex items-center gap-2.5 rounded-2xl bg-green-50 px-3.5 py-3 text-sm text-green-900 ring-1 ring-green-600/20">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-green-600 text-white">
                        <Icon name="check" className="size-4" />
                      </span>
                      <span>
                        Ahorrás{' '}
                        <strong className="font-bold whitespace-nowrap">
                          {formatArs(extraForInstallments.toString())}
                        </strong>{' '}
                        pagando de contado
                      </span>
                    </p>
                  ) : null}
                  <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                    <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                      Incluye
                    </p>
                    <Includes items={proposal.items} />
                  </div>
                </PlanCard>
              ),
            },
            ...(financed
              ? [
                  {
                    key: 'installments',
                    label: `En ${pricing.installments} cuotas`,
                    node: (
                      <PlanCard
                        icon="refresh"
                        name={`En ${pricing.installments} ${pricing.installments === 1 ? 'cuota' : 'cuotas'}`}
                        badge={pricing.tnaBps === 0 ? 'Sin interés' : undefined}
                        featured={!cashIsCheaper}
                      >
                        <div>
                          <p className="text-[1.75rem] leading-tight font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                            <span className="whitespace-nowrap">
                              {formatArs(firstRun.paymentMinor)}
                            </span>
                          </p>
                          <p className="text-sm text-slate-600">
                            por mes · {firstRun.count} {firstRun.count === 1 ? 'cuota' : 'cuotas'}
                            {otherRuns
                              .map((run) => ` y ${run.count} de ${formatArs(run.paymentMinor)}`)
                              .join('')}
                            {pricing.downPaymentMinor !== '0'
                              ? `, más un anticipo de ${formatArs(pricing.downPaymentMinor)}`
                              : ', sin anticipo'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
                          {/* The CFT leads, larger than the other rates (BCRA disclosure). */}
                          <p className="flex items-baseline justify-between gap-3">
                            <span className="flex flex-col">
                              <span className="text-sm font-semibold text-slate-900">CFT</span>
                              <span className="text-xs text-slate-500">Costo financiero total</span>
                            </span>
                            <span className="text-2xl font-extrabold whitespace-nowrap text-slate-900 tabular-nums">
                              {formatBps(pricing.cftBps)}
                            </span>
                          </p>
                          <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200/70 pt-2 text-xs text-slate-500">
                            <span className="whitespace-nowrap">
                              TNA{' '}
                              <span className="font-semibold text-slate-700 tabular-nums">
                                {formatBps(pricing.tnaBps)}
                              </span>
                            </span>
                            <span className="whitespace-nowrap">
                              TEA{' '}
                              <span className="font-semibold text-slate-700 tabular-nums">
                                {formatBps(pricing.teaBps)}
                              </span>
                            </span>
                          </p>
                        </div>
                        <p className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-3 text-sm">
                          <span className="text-slate-600">Total en cuotas</span>
                          <span className="text-base font-bold whitespace-nowrap text-slate-900 tabular-nums">
                            {formatArs(pricing.totalPayableMinor)}
                          </span>
                        </p>
                        <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                            Incluye
                          </p>
                          <Includes items={proposal.items} />
                        </div>
                      </PlanCard>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </section>

      <details className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Icon name="info" className="size-5 text-orange-600" />
            <span className="group-open:hidden">Ver más información</span>
            <span className="hidden group-open:inline">Ocultar información</span>
          </span>
          <span
            aria-hidden="true"
            className="text-slate-400 transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>
        <div className="flex flex-col gap-6 border-t border-slate-100 px-5 py-5">
          <section aria-labelledby="services-title" className="flex flex-col gap-3">
            <h2 id="services-title" className="text-base font-semibold text-slate-900">
              Qué incluye y cuánto cuesta cada servicio
            </h2>
            <ul className="flex flex-col divide-y divide-slate-100">
              {proposal.items.map((item) => (
                <li key={item.serviceName} className="flex items-center gap-3 py-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                    <Icon name={categoryIcons[item.serviceCategory]} className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium text-slate-900">{item.serviceName}</span>
                    <span className="text-xs text-slate-500">
                      {serviceCategoryLabels[item.serviceCategory]}
                      {item.sharedCost ? ' · costo compartido del grupo: tu parte' : ''}
                      {item.quantity > 1
                        ? ` · ${item.quantity} × ${formatArs(item.unitPriceMinor)}`
                        : ''}
                      {item.discountMinor !== '0'
                        ? ` · con descuento de ${formatArs(item.discountMinor)}`
                        : ''}
                    </span>
                  </span>
                  <span className="text-right font-semibold text-slate-900 tabular-nums">
                    {formatArs(item.lineNetMinor)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <PricingBreakdown pricing={pricing} title="Detalle del precio por alumno" />
        </div>
      </details>

      <div className="flex items-start gap-3 rounded-2xl bg-slate-100/80 p-4 text-sm text-slate-700">
        <Icon name="info" className="mt-0.5 size-5 shrink-0 text-orange-600" />
        <p>
          Esta propuesta es informativa: no es una reserva, un contrato ni un compromiso de pago.
          Para avanzar, hablá con tu asesor de Travel Rock.
        </p>
      </div>
      {back}
    </StepShell>
  );
}
