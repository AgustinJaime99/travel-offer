'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type Province, provinceLabels, provinces, provinceSchema } from '@travel-rock/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { primaryButton } from './step-shell';

const schema = z.object({ province: provinceSchema, city: z.string().trim().max(100) });

export function LocationStep({
  defaults,
  onSave,
}: {
  defaults: { province: Province; city: string } | null;
  onSave: (location: { province: Province; city: string }) => void;
}) {
  const hydrated = useHydrated();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults ?? { province: '' as Province, city: '' },
  });

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSave)(event)}>
      <fieldset disabled={!hydrated} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <div className="flex flex-col gap-1">
          <label htmlFor="province" className="text-sm font-medium">
            Provincia del colegio
          </label>
          <select
            id="province"
            aria-invalid={errors.province ? true : undefined}
            aria-describedby={errors.province ? 'province-error' : undefined}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3"
            {...register('province')}
          >
            <option value="">Elegí la provincia</option>
            {provinces.map((province) => (
              <option key={province} value={province}>
                {provinceLabels[province]}
              </option>
            ))}
          </select>
          {errors.province ? (
            <p id="province-error" className="text-sm text-red-700">
              {errors.province.message}
            </p>
          ) : null}
        </div>
        <TextField
          id="city"
          label="Localidad (opcional)"
          autoComplete="address-level2"
          error={errors.city?.message}
          {...register('city')}
        />
        <SubmitButton pending={isSubmitting} className={primaryButton}>
          Continuar
        </SubmitButton>
      </fieldset>
    </form>
  );
}
