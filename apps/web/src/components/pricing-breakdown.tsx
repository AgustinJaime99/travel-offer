import { formatArs, formatBps, type PricingResult } from '@travel-rock/shared';

type Pricing = Omit<
  PricingResult,
  'lines' | 'passengerCount' | 'installmentOptions' | 'excludedInstallments'
>;

/** "17 cuotas de $ 173.273,76 y 1 de $ 173.273,77": never a single rounded amount when they differ. */
export function scheduleSummaryText(pricing: Pricing): string {
  return pricing.scheduleSummary
    .map((run, index) => {
      const amount = formatArs(run.paymentMinor);
      if (index === 0) return `${run.count} ${run.count === 1 ? 'cuota' : 'cuotas'} de ${amount}`;
      return `${run.count} de ${amount}`;
    })
    .join(' y ');
}

function amortization(pricing: Pricing): string {
  if (pricing.installments === 0) return 'De contado';
  return pricing.tnaBps === 0 ? 'Cuotas sin interés' : 'Francés (cuota fija)';
}

/** Disclosures of DOMAIN.md → full worked example (Ley 24.240 art. 36 set, pending legal confirmation). */
export function PricingBreakdown({
  pricing,
  title = 'Precio por pasajero',
}: {
  pricing: Pricing;
  title?: string;
}) {
  const financed = pricing.installments > 0;
  const rows: [string, string, boolean?][] = [
    ['Subtotal', formatArs(pricing.subtotalMinor)],
    ['Descuento comercial', formatArs(pricing.commercialDiscountMinor)],
    ['Precio de contado', formatArs(pricing.cashPriceMinor), true],
    ['Anticipo', formatArs(pricing.downPaymentMinor)],
    ['Monto financiado', formatArs(pricing.financedPrincipalMinor)],
    ['Sistema de amortización', amortization(pricing)],
  ];
  if (financed) {
    rows.push(
      ['Cantidad de cuotas', String(pricing.installments)],
      ['TNA', formatBps(pricing.tnaBps)],
      ['TEA', formatBps(pricing.teaBps)],
      ['CFT', formatBps(pricing.cftBps)],
      ['Cuotas', scheduleSummaryText(pricing)],
      ['Intereses totales', formatArs(pricing.totalInterestMinor)],
      ['Total financiado', formatArs(pricing.totalInstallmentsMinor)],
    );
  }
  rows.push(['Total a pagar', formatArs(pricing.totalPayableMinor), true]);

  return (
    <section
      aria-labelledby="pricing-title"
      className="flex flex-col gap-3 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 p-5"
    >
      <h2 id="pricing-title" className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
        {rows.map(([label, value, strong]) => (
          <div key={label} className="contents">
            <dt className={strong ? 'font-semibold' : 'text-slate-600'}>{label}</dt>
            <dd className={`text-right tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-slate-600">
        Precios finales por pasajero, con impuestos incluidos. Cuotas mensuales fijas en pesos.
        {financed ? ' CFT = TEA: no hay gastos, seguros ni impuestos sobre los intereses.' : ''}
      </p>
      {financed ? (
        <details>
          <summary className="cursor-pointer text-sm underline">Ver cronograma de cuotas</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-right text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
                  <th scope="col" className="py-1 pr-2 text-left">
                    Cuota
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Importe
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Interés
                  </th>
                  <th scope="col" className="py-1 pr-2">
                    Capital
                  </th>
                  <th scope="col" className="py-1">
                    Saldo
                  </th>
                </tr>
              </thead>
              <tbody>
                {pricing.schedule.map((row) => (
                  <tr key={row.number} className="border-b border-slate-100">
                    <td className="py-1 pr-2 text-left">{row.number}</td>
                    <td className="py-1 pr-2">{formatArs(row.paymentMinor)}</td>
                    <td className="py-1 pr-2">{formatArs(row.interestMinor)}</td>
                    <td className="py-1 pr-2">{formatArs(row.principalMinor)}</td>
                    <td className="py-1">{formatArs(row.balanceMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </section>
  );
}
