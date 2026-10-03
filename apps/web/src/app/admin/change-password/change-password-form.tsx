'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { newPasswordSchema, PASSWORD_MIN_LENGTH } from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { apiCall, errorMessage } from '@/lib/api-client';

const formSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'Ingresá tu contraseña actual.' }),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    error: 'Las contraseñas no coinciden.',
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ['newPassword'],
    error: 'La nueva contraseña debe ser distinta de la actual.',
  });

export function ChangePasswordForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(formSchema) });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    setFormError(null);
    try {
      await apiCall('/api/admin/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      router.replace('/admin');
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)}>
      <fieldset disabled={!hydrated} className="m-0 min-w-0 border-0 p-0 flex flex-col gap-4">
        <FormAlert message={formError} />
        <TextField
          id="currentPassword"
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />
        <TextField
          id="newPassword"
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres. Una frase larga es más segura y fácil de recordar.`}
          error={errors.newPassword?.message}
          {...register('newPassword')}
        />
        <TextField
          id="confirmPassword"
          label="Repetí la contraseña nueva"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
        <SubmitButton pending={isSubmitting}>Guardar contraseña</SubmitButton>
      </fieldset>
    </form>
  );
}
