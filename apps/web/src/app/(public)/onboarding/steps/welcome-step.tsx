'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { primaryButton } from './step-shell';

export function WelcomeStep({
  accepted,
  onContinue,
}: {
  accepted: boolean;
  onContinue: () => void;
}) {
  const id = useId();
  const checkbox = useRef<HTMLInputElement>(null);
  const [checked, setChecked] = useState(accepted);
  const [error, setError] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p>
        Registrá el interés en el viaje de egresados de tu grupo. Te va a llevar unos minutos:
        verificamos tu email, cargás los datos del alumno y elegís su colegio y grupo.
      </p>
      <p className="text-sm text-slate-700">
        Este formulario lo completa un adulto responsable (madre, padre o tutor/a) o el alumno si es
        mayor de edad. Registrar el interés no es una reserva ni un compromiso de pago.
      </p>
      <div className="flex items-start gap-2">
        <input
          ref={checkbox}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            setChecked(event.target.checked);
            setError(false);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 size-5"
        />
        <label htmlFor={id}>
          Leí y acepto el{' '}
          <Link href="/privacidad" target="_blank" rel="noopener" className="underline">
            aviso de privacidad
          </Link>
          .
        </label>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-700">
          Para continuar tenés que aceptar el aviso de privacidad.
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (checked) {
            onContinue();
            return;
          }
          setError(true);
          checkbox.current?.focus();
        }}
        className={primaryButton}
      >
        Empezar
      </button>
    </div>
  );
}
