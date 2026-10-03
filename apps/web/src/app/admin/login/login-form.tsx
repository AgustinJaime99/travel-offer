'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, staffUserSchema } from '@travel-rock/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { apiFetch, errorMessage } from '@/lib/api-client';

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginRequestSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const staff = await apiFetch('/api/admin/auth/login', staffUserSchema, {
        method: 'POST',
        body: values,
      });
      router.replace(staff.mustChangePassword ? '/admin/change-password' : nextPath);
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
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          id="password"
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <SubmitButton pending={isSubmitting}>Ingresar</SubmitButton>
      </fieldset>
    </form>
  );
}
