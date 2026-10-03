'use client';

import {
  CONSENT_TEXT,
  CONSENT_TEXT_VERSION,
  type Enrollment,
  enrollmentResponseSchema,
  provinceLabels,
  relationshipLabels,
} from '@travel-rock/shared';
import { useId, useRef, useState } from 'react';
import { FormAlert } from '@/components/form';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import type { Step } from '../store';
import { useOnboarding } from '../store';
import { primaryButton } from './step-shell';

/** Final review with explicit consent; one atomic, idempotent submission. */
export function ReviewStep({
  onEdit,
  onSubmitted,
  onUnauthenticated,
}: {
  onEdit: (step: Step) => void;
  onSubmitted: (result: { enrollment: Enrollment; alreadyRegistered: boolean }) => void;
  onUnauthenticated: () => void;
}) {
  const consentId = useId();
  const consentInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const { student, school, group, location, idempotencyKey } = useOnboarding();
  const [consent, setConsent] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [consentError, setConsentError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!student || !school || !group || !location) return null;

  async function submit() {
    if (!consent) {
      setConsentError(true);
      consentInput.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    setCodeError(null);
    try {
      const result = await apiFetch('/api/public/enrollments', enrollmentResponseSchema, {
        method: 'POST',
        body: {
          idempotencyKey,
          schoolId: school!.id,
          schoolGroupId: group!.id,
          studentFirstName: student!.firstName,
          studentLastName: student!.lastName,
          relationship: student!.relationship,
          consentTextVersion: CONSENT_TEXT_VERSION,
          consent: true,
          ...(accessCode.trim() ? { accessCode } : {}),
        },
      });
      onSubmitted(result);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        onUnauthenticated();
        return;
      }
      const codeIssue =
        caught instanceof ApiRequestError
          ? caught.body?.issues?.find((issue) => issue.path === 'accessCode')
          : undefined;
      if (codeIssue) {
        setCodeError(codeIssue.message);
        codeInput.current?.focus();
      } else setError(errorMessage(caught));
      setPending(false);
    }
  }

  const rows: [string, string, Step][] = [
    ['Alumno', `${student.firstName} ${student.lastName}`, 'alumno'],
    ['Quién completa', relationshipLabels[student.relationship], 'alumno'],
    ['Colegio', `${school.name} (${school.city}, ${provinceLabels[school.province]})`, 'colegio'],
    ['Grupo', `${group.name} · viaje ${group.travelYear}`, 'grupo'],
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3">
        {rows.map(([label, value, step]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2"
          >
            <div>
              <dt className="text-sm text-slate-600">{label}</dt>
              <dd>{value}</dd>
            </div>
            <button
              type="button"
              onClick={() => onEdit(step)}
              className="inline-flex min-h-11 shrink-0 items-center px-1 text-sm underline"
            >
              Cambiar<span className="sr-only"> {label.toLowerCase()}</span>
            </button>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1">
        <label htmlFor="accessCode" className="text-sm font-medium">
          Código del grupo (opcional)
        </label>
        <input
          ref={codeInput}
          id="accessCode"
          value={accessCode}
          onChange={(event) => {
            setAccessCode(event.target.value);
            setCodeError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="ABCD-EFGH"
          aria-invalid={codeError ? true : undefined}
          aria-describedby={`accessCode-hint${codeError ? ' accessCode-error' : ''}`}
          className="rounded-xl border border-slate-200 bg-white px-3 py-3 uppercase aria-invalid:border-red-600"
        />
        <p id="accessCode-hint" className="text-sm text-slate-600">
          Te lo da tu asesor de Travel Rock. Si todavía no lo tenés, podés ingresarlo después en
          «Mis viajes».
        </p>
        {codeError ? (
          <p id="accessCode-error" role="alert" className="text-sm text-red-700">
            {codeError}
          </p>
        ) : null}
      </div>
      <div className="flex items-start gap-2">
        <input
          ref={consentInput}
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            setConsentError(false);
          }}
          aria-invalid={consentError ? true : undefined}
          aria-describedby={consentError ? `${consentId}-error` : undefined}
          className="mt-1 size-5 shrink-0"
        />
        <label htmlFor={consentId} className="text-sm">
          {CONSENT_TEXT}
        </label>
      </div>
      {consentError ? (
        <p id={`${consentId}-error`} role="alert" className="text-sm text-red-700">
          Tenés que aceptar para continuar.
        </p>
      ) : null}
      <FormAlert message={error} />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={pending}
        className={primaryButton}
      >
        {pending ? 'Enviando…' : 'Confirmar'}
      </button>
    </div>
  );
}
