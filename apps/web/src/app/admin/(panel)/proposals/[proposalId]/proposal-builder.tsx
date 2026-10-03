'use client';

import {
  bpsToPercentInput,
  formatArs,
  installmentTiers,
  minorToArsInput,
  parseArsToMinor,
  parsePercentToBps,
  type PricingResult,
  pricingResultSchema,
  type Proposal,
  proposalSchema,
  type Service,
  serviceCategoryLabels,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { FormAlert } from '@/components/form';
import { PricingBreakdown } from '@/components/pricing-breakdown';
import { useHydrated } from '@/components/use-hydrated';
import { ApiRequestError, apiCall, apiFetch, errorMessage } from '@/lib/api-client';
import { arDayToEndIso, arDayToStartIso, isoToArDay } from '@/lib/format';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';
import { ServicePicker } from './service-picker';
import { MoneyInput } from '@/components/money-input';

interface ItemState {
  serviceId: string;
  serviceName: string;
  serviceCategory: Service['category'];
  pricingUnit: Service['pricingUnit'];
  /**
   * Per-passenger quantities stay at 1 unless staff explicitly changes them (e.g. 3 excursions per
   * student): a quantity is easily mistaken for the number of students.
   */
  quantityUnlocked: boolean;
  catalogUnitPriceMinor: string;
  quantity: string;
  unitPrice: string;
  discount: string;
}

interface BuilderState {
  items: ItemState[];
  commercialDiscount: string;
  downPayment: string;
  installments: string;
  tna: string;
  /** Divisor of the per-group services (only used when there are any). */
  passengers: string;
  validFrom: string;
  validUntil: string;
}

type FieldErrors = Record<string, string>;

/** Older drafts may keep a non-tier maximum until it is changed (the API asks for a tier). */
const isTier = (value: string) => (installmentTiers as readonly number[]).includes(Number(value));

function initialState(proposal: Proposal): BuilderState {
  const plan = proposal.paymentPlan;
  const optionalAmount = (minor: string) => (minor === '0' ? '' : minorToArsInput(minor));
  return {
    items: proposal.items.map((item) => ({
      serviceId: item.serviceId,
      serviceName: item.serviceName,
      serviceCategory: item.serviceCategory,
      pricingUnit: item.pricingUnit,
      quantityUnlocked: item.pricingUnit === 'PER_GROUP' || item.quantity !== 1,
      catalogUnitPriceMinor: item.catalogUnitPriceMinor,
      quantity: String(item.quantity),
      unitPrice: minorToArsInput(item.unitPriceMinor),
      discount: optionalAmount(item.discountMinor),
    })),
    commercialDiscount: optionalAmount(plan.commercialDiscountMinor),
    downPayment: optionalAmount(plan.downPaymentMinor),
    installments: String(plan.installments),
    tna: plan.installments === 0 ? '' : bpsToPercentInput(plan.tnaBps),
    passengers: plan.passengerCount === null ? '' : String(plan.passengerCount),
    validFrom: proposal.validFrom ? isoToArDay(proposal.validFrom) : '',
    validUntil: proposal.validUntil ? isoToArDay(proposal.validUntil) : '',
  };
}

/**
 * Converts what staff typed into API inputs (exact centavos and basis points). Business rules are not
 * checked here: the server preview is the authority and reports them by field.
 */
function parseState(state: BuilderState) {
  const errors: FieldErrors = {};
  const amount = (value: string, path: string, optional: boolean): string => {
    if (optional && value.trim() === '') return '0';
    const minor = parseArsToMinor(value);
    if (minor === null) errors[path] = 'Monto inválido. Ejemplo: 1.250.000,50.';
    return minor?.toString() ?? '0';
  };
  const items = state.items.map((item, index) => {
    const quantity = /^\d{1,3}$/.test(item.quantity.trim()) ? Number(item.quantity.trim()) : NaN;
    if (Number.isNaN(quantity)) errors[`items.${index}.quantity`] = 'Ingresá un número entero.';
    return {
      serviceId: item.serviceId,
      quantity: Number.isNaN(quantity) ? 1 : quantity,
      unitPriceMinor: amount(item.unitPrice, `items.${index}.unitPriceMinor`, false),
      discountMinor: amount(item.discount, `items.${index}.discountMinor`, true),
    };
  });
  const installments = Number(state.installments);
  let tnaBps = 0;
  if (installments > 0) {
    const parsed = parsePercentToBps(state.tna);
    if (parsed === null)
      errors['tnaBps'] = 'Ingresá la TNA en %, por ejemplo 35 o 35,5 (0 si es sin interés).';
    tnaBps = parsed ?? 0;
  }
  let passengerCount: number | null = null;
  if (state.items.some((item) => item.pricingUnit === 'PER_GROUP')) {
    if (/^\d{1,3}$/.test(state.passengers.trim())) passengerCount = Number(state.passengers.trim());
    else errors['passengerCount'] = 'Ingresá entre cuántos pasajeros se divide (de 1 a 999).';
  }
  const plan = {
    commercialDiscountMinor: amount(state.commercialDiscount, 'commercialDiscountMinor', true),
    downPaymentMinor: amount(state.downPayment, 'downPaymentMinor', true),
    installments,
    tnaBps,
    passengerCount,
  };
  return {
    errors,
    preview: {
      items: items.map(({ quantity, unitPriceMinor, discountMinor }, index) => ({
        quantity,
        unitPriceMinor,
        discountMinor,
        pricingUnit: state.items[index]!.pricingUnit,
      })),
      ...plan,
    },
    save: {
      items,
      ...plan,
      validFrom: state.validFrom ? arDayToStartIso(state.validFrom) : null,
      validUntil: state.validUntil ? arDayToEndIso(state.validUntil) : null,
    },
  };
}

/** What families will be offered: cash plus every valid tier, and the tiers left out (and why). */
function OfferOptions({ result }: { result: PricingResult }) {
  if (result.installmentOptions.length === 0 && result.excludedInstallments.length === 0)
    return null;
  return (
    <section
      aria-labelledby="offer-options-title"
      className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
    >
      <h2 id="offer-options-title" className="text-sm font-semibold text-slate-900">
        Opciones que ve la familia
      </h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        <li className="flex justify-between gap-3">
          <span className="text-slate-600">Contado</span>
          <span className="font-medium tabular-nums">{formatArs(result.cashPriceMinor)}</span>
        </li>
        {result.installmentOptions.map((option) => (
          <li key={option.installments} className="flex justify-between gap-3">
            <span className="text-slate-600">{option.installments} cuotas</span>
            <span className="font-medium tabular-nums">
              {formatArs(option.scheduleSummary[0]?.paymentMinor ?? '0')} / mes
            </span>
          </li>
        ))}
      </ul>
      {result.excludedInstallments.length > 0 ? (
        <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-900 ring-1 ring-amber-600/25">
          No se ofrecen {result.excludedInstallments.map((item) => item.installments).join(' ni ')}{' '}
          cuotas: {result.excludedInstallments[0]?.message}
        </p>
      ) : null}
    </section>
  );
}

function issuesToErrors(caught: unknown): FieldErrors | null {
  if (!(caught instanceof ApiRequestError) || !caught.body?.issues) return null;
  return Object.fromEntries(caught.body.issues.map((issue) => [issue.path, issue.message]));
}

function Field({
  id,
  label,
  error,
  hint,
  warn = false,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string | undefined;
  hint?: string;
  /** Shows the hint as a warning (still not an error: the value is valid). */
  warn?: boolean;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint ? (
        <p
          id={`${id}-hint`}
          className={
            warn
              ? 'rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-600/25'
              : 'text-xs text-slate-600'
          }
        >
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClass =
  'rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm aria-invalid:border-red-600';

export function ProposalBuilder({
  proposal,
  estimatedStudents,
}: {
  proposal: Proposal;
  /** Pre-fills the passenger count when the first per-group service is added. */
  estimatedStudents: number | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [state, setState] = useState(() => initialState(proposal));
  const [savedKey, setSavedKey] = useState(() =>
    JSON.stringify(parseState(initialState(proposal)).save),
  );
  const [preview, setPreview] = useState<{
    key: string;
    result: PricingResult | null;
    errors: FieldErrors;
    /** The preview could not be calculated (network, rate limit, server): not a validation issue. */
    failed?: boolean;
  } | null>(null);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const serviceSearch = useRef<HTMLInputElement>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Optimistic concurrency: the version of the draft this editor saw (409 PROPOSAL_CHANGED if stale).
  const [seenUpdatedAt, setSeenUpdatedAt] = useState(proposal.updatedAt);

  const parsed = useMemo(() => parseState(state), [state]);
  const previewKey = JSON.stringify(parsed.preview);
  const hasClientErrors = Object.keys(parsed.errors).length > 0;
  const dirty = JSON.stringify(parsed.save) !== savedKey;

  // Live preview from the server pricing engine, debounced; stale responses are ignored by key.
  useEffect(() => {
    if (hasClientErrors) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch('/api/admin/pricing/preview', pricingResultSchema, {
        method: 'POST',
        body: JSON.parse(previewKey) as object,
      }).then(
        (result) => {
          if (!cancelled) setPreview({ key: previewKey, result, errors: {} });
        },
        (caught: unknown) => {
          if (cancelled) return;
          if (caught instanceof ApiRequestError && caught.status === 401) {
            router.replace(currentAdminLoginHref());
            return;
          }
          const invalid =
            caught instanceof ApiRequestError && (caught.status === 400 || caught.status === 422);
          setPreview({
            key: previewKey,
            result: null,
            errors: issuesToErrors(caught) ?? {},
            failed: !invalid,
          });
        },
      );
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, hasClientErrors, previewAttempt, router]);

  const current = preview?.key === previewKey ? preview : null;
  const errorFor = (path: string) =>
    parsed.errors[path] ?? current?.errors[path] ?? serverErrors[path];

  function update(patch: Partial<BuilderState>) {
    setMessage(null);
    setState((previous) => ({ ...previous, ...patch }));
  }

  function updateItem(index: number, patch: Partial<ItemState>) {
    setMessage(null);
    setState((previous) => ({
      ...previous,
      items: previous.items.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addService(service: Service) {
    const firstGroupCost =
      service.pricingUnit === 'PER_GROUP' &&
      state.passengers === '' &&
      !state.items.some((item) => item.pricingUnit === 'PER_GROUP');
    update({
      ...(firstGroupCost && estimatedStudents ? { passengers: String(estimatedStudents) } : {}),
      items: [
        ...state.items,
        {
          serviceId: service.id,
          serviceName: service.name,
          serviceCategory: service.category,
          pricingUnit: service.pricingUnit,
          quantityUnlocked: service.pricingUnit === 'PER_GROUP',
          catalogUnitPriceMinor: service.basePriceMinor,
          quantity: '1',
          unitPrice: minorToArsInput(service.basePriceMinor),
          discount: '',
        },
      ],
    });
  }

  function fail(caught: unknown) {
    if (caught instanceof ApiRequestError && caught.status === 401) {
      router.replace(currentAdminLoginHref());
      return;
    }
    const fieldErrors = issuesToErrors(caught);
    if (fieldErrors) setServerErrors(fieldErrors);
    setMessage({ kind: 'error', text: errorMessage(caught) });
  }

  /** Saves the draft; returns its new `updatedAt`, or null when it could not be saved. */
  async function save(): Promise<string | null> {
    if (hasClientErrors) {
      setMessage({ kind: 'error', text: 'Corregí los campos marcados antes de guardar.' });
      return null;
    }
    try {
      const saved = await apiFetch(`/api/admin/proposals/${proposal.id}`, proposalSchema, {
        method: 'PUT',
        body: { ...parsed.save, expectedUpdatedAt: seenUpdatedAt },
      });
      setSeenUpdatedAt(saved.updatedAt);
      setSavedKey(JSON.stringify(parsed.save));
      setServerErrors({});
      return saved.updatedAt;
    } catch (caught) {
      fail(caught);
      return null;
    }
  }

  async function run(action: 'save' | 'publish' | 'discard') {
    if (
      action === 'publish' &&
      !window.confirm(
        '¿Publicar esta versión? Las familias del grupo podrán verla y ya no se podrá editar.',
      )
    )
      return;
    if (action === 'discard' && !window.confirm('¿Descartar este borrador? No se puede deshacer.'))
      return;
    setBusy(true);
    setMessage(null);
    try {
      if (action === 'discard') {
        await apiCall(`/api/admin/proposals/${proposal.id}/archive`, { method: 'POST' });
        router.push(`/admin/groups/${proposal.schoolGroup.id}`);
        router.refresh();
        return;
      }
      let expectedUpdatedAt = seenUpdatedAt;
      if (dirty || action === 'save') {
        const savedAt = await save();
        if (!savedAt) return;
        expectedUpdatedAt = savedAt;
      }
      if (action === 'save') {
        setMessage({ kind: 'ok', text: 'Borrador guardado.' });
        return;
      }
      await apiCall(`/api/admin/proposals/${proposal.id}/publish`, {
        method: 'POST',
        body: { expectedUpdatedAt },
      });
      router.refresh();
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  const excluded = new Set(state.items.map((item) => item.serviceId));
  const lines = current?.result?.lines;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <fieldset
        disabled={!hydrated || busy}
        className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0"
      >
        <section aria-labelledby="items-title" className="flex flex-col gap-4">
          <h2 id="items-title" className="text-lg font-semibold text-slate-900">
            Servicios (precios por pasajero)
          </h2>
          {state.items.length === 0 ? (
            <p className="text-slate-600">Todavía no agregaste servicios.</p>
          ) : null}
          {errorFor('items') ? <p className="text-sm text-red-700">{errorFor('items')}</p> : null}
          <ol className="flex flex-col gap-4">
            {state.items.map((item, index) => {
              const perGroup = item.pricingUnit === 'PER_GROUP';
              const unitPrice = parseArsToMinor(item.unitPrice);
              const overridden =
                unitPrice !== null && unitPrice.toString() !== item.catalogUnitPriceMinor;
              return (
                <li
                  key={item.serviceId}
                  className="flex flex-col gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p>
                      <span className="font-medium">{item.serviceName}</span>{' '}
                      <span className="text-sm text-slate-600">
                        · {serviceCategoryLabels[item.serviceCategory]}
                      </span>
                      {perGroup ? (
                        <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900 ring-1 ring-sky-600/20 ring-inset">
                          Costo del grupo
                        </span>
                      ) : null}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        update({ items: state.items.filter((_, position) => position !== index) });
                        serviceSearch.current?.focus();
                      }}
                      className="text-sm underline"
                    >
                      Quitar<span className="sr-only"> {item.serviceName}</span>
                    </button>
                  </div>
                  {errorFor(`items.${index}.serviceId`) ? (
                    <p className="text-sm text-red-700">{errorFor(`items.${index}.serviceId`)}</p>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-3">
                    {item.quantityUnlocked ? (
                      <Field
                        id={`quantity-${index}`}
                        label={
                          <>
                            Cantidad<span className="sr-only"> de {item.serviceName}</span>
                          </>
                        }
                        error={errorFor(`items.${index}.quantity`)}
                        warn={!perGroup && Number(item.quantity) > 1}
                        hint={
                          perGroup
                            ? 'Del grupo'
                            : Number(item.quantity) > 1
                              ? `Ojo: cada alumno paga ${item.quantity} veces este precio. Si es un costo de todo el grupo, usá un servicio "por grupo".`
                              : 'Por alumno'
                        }
                      >
                        {(props) => (
                          <input
                            {...props}
                            inputMode="numeric"
                            value={item.quantity}
                            onChange={(event) =>
                              updateItem(index, { quantity: event.target.value })
                            }
                            className={inputClass}
                          />
                        )}
                      </Field>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">Cantidad</span>
                        <p className="flex min-h-[2.625rem] items-center gap-3 text-sm">
                          <span className="text-slate-900">1 por alumno</span>
                          <button
                            type="button"
                            onClick={() => updateItem(index, { quantityUnlocked: true })}
                            className="font-medium text-orange-800 underline underline-offset-2"
                          >
                            Cambiar<span className="sr-only"> cantidad de {item.serviceName}</span>
                          </button>
                        </p>
                        <p className="text-xs text-slate-600">
                          Solo si cada alumno lleva más de uno (por ejemplo, 3 excursiones).
                        </p>
                      </div>
                    )}
                    <Field
                      id={`unitPrice-${index}`}
                      label={
                        <>
                          {perGroup ? 'Precio del grupo' : 'Precio por pasajero'}
                          <span className="sr-only"> de {item.serviceName}</span>
                        </>
                      }
                      error={errorFor(`items.${index}.unitPriceMinor`)}
                      hint={
                        overridden
                          ? `Modificado (catálogo: ${formatArs(item.catalogUnitPriceMinor)})`
                          : 'Precio de catálogo'
                      }
                    >
                      {(props) => (
                        <MoneyInput
                          {...props}
                          value={item.unitPrice}
                          onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                          className={inputClass}
                        />
                      )}
                    </Field>
                    <Field
                      id={`discount-${index}`}
                      label={
                        <>
                          Descuento<span className="sr-only"> de {item.serviceName}</span>
                        </>
                      }
                      error={errorFor(`items.${index}.discountMinor`)}
                    >
                      {(props) => (
                        <MoneyInput
                          {...props}
                          value={item.discount}
                          placeholder="0"
                          onChange={(event) => updateItem(index, { discount: event.target.value })}
                          className={inputClass}
                        />
                      )}
                    </Field>
                  </div>
                  {lines?.[index] ? (
                    perGroup ? (
                      <p className="flex flex-wrap justify-end gap-x-4 text-right text-sm tabular-nums">
                        <span className="text-slate-600">
                          Importe del grupo: {formatArs(lines[index].lineNetMinor)}
                        </span>
                        <span className="font-semibold">
                          Por alumno: {formatArs(lines[index].perPassengerMinor)}
                        </span>
                      </p>
                    ) : (
                      <p className="text-right text-sm tabular-nums">
                        Importe: {formatArs(lines[index].lineNetMinor)}
                      </p>
                    )
                  ) : null}
                </li>
              );
            })}
          </ol>
          <ServicePicker excludedIds={excluded} onAdd={addService} inputRef={serviceSearch} />
          {state.items.some((item) => item.pricingUnit === 'PER_GROUP') ? (
            <div className="max-w-sm">
              <Field
                id="passengerCount"
                label="Pasajeros para dividir los costos del grupo"
                error={errorFor('passengerCount')}
                hint="Cada costo del grupo se divide por esta cantidad, redondeando hacia arriba al centavo. Queda fija al publicar."
              >
                {(props) => (
                  <input
                    {...props}
                    inputMode="numeric"
                    value={state.passengers}
                    onChange={(event) => update({ passengers: event.target.value })}
                    className={inputClass}
                  />
                )}
              </Field>
            </div>
          ) : null}
        </section>

        <section aria-labelledby="plan-title" className="flex flex-col gap-4">
          <h2 id="plan-title" className="text-lg font-semibold text-slate-900">
            Precio y financiación
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              id="commercialDiscount"
              label="Descuento comercial (ARS)"
              error={errorFor('commercialDiscountMinor')}
            >
              {(props) => (
                <MoneyInput
                  {...props}
                  value={state.commercialDiscount}
                  placeholder="0"
                  onChange={(event) => update({ commercialDiscount: event.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field id="downPayment" label="Anticipo (ARS)" error={errorFor('downPaymentMinor')}>
              {(props) => (
                <MoneyInput
                  {...props}
                  value={state.downPayment}
                  placeholder="0"
                  onChange={(event) => update({ downPayment: event.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field
              id="installments"
              label="Cantidad de cuotas"
              error={errorFor('installments')}
              hint="Máximo de cuotas: la familia ve contado y todas las opciones hasta este máximo."
            >
              {(props) => (
                <select
                  {...props}
                  value={state.installments}
                  onChange={(event) => update({ installments: event.target.value })}
                  className={inputClass}
                >
                  <option value="0">Solo contado (sin cuotas)</option>
                  {installmentTiers.map((count, index) => (
                    <option key={count} value={count}>
                      Hasta {count} cuotas ({installmentTiers.slice(0, index + 1).join(', ')})
                    </option>
                  ))}
                  {state.installments !== '0' && !isTier(state.installments) ? (
                    <option value={state.installments}>
                      {state.installments} cuotas (ya no se ofrece: elegí otra opción)
                    </option>
                  ) : null}
                </select>
              )}
            </Field>
            {state.installments !== '0' ? (
              <Field
                id="tna"
                label="TNA (%)"
                error={errorFor('tnaBps')}
                hint="Tasa nominal anual. 0 = cuotas sin interés. Máximo 66 %."
              >
                {(props) => (
                  <input
                    {...props}
                    inputMode="decimal"
                    value={state.tna}
                    onChange={(event) => update({ tna: event.target.value })}
                    className={inputClass}
                  />
                )}
              </Field>
            ) : null}
            <Field id="validFrom" label="Válida desde (opcional)" error={errorFor('validFrom')}>
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={state.validFrom}
                  onChange={(event) => update({ validFrom: event.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
            <Field
              id="validUntil"
              label="Válida hasta"
              error={errorFor('validUntil')}
              hint="Obligatoria para publicar. Incluye todo ese día."
            >
              {(props) => (
                <input
                  {...props}
                  type="date"
                  value={state.validUntil}
                  onChange={(event) => update({ validUntil: event.target.value })}
                  className={inputClass}
                />
              )}
            </Field>
          </div>
        </section>

        <div className="flex flex-col gap-3">
          {message?.kind === 'error' ? <FormAlert message={message.text} /> : null}
          {message?.kind === 'ok' ? (
            <p role="status" className="text-sm text-green-800">
              {message.text}
            </p>
          ) : null}
          <p className="text-sm text-slate-600" aria-live="polite">
            {dirty ? 'Hay cambios sin guardar.' : 'Todos los cambios están guardados.'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void run('save')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              Guardar borrador
            </button>
            <button
              type="button"
              onClick={() => void run('publish')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:opacity-60"
            >
              Publicar
            </button>
            <button
              type="button"
              onClick={() => void run('discard')}
              className="text-sm text-red-800 underline"
            >
              Descartar borrador
            </button>
            <Link href={`/admin/groups/${proposal.schoolGroup.id}`} className="text-sm underline">
              Volver al grupo
            </Link>
          </div>
        </div>
      </fieldset>

      <aside
        aria-label="Vista previa"
        className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start"
      >
        {current?.result ? (
          <>
            <PricingBreakdown
              pricing={current.result}
              title="Vista previa (calculada por el servidor)"
            />
            <OfferOptions result={current.result} />
          </>
        ) : current?.failed && !hasClientErrors ? (
          <div className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 text-slate-600 p-4">
            <p role="alert" className="text-sm text-red-700">
              No se pudo calcular la vista previa. Probá de nuevo.
            </p>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setPreviewAttempt((attempt) => attempt + 1);
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 text-slate-600 p-4 text-sm text-slate-600">
            {hasClientErrors || (current && !current.result)
              ? 'Corregí los campos marcados para ver el precio.'
              : 'Calculando…'}
          </p>
        )}
      </aside>
    </div>
  );
}
