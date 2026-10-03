'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSchoolRequestSchema,
  type Province,
  provinceLabels,
  provinces,
  type School,
  type SchoolDuplicateCandidate,
  schoolDuplicateCheckResponseSchema,
  schoolSchema,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type FieldPath, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';

type FormInput = z.input<typeof createSchoolRequestSchema>;
type FormOutput = z.output<typeof createSchoolRequestSchema>;

const reasonLabels: Record<SchoolDuplicateCandidate['reason'], string> = {
  SAME_CUE: 'mismo CUE',
  SIMILAR_NAME: 'nombre y localidad parecidos',
};

/** Fields that identify a school: the duplicate check runs only when one of them changes. */
function identityKey(values: Pick<FormOutput, 'name' | 'province' | 'city' | 'cue'>): string {
  return JSON.stringify([values.name, values.province, values.city, values.cue ?? null]);
}

export function SchoolForm({ school }: { school?: School }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true after a successful save, so the form cannot be resubmitted while navigating away.
  const [navigating, setNavigating] = useState(false);
  // Possible duplicates already shown for these exact values; saving again confirms.
  const [warning, setWarning] = useState<{
    key: string;
    candidates: SchoolDuplicateCandidate[];
  } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(createSchoolRequestSchema),
    defaultValues: {
      name: school?.name ?? '',
      province: (school?.province ?? '') as Province,
      city: school?.city ?? '',
      address: school?.address ?? '',
      cue: school?.cue ?? '',
    },
  });

  async function findDuplicates(values: FormOutput): Promise<SchoolDuplicateCandidate[]> {
    const params = new URLSearchParams({
      name: values.name,
      province: values.province,
      city: values.city,
    });
    if (values.cue) params.set('cue', values.cue);
    if (school) params.set('excludeId', school.id);
    const { candidates } = await apiFetch(
      `/api/admin/schools/duplicate-check?${params.toString()}`,
      schoolDuplicateCheckResponseSchema,
    );
    return candidates;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const key = identityKey(values);
      const identityChanged = !school || key !== identityKey(school);
      if (identityChanged && warning?.key !== key) {
        const candidates = await findDuplicates(values);
        if (candidates.length > 0) {
          setWarning({ key, candidates });
          return;
        }
      }
      const saved = await apiFetch(
        school ? `/api/admin/schools/${school.id}` : '/api/admin/schools',
        schoolSchema,
        {
          method: school ? 'PATCH' : 'POST',
          body: values,
        },
      );
      setNavigating(true);
      router.push(`/admin/schools/${saved.id}`);
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        router.replace(currentAdminLoginHref());
        return;
      }
      if (caught instanceof ApiRequestError && caught.code === 'CUE_TAKEN') {
        setError('cue', { message: caught.message });
        return;
      }
      if (caught instanceof ApiRequestError && caught.body?.issues) {
        for (const issue of caught.body.issues) {
          setError(issue.path as FieldPath<FormInput>, { message: issue.message });
        }
      }
      setFormError(errorMessage(caught));
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
          <label htmlFor="province" className="text-sm font-medium">
            Provincia
          </label>
          <select
            id="province"
            aria-invalid={errors.province ? true : undefined}
            aria-describedby={errors.province ? 'province-error' : undefined}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm aria-invalid:border-red-600"
            {...register('province')}
          >
            <option value="">Elegí una provincia</option>
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
        <TextField id="city" label="Localidad" error={errors.city?.message} {...register('city')} />
        <TextField
          id="address"
          label="Dirección (opcional)"
          error={errors.address?.message}
          {...register('address')}
        />
        <TextField
          id="cue"
          label="CUE (opcional)"
          inputMode="numeric"
          hint="7 dígitos, o 9 si incluye el anexo."
          error={errors.cue?.message}
          {...register('cue')}
        />

        {warning ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-4"
          >
            <p className="font-medium">Puede que este colegio ya esté cargado:</p>
            <ul className="list-disc pl-5 text-sm">
              {warning.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <Link
                    href={`/admin/schools/${candidate.id}`}
                    target="_blank"
                    rel="noopener"
                    className="font-medium text-orange-800 underline underline-offset-2"
                  >
                    {candidate.name}
                  </Link>{' '}
                  — {candidate.city}, {provinceLabels[candidate.province]}
                  {candidate.cue ? ` · CUE ${candidate.cue}` : ''}
                  {candidate.active ? '' : ' · inactivo'} ({reasonLabels[candidate.reason]})
                </li>
              ))}
            </ul>
            <p className="text-sm">
              Si es un colegio distinto (por ejemplo, otra sede), podés guardarlo igual.
            </p>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <SubmitButton pending={isSubmitting || navigating}>
            {warning ? 'Guardar de todas formas' : school ? 'Guardar cambios' : 'Crear colegio'}
          </SubmitButton>
          <Link
            href={school ? `/admin/schools/${school.id}` : '/admin/schools'}
            className="text-sm underline"
          >
            Cancelar
          </Link>
        </div>
      </fieldset>
    </form>
  );
}
