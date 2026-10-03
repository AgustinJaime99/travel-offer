'use client';

import type { ComponentProps } from 'react';
import { formatArsOnBlur } from '@/lib/money-input';

/** Peso amount input: a fixed "$" prefix and canonical format on blur ("10000" → "$ 10.000,00"). */
export function MoneyInput({
  className = '',
  onChange,
  onBlur,
  ...props
}: ComponentProps<'input'>) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500"
      >
        $
      </span>
      <input
        inputMode="decimal"
        autoComplete="off"
        {...props}
        onChange={onChange}
        onBlur={formatArsOnBlur({ onChange, onBlur })}
        className={`w-full tabular-nums ${className} pl-7!`}
      />
    </div>
  );
}
