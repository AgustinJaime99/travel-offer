'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  minorToArsInput,
  parseArsToMinor,
  pricingUnitLabels,
  pricingUnitSchema,
  type Service,
  serviceCategories,
  serviceCategoryLabels,
  serviceCategorySchema,
  serviceNameSchema,
  serviceSchema,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { apiFetch } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';
import { applyApiError } from '@/lib/form-errors';
import { MoneyInput } from '@/components/money-input';

// Staff type pesos in Argentine format; the API receives exact centavos as a string (T2).
const formSchema = z.object({
  name: serviceNameSchema,
  description: z.string().max(1000, { error: 'Descripción: hasta 1000 caracteres.' }),
  category: serviceCategorySchema,
  pricingUnit: pricingUnitSchema,
  price: z.string().transform((value, context) => {
    const minor = parseArsToMinor(value);
    if (minor === null) {
      context.addIssue({
        code: 'custom',
        message: 'Ingresá un precio válido, por ejemplo 1.250.000,50.',
      });
      return z.NEVER;
    }
    return minor.toString();
  }),
});

export function ServiceForm({ service }: { service?: Service }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true after a successful save, so the form cannot be resubmitted while navigating away.
  const [navigating, setNavigating] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof formSchema>, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: service?.name ?? '',
      description: service?.description ?? '',
      category: service?.category ?? ('' as never),
      pricingUnit: service?.pricingUnit ?? 'PER_PASSENGER',
      price: service ? minorToArsInput(service.basePriceMinor) : '',
    },
  });

  const perGroup = useWatch({ control, name: 'pricingUnit' }) === 'PER_GROUP';

  const onSubmit = handleSubmit(async ({ price, pricingUnit, ...values }) => {
    setFormError(null);
    try {
      const saved = await apiFetch(
        service ? `/api/admin/services/${service.id}` : '/api/admin/services',
        serviceSchema,
        {
          method: service ? 'PATCH' : 'POST',
          // The unit is chosen once, when the service is created.
          body: service
            ? { ...values, basePriceMinor: price }
            : { ...values, pricingUnit, basePriceMinor: price },
        },
      );
      setNavigating(true);
      router.push(`/admin/services/${saved.id}`);
      router.refresh();
    } catch (caught) {
      setFormError(
        applyApiError(caught, {
          setError,
          onUnauthenticated: () => router.replace(currentAdminLoginHref()),
          fieldForCode: { SERVICE_NAME_TAKEN: 'name' },
        }),
      );
    }
  });

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="max-w-2xl rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6"
    >
      <fieldset disabled={!hydrated} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <FormAlert message={formError} />
        <TextField id="name" label="Nombre" error={errors.name?.message} {...register('name')} />
        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium">
            Categoría
          </label>
          <select
            id="category"
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? 'category-error' : undefined}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm aria-invalid:border-red-600"
            {...register('category')}
          >
            <option value="">Elegí una categoría</option>
            {serviceCategories.map((category) => (
              <option key={category} value={category}>
                {serviceCategoryLabels[category]}
              </option>
            ))}
          </select>
          {errors.category ? (
            <p id="category-error" className="text-sm text-red-700">
              {errors.category.message}
            </p>
          ) : null}
        </div>
        {service ? (
          <p className="text-sm text-slate-600">
            Se cobra <strong>{pricingUnitLabels[service.pricingUnit]}</strong> (no se puede
            cambiar).
          </p>
        ) : (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium">Cómo se cobra</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['PER_PASSENGER', 'Por pasajero', 'Cada alumno paga este precio.'],
                  [
                    'PER_GROUP',
                    'Por grupo',
                    'Un costo fijo del grupo (por ejemplo, el micro), que se divide entre los alumnos.',
                  ],
                ] as const
              ).map(([value, label, help]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm has-checked:border-orange-500 has-checked:ring-4 has-checked:ring-orange-100"
                >
                  <input
                    type="radio"
                    value={value}
                    className="mt-1 size-4"
                    {...register('pricingUnit')}
                  />
                  <span className="flex flex-col">
                    <span className="font-medium text-slate-900">{label}</span>
                    <span className="text-xs text-slate-600">{help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="price" className="text-sm font-medium">
            {perGroup ? 'Precio del grupo completo (ARS)' : 'Precio base por pasajero (ARS)'}
          </label>
          <MoneyInput
            id="price"
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={errors.price ? 'price-hint price-error' : 'price-hint'}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm outline-none focus-visible:border-orange-500 focus-visible:ring-4 focus-visible:ring-orange-100 aria-invalid:border-red-600"
            {...register('price')}
          />
          <p id="price-hint" className="text-sm text-slate-600">
            {perGroup
              ? 'Lo que cuesta para todo el grupo. Cada propuesta lo divide entre su cantidad de pasajeros.'
              : 'Escribí el monto, por ejemplo 1250000,50: se muestra como $ 1.250.000,50. Es el precio sugerido: en cada propuesta se puede ajustar.'}
          </p>
          {errors.price ? (
            <p id="price-error" className="text-sm text-red-700">
              {errors.price.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Descripción (opcional)
          </label>
          <textarea
            id="description"
            rows={3}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'description-error' : undefined}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm aria-invalid:border-red-600"
            {...register('description')}
          />
          {errors.description ? (
            <p id="description-error" className="text-sm text-red-700">
              {errors.description.message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <SubmitButton pending={isSubmitting || navigating}>
            {service ? 'Guardar cambios' : 'Crear servicio'}
          </SubmitButton>
          <Link
            href={service ? `/admin/services/${service.id}` : '/admin/services'}
            className="text-sm underline"
          >
            Cancelar
          </Link>
        </div>
      </fieldset>
    </form>
  );
}
