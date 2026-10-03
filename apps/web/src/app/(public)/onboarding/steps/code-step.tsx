'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  type Applicant,
  applicantSchema,
  otpChallengeResponseSchema,
  otpCodeSchema,
  PRIVACY_NOTICE_VERSION,
} from '@travel-rock/shared';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormAlert, SubmitButton } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { Icon } from '../../icons';
import { primaryButton } from './step-shell';

const schema = z.object({ code: otpCodeSchema });
const CODE_LENGTH = 6;
// Mirrors the API's default resend cooldown (OTP_RESEND_COOLDOWN_SECONDS); the API stays authoritative.
const RESEND_SECONDS = 60;

const mmss = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

/** Verifies the emailed code: signs in a returning applicant or creates the account. */
export function CodeStep({
  email,
  fullName,
  challengeId,
  onVerified,
  onNewChallenge,
  onChangeEmail,
}: {
  email: string;
  fullName: string;
  challengeId: string;
  onVerified: (applicant: Applicant) => void;
  onNewChallenge: (challengeId: string) => void;
  onChangeEmail: () => void;
}) {
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [focused, setFocused] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { code: '' } });
  const code = useWatch({ control, name: 'code' });
  const field = register('code');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const onSubmit = handleSubmit(async ({ code }) => {
    setFormError(null);
    try {
      const applicant = await apiFetch('/api/public/auth/otp/verify', applicantSchema, {
        method: 'POST',
        body: {
          challengeId,
          code,
          ...(fullName ? { fullName } : {}),
          privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
        },
      });
      onVerified(applicant);
    } catch (caught) {
      // A new account without a name: the contact step must ask for it.
      if (
        caught instanceof ApiRequestError &&
        caught.body?.issues?.some((issue) => issue.path === 'fullName')
      ) {
        setFormError('Es tu primera vez: volvé atrás y completá tu nombre y apellido.');
        return;
      }
      setFormError(errorMessage(caught));
    }
  });

  async function resend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setFormError(null);
    setNotice(null);
    try {
      const { challengeId: next } = await apiFetch(
        '/api/public/auth/otp/request',
        otpChallengeResponseSchema,
        {
          method: 'POST',
          body: { type: 'EMAIL', value: email },
        },
      );
      reset({ code: '' });
      onNewChallenge(next);
      setCooldown(RESEND_SECONDS);
      setNotice('Te enviamos un código nuevo.');
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setResending(false);
    }
  }

  const error = errors.code?.message;
  const activeBox = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)}>
      <fieldset
        disabled={!hydrated}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0 lg:gap-5"
      >
        <p className="text-slate-600 lg:text-lg">
          Enviamos un código de 6 números a{' '}
          <strong className="font-semibold wrap-anywhere text-slate-900">{email}</strong>. Vence en
          10 minutos.
        </p>
        <FormAlert message={formError} />
        {notice ? (
          <p role="status" className="text-sm text-green-800">
            {notice}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="code" className="text-sm font-medium text-slate-700">
            Código
          </label>
          {/* One real input (autofill, paste, screen readers) drawn as six boxes. */}
          <div className="relative">
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'code-error' : 'code-hint'}
              className="otp-input absolute inset-0 z-10 size-full cursor-text opacity-0"
              {...field}
              onChange={(event) => {
                event.target.value = event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH);
                void field.onChange(event);
              }}
              onFocus={() => setFocused(true)}
              onBlur={(event) => {
                setFocused(false);
                void field.onBlur(event);
              }}
            />
            <div aria-hidden="true" className="grid grid-cols-6 gap-2 sm:gap-3">
              {Array.from({ length: CODE_LENGTH }, (_, index) => {
                const active = focused && index === activeBox;
                return (
                  <div
                    key={index}
                    className={`grid h-12 place-items-center rounded-xl border bg-white text-2xl font-semibold text-slate-900 sm:h-14 lg:h-16 ${
                      error
                        ? 'border-red-500'
                        : active
                          ? 'border-orange-500 ring-4 ring-orange-100'
                          : 'border-slate-200'
                    }`}
                  >
                    {code[index] ??
                      (active ? (
                        <span className="h-7 w-0.5 animate-pulse bg-orange-600 motion-reduce:animate-none" />
                      ) : null)}
                  </div>
                );
              })}
            </div>
          </div>
          {error ? (
            <p id="code-error" className="flex items-center gap-2 text-sm text-red-700">
              <Icon name="info" className="size-4 shrink-0" />
              {error}
            </p>
          ) : (
            <p id="code-hint" className="flex items-center gap-2 text-sm text-slate-600">
              <Icon name="info" className="size-4 shrink-0" />
              El código tiene 6 números.
            </p>
          )}
        </div>
        <SubmitButton
          pending={isSubmitting}
          className={primaryButton}
          endIcon={<Icon name="arrowRight" className="size-5" />}
        >
          Verificar
        </SubmitButton>
        <div className="grid grid-cols-2 border-t border-slate-200 pt-3 lg:pt-5">
          <button
            type="button"
            onClick={() => void resend()}
            disabled={resending || cooldown > 0}
            aria-busy={resending || undefined}
            className="flex min-h-11 items-start gap-3 pr-3 text-left disabled:cursor-not-allowed"
          >
            <Icon name="refresh" className="mt-0.5 size-6 shrink-0 text-slate-700" />
            <span className="flex flex-col">
              <span className="font-medium text-slate-900">Reenviar código</span>
              <span className="text-sm text-slate-500">
                {cooldown > 0 ? (
                  <>
                    Podés reenviarlo en{' '}
                    <span className="font-semibold text-orange-700 tabular-nums">
                      {mmss(cooldown)}
                    </span>
                  </>
                ) : (
                  'Ya podés pedir uno nuevo'
                )}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onChangeEmail}
            className="flex min-h-11 items-start gap-3 border-l border-slate-200 pl-4 text-left"
          >
            <Icon name="mail" className="mt-0.5 size-6 shrink-0 text-slate-700" />
            <span className="flex flex-col">
              <span className="font-medium text-slate-900">Usar otro email</span>
              <span className="text-sm text-slate-500">Cambiar dirección de email</span>
            </span>
          </button>
        </div>
        <div className="flex items-start gap-3 rounded-2xl bg-slate-100/80 p-3 lg:gap-4 lg:p-4">
          <Icon name="lock" className="mt-0.5 size-6 shrink-0 text-orange-600 lg:size-7" />
          <p className="flex flex-col text-xs lg:text-sm">
            <span className="font-medium text-slate-900">Tus datos están protegidos</span>
            <span className="text-slate-600">
              Usamos esta verificación para cuidar tu información y la de tu familia.
            </span>
          </p>
        </div>
      </fieldset>
    </form>
  );
}
