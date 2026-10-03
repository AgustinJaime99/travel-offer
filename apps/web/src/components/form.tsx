import type { ComponentProps, ReactNode } from 'react';

export function TextField({
  id,
  label,
  error,
  hint,
  ...inputProps
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
} & ComponentProps<'input'>) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus-visible:border-orange-500 focus-visible:ring-4 focus-visible:ring-orange-100 aria-invalid:border-red-600"
        {...inputProps}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-slate-600">
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

export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
    >
      {message}
    </p>
  );
}

export function SubmitButton({
  pending,
  children,
  className = 'inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2 font-semibold text-white shadow-sm hover:bg-orange-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 disabled:opacity-60',
  endIcon,
}: {
  pending: boolean;
  children: string;
  className?: string;
  endIcon?: ReactNode;
}) {
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? 'Procesando…' : children}
      {pending ? null : endIcon}
    </button>
  );
}
