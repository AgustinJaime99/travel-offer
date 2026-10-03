'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  courseSchema,
  type Province,
  provinceLabels,
  schoolCitySchema,
  schoolNameSchema,
  schoolRequestConfirmationSchema,
  travelYearRange,
  travelYearSchema,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { ApiRequestError, apiFetch, errorMessage } from '@/lib/api-client';
import { primaryButton } from './step-shell';

// Same shape for both requests, so all field errors show at once; only a missing school validates
// its name and city.
const fields = { course: courseSchema, travelYear: travelYearSchema };
const missingSchoolForm = z.object({
  schoolName: schoolNameSchema,
  city: schoolCitySchema,
  ...fields,
});
const missingGroupForm = z.object({ schoolName: z.string(), city: z.string(), ...fields });

type Target =
  | { type: 'SCHOOL_NOT_FOUND'; province: Province; city: string }
  | { type: 'GROUP_NOT_FOUND'; schoolId: string; schoolName: string };

/** "No encuentro mi colegio / grupo": the report goes to the staff queue; no school or group is created. */
export function RequestForm({
  target,
  onCancel,
  onUnauthenticated,
}: {
  target: Target;
  onCancel: () => void;
  onUnauthenticated: () => void;
}) {
  const hydrated = useHydrated();
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const isSchool = target.type === 'SCHOOL_NOT_FOUND';
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof missingSchoolForm>, unknown, z.output<typeof missingSchoolForm>>({
    resolver: zodResolver(isSchool ? missingSchoolForm : missingGroupForm),
    defaultValues: {
      schoolName: '',
      city: isSchool ? target.city : '',
      course: '',
      travelYear: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const body =
        target.type === 'SCHOOL_NOT_FOUND'
          ? { type: target.type, province: target.province, ...values }
          : {
              type: target.type,
              schoolId: target.schoolId,
              course: values.course,
              travelYear: values.travelYear,
            };
      const { message } = await apiFetch(
        '/api/public/school-requests',
        schoolRequestConfirmationSchema,
        {
          method: 'POST',
          body,
        },
      );
      setConfirmation(message);
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        onUnauthenticated();
        return;
      }
      setFormError(errorMessage(caught));
    }
  });

  // The form replaces the search results: move focus to its title, then to the confirmation.
  useEffect(() => {
    if (confirmation) status.current?.focus();
    else heading.current?.focus();
  }, [confirmation]);

  if (confirmation) {
    return (
      <div className="flex flex-col gap-4">
        <p
          ref={status}
          tabIndex={-1}
          role="status"
          className="rounded-md border border-green-200 bg-green-50 p-4 outline-none"
        >
          {confirmation}
        </p>
        <Link href="/mis-viajes" className="inline-flex min-h-11 items-center self-start underline">
          Ir a Mis viajes
        </Link>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center self-start text-sm underline"
        >
          Volver a buscar
        </button>
      </div>
    );
  }

  const { min, max } = travelYearRange();
  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} aria-labelledby="request-title">
      <fieldset disabled={!hydrated} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <h2
          ref={heading}
          id="request-title"
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {isSchool
            ? 'Contanos cuál es tu colegio'
            : `Contanos cuál es tu grupo en ${target.schoolName}`}
        </h2>
        <p className="text-sm text-slate-700">
          Un asesor de Travel Rock lo va a revisar y se va a contactar con vos.
        </p>
        <FormAlert message={formError} />
        {isSchool ? (
          <>
            <p className="text-sm">Provincia: {provinceLabels[target.province]}</p>
            <TextField
              id="request-schoolName"
              label="Nombre del colegio"
              error={errors.schoolName?.message}
              {...register('schoolName')}
            />
            <TextField
              id="request-city"
              label="Localidad"
              error={errors.city?.message}
              {...register('city')}
            />
          </>
        ) : null}
        <TextField
          id="request-course"
          label="Curso o división"
          hint='Por ejemplo "5° A".'
          error={errors.course?.message}
          {...register('course')}
        />
        <div className="flex flex-col gap-1">
          <label htmlFor="request-travelYear" className="text-sm font-medium">
            Año del viaje
          </label>
          <select
            id="request-travelYear"
            aria-invalid={errors.travelYear ? true : undefined}
            aria-describedby={errors.travelYear ? 'request-travelYear-error' : undefined}
            className="rounded-xl border border-slate-200 bg-white px-3 py-3 aria-invalid:border-red-600"
            {...register('travelYear')}
          >
            <option value="">Elegí el año</option>
            {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          {errors.travelYear ? (
            <p id="request-travelYear-error" className="text-sm text-red-700">
              {errors.travelYear.message}
            </p>
          ) : null}
        </div>
        <SubmitButton pending={isSubmitting} className={primaryButton}>
          Enviar
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-11 items-center self-start text-sm underline"
        >
          Cancelar
        </button>
      </fieldset>
    </form>
  );
}
