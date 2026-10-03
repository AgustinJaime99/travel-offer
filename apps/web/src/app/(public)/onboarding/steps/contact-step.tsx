'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  applicantFullNameSchema,
  contactEmailSchema,
  otpChallengeResponseSchema,
} from '@travel-rock/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { apiFetch, errorMessage } from '@/lib/api-client';
import { primaryButton } from './step-shell';

const withName = z.object({ fullName: applicantFullNameSchema, email: contactEmailSchema });
const emailOnly = z.object({ fullName: z.string(), email: contactEmailSchema });

/** Asks for the contact and sends the code. `askName` is false when signing in again. */
export function ContactStep({
  defaults,
  askName,
  onCodeSent,
}: {
  defaults: { fullName: string; email: string };
  askName: boolean;
  onCodeSent: (data: { fullName: string; email: string; challengeId: string }) => void;
}) {
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(askName ? withName : emailOnly), defaultValues: defaults });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { challengeId } = await apiFetch(
        '/api/public/auth/otp/request',
        otpChallengeResponseSchema,
        {
          method: 'POST',
          body: { type: 'EMAIL', value: values.email },
        },
      );
      onCodeSent({ fullName: values.fullName, email: values.email, challengeId });
    } catch (caught) {
      setFormError(errorMessage(caught));
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)}>
      <fieldset disabled={!hydrated} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <FormAlert message={formError} />
        {askName ? (
          <TextField
            id="fullName"
            label="Tu nombre y apellido"
            autoComplete="name"
            error={errors.fullName?.message}
            {...register('fullName')}
          />
        ) : null}
        <TextField
          id="email"
          label="Tu email"
          type="email"
          inputMode="email"
          autoComplete="email"
          hint="Te vamos a enviar un código de 6 números para verificarlo."
          error={errors.email?.message}
          {...register('email')}
        />
        <SubmitButton pending={isSubmitting} className={primaryButton}>
          Enviarme el código
        </SubmitButton>
      </fieldset>
    </form>
  );
}
