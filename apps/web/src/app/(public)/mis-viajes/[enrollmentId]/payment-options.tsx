'use client';

import {
  formatArs,
  formatBps,
  type InstallmentOption,
  planPreferenceSchema,
  type PublicProposal,
  serviceCategoryLabels,
} from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { PricingBreakdown } from '@/components/pricing-breakdown';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { Icon, type IconName } from '../../icons';
import { PlanCarousel } from './plan-carousel';

const categoryIcons: Record<PublicProposal['items'][number]['serviceCategory'], IconName> = {
  TRANSPORT: 'bus',
  LODGING: 'bed',
  MEALS: 'utensils',
  EXCURSIONS: 'mountain',
  INSURANCE: 'shield',
  OTHER: 'star',
};

// Decorative header photos: the same trip photo, framed differently for each option.
const photoPositions = ['18% 60%', '62% 70%', '85% 55%', '45% 40%', '30% 75%', '75% 35%'];

const plural = (count: number) => (count === 1 ? 'cuota' : 'cuotas');

/** Cash (0) plus one card per installment option; older publications have a single plan. */
function optionsOf(pricing: PublicProposal['pricing']): InstallmentOption[] {
  if (pricing.installmentOptions.length > 0) return pricing.installmentOptions;
  if (pricing.installments === 0) return [];
  return [
    {
      installments: pricing.installments,
      tnaBps: pricing.tnaBps,
      teaBps: pricing.teaBps,
      cftBps: pricing.cftBps,
      financedPrincipalMinor: pricing.financedPrincipalMinor,
      schedule: pricing.schedule,
      scheduleSummary: pricing.scheduleSummary,
      totalInstallmentsMinor: pricing.totalInstallmentsMinor,
      totalInterestMinor: pricing.totalInterestMinor,
      totalPayableMinor: pricing.totalPayableMinor,
    },
  ];
}

function taglineFor(installments: number, all: InstallmentOption[]): string {
  const counts = all.map((option) => option.installments);
  if (counts.length > 1 && installments === Math.max(...counts)) return 'La cuota más baja';
  if (counts.length > 1 && installments === Math.min(...counts)) return 'Menos intereses';
  return 'Un equilibrio ideal';
}

/**
 * "Formas de pago": selectable pricing cards (cash and every installment option) in a carousel,
 * what the trip includes, and "Me interesa esta opción" — an expression of interest the advisor
 * sees, never an acceptance. Price, installments, total, TEA and CFT stay visible on every card.
 */
export function PaymentOptions({
  enrollmentId,
  proposal,
  preferredInstallments,
}: {
  enrollmentId: string;
  proposal: PublicProposal;
  preferredInstallments: number | null;
}) {
  const router = useRouter();
  const name = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const { pricing } = proposal;
  const options = optionsOf(pricing);
  const largest = options.at(-1);
  const choices = [0, ...options.map((option) => option.installments)];
  const [selected, setSelected] = useState(
    preferredInstallments !== null && choices.includes(preferredInstallments)
      ? preferredInstallments
      : (largest?.installments ?? 0),
  );
  const [saved, setSaved] = useState(preferredInstallments);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedOption = options.find((option) => option.installments === selected);
  const savings = largest ? BigInt(largest.totalPayableMinor) - BigInt(pricing.cashPriceMinor) : 0n;
  const choiceLabel = (installments: number) =>
    installments === 0 ? 'pagar de contado' : `pagar en ${installments} ${plural(installments)}`;

  async function savePreference() {
    setPending(true);
    setError(null);
    try {
      const result = await apiFetch(
        `/api/public/enrollments/${encodeURIComponent(enrollmentId)}/preference`,
        planPreferenceSchema,
        { method: 'PUT', body: { installments: selected } },
      );
      setSaved(result.installments);
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

  const openDetails = () => {
    if (!details.current) return;
    details.current.open = true;
    details.current.scrollIntoView({ block: 'start' });
  };

  const card = (installments: number, index: number) => {
    const option = options.find((item) => item.installments === installments);
    const isSelected = selected === installments;
    const title = option ? `En ${installments} ${plural(installments)}` : 'Contado';
    const subtitle = option ? taglineFor(installments, options) : 'Pago único';
    const [firstRun, ...otherRuns] = option?.scheduleSummary ?? [];
    return (
      <label
        className={`relative flex h-full cursor-pointer flex-col overflow-hidden rounded-3xl bg-white transition-shadow duration-300 has-focus-visible:ring-4 has-focus-visible:ring-orange-200 motion-reduce:transition-none ${
          isSelected ? 'shadow-xl ring-2 ring-orange-600' : 'shadow-sm ring-1 ring-slate-200'
        }`}
      >
        <input
          type="radio"
          name={name}
          value={installments}
          checked={isSelected}
          onChange={() => setSelected(installments)}
          aria-label={
            option
              ? `${title}: ${formatArs(firstRun?.paymentMinor ?? '0')} por mes, total ${formatArs(option.totalPayableMinor)}, CFT ${formatBps(option.cftBps)}`
              : `Contado: ${formatArs(pricing.cashPriceMinor)} en un pago`
          }
          className="sr-only"
        />
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-orange-50 text-orange-600">
            <Icon name={option ? 'refresh' : 'star'} className="size-5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-lg leading-tight font-bold text-slate-900">{title}</span>
            <span className="text-sm text-slate-500">{subtitle}</span>
          </span>
          <span
            aria-hidden="true"
            className={`grid size-7 shrink-0 place-items-center rounded-full ${
              isSelected ? 'bg-orange-600 text-white' : 'ring-2 ring-slate-300'
            }`}
          >
            {isSelected ? <Icon name="check" className="size-4" /> : null}
          </span>
        </div>
        <div
          aria-hidden="true"
          className="public-hero-photo h-28"
          style={{ backgroundPosition: photoPositions[index % photoPositions.length] }}
        />
        <div className="-mt-5 flex flex-1 flex-col gap-3 rounded-t-3xl bg-white px-5 pt-4 pb-5">
          {option && firstRun ? (
            <>
              <p className="flex flex-col">
                <span className="text-[1.75rem] leading-tight font-extrabold tracking-tight whitespace-nowrap text-slate-900">
                  <span className="mr-1 text-base font-semibold text-slate-500">
                    {installments} ×
                  </span>
                  {formatArs(firstRun.paymentMinor)}
                </span>
                <span className="text-sm text-slate-500">
                  por mes
                  {/* Rounding can make the last installment(s) differ by centavos. */}
                  {otherRuns.map((run) =>
                    run.count === 1
                      ? ` · la última de ${formatArs(run.paymentMinor)}`
                      : ` · las últimas ${run.count} de ${formatArs(run.paymentMinor)}`,
                  )}
                  {pricing.downPaymentMinor !== '0'
                    ? ` · anticipo ${formatArs(pricing.downPaymentMinor)}`
                    : ''}
                </span>
              </p>
              <div className="mt-auto flex flex-col gap-2.5 border-t border-slate-100 pt-3">
                <p className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-slate-500">Total en {installments} cuotas</span>
                  <span className="text-base font-bold whitespace-nowrap text-slate-900 tabular-nums">
                    {formatArs(option.totalPayableMinor)}
                  </span>
                </p>
                {/* The CFT leads, larger than the other rates (BCRA disclosure). */}
                <p className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/60">
                  <span className="text-sm font-bold whitespace-nowrap text-slate-900">
                    CFT {formatBps(option.cftBps)}
                  </span>
                  <span className="text-xs whitespace-nowrap text-slate-500">
                    TNA {formatBps(option.tnaBps)} · TEA {formatBps(option.teaBps)}
                  </span>
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="flex flex-col">
                <span className="text-[1.75rem] leading-tight font-extrabold tracking-tight whitespace-nowrap text-slate-900">
                  {formatArs(pricing.cashPriceMinor)}
                </span>
                <span className="text-sm text-slate-500">en un solo pago</span>
              </p>
              {savings > 0n ? (
                <p className="mt-auto flex items-center gap-2.5 rounded-2xl bg-green-50 px-3.5 py-3 text-sm text-green-900 ring-1 ring-green-600/20">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-green-600 text-white">
                    <Icon name="check" className="size-4" />
                  </span>
                  <span>
                    Ahorrás{' '}
                    <strong className="font-bold whitespace-nowrap">
                      {formatArs(savings.toString())}
                    </strong>{' '}
                    pagando de contado
                  </span>
                </p>
              ) : null}
            </>
          )}
          {isSelected ? (
            <button
              type="button"
              onClick={openDetails}
              className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200/70 hover:bg-orange-50"
            >
              <span className="flex items-center gap-2">
                <Icon name="clipboard" className="size-4 text-slate-500" />
                Ver detalle financiero
              </span>
              <Icon name="arrowRight" className="size-4" />
            </button>
          ) : null}
        </div>
      </label>
    );
  };

  return (
    <>
      <section aria-labelledby="plans-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold tracking-[0.18em] text-orange-700 uppercase">
              Formas de pago
            </p>
            <h2 id="plans-title" className="text-2xl font-extrabold tracking-tight text-slate-900">
              Elegí la opción que mejor te quede
            </h2>
            <p className="text-sm text-slate-600">
              Precio final por alumno, con impuestos incluidos.
            </p>
          </div>
          <p className="flex items-start gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200/70 sm:max-w-64">
            <Icon name="luggage" className="mt-0.5 size-4 shrink-0 text-orange-600" />
            <span>
              <strong className="font-semibold text-slate-900">
                Mismo viaje en todas las opciones.
              </strong>{' '}
              Solo cambia la forma de pago.
            </span>
          </p>
        </div>
        <div role="radiogroup" aria-labelledby="plans-title">
          <PlanCarousel
            label="Opciones de pago"
            initial={choices.indexOf(selected)}
            focusIndex={choices.indexOf(selected)}
            slides={choices.map((installments, index) => ({
              key: String(installments),
              label: installments === 0 ? 'Contado' : `${installments} ${plural(installments)}`,
              node: card(installments, index),
            }))}
          />
        </div>
      </section>

      <section
        aria-labelledby="includes-title"
        className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
              <Icon name="luggage" className="size-5" />
            </span>
            <span className="flex flex-col">
              <h2 id="includes-title" className="font-bold text-slate-900">
                Tu viaje incluye
              </h2>
              <span className="text-xs text-slate-500">Lo mismo en todas las opciones</span>
            </span>
          </div>
          <button
            type="button"
            onClick={openDetails}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium whitespace-nowrap text-orange-800 hover:bg-orange-50"
          >
            Ver detalle
            <Icon name="arrowRight" className="size-4" />
          </button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {proposal.items.map((item) => (
            <li
              key={item.serviceName}
              className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5 text-sm text-slate-700"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-orange-600 shadow-sm">
                <Icon name={categoryIcons[item.serviceCategory]} className="size-5" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="leading-snug font-medium text-slate-900">{item.serviceName}</span>
                <span className="text-xs text-slate-500">
                  {serviceCategoryLabels[item.serviceCategory]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => void savePreference()}
          disabled={pending}
          className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-2xl bg-orange-600 px-6 py-3.5 text-[1.1875rem] font-bold text-white shadow-lg shadow-orange-600/25 hover:bg-orange-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 disabled:opacity-60"
        >
          {pending
            ? 'Guardando…'
            : saved === selected
              ? `Te interesa ${selected === 0 ? 'pagar de contado' : `${selected} cuotas`}`
              : `Me interesa ${selected === 0 ? 'pagar de contado' : `en ${selected} cuotas`}`}
          {saved === selected && !pending ? (
            <Icon name="check" className="size-5" />
          ) : (
            <Icon name="arrowRight" className="size-5" />
          )}
        </button>
        <p role="status" className="text-center text-sm text-green-800">
          {saved !== null && saved === selected
            ? `Le avisamos a tu asesor que te interesa ${choiceLabel(saved)}.`
            : ''}
        </p>
        {error ? (
          <p role="alert" className="text-center text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <p className="flex items-center gap-1.5 text-center text-xs text-slate-500">
          <Icon name="lock" className="size-3.5" />
          No es una reserva ni un compromiso de pago: tu asesor te contacta para avanzar.
        </p>
      </div>

      <details
        ref={details}
        className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70"
      >
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
          {selectedOption ? (
            <PricingBreakdown
              pricing={{ ...pricing, ...selectedOption }}
              title={`Detalle en ${selectedOption.installments} ${plural(selectedOption.installments)} (por alumno)`}
            />
          ) : (
            <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
              De contado pagás <strong>{formatArs(pricing.cashPriceMinor)}</strong> por alumno, en
              un solo pago, con impuestos incluidos.
            </p>
          )}
        </div>
      </details>
    </>
  );
}
