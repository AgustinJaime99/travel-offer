'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  createSchoolGroupRequestSchema,
  estimatedStudentsSchema,
  groupNameSchema,
  type SchoolGroup,
  schoolGroupSchema,
  travelYearRange,
} from '@travel-rock/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { type UseFormRegisterReturn, useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormAlert, SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import { apiFetch } from '@/lib/api-client';
import { currentAdminLoginHref } from '@/lib/safe-admin-path';
import { applyApiError } from '@/lib/form-errors';
import { type SchoolOption, SchoolPicker } from './school-picker';

interface GroupFieldProps {
  name: UseFormRegisterReturn;
  travelYear: UseFormRegisterReturn;
  estimatedStudents: UseFormRegisterReturn;
}

interface GroupFieldErrors {
  name?: { message?: string | undefined } | undefined;
  travelYear?: { message?: string | undefined } | undefined;
  estimatedStudents?: { message?: string | undefined } | undefined;
}

function yearOptions(current?: number): number[] {
  const { min, max } = travelYearRange();
  const years = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  // An existing group may have a year outside today's range; keep it selectable.
  return current !== undefined && !years.includes(current) ? [current, ...years] : years;
}

function GroupFields({
  fields,
  errors,
  years,
}: {
  fields: GroupFieldProps;
  errors: GroupFieldErrors;
  years: number[];
}) {
  return (
    <>
      <TextField
        id="name"
        label="Nombre del grupo"
        hint='Por ejemplo "5° A" o "5° A – Turno tarde".'
        error={errors.name?.message}
        {...fields.name}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="travelYear" className="text-sm font-medium">
          Año de viaje
        </label>
        <select
          id="travelYear"
          aria-invalid={errors.travelYear ? true : undefined}
          aria-describedby={errors.travelYear ? 'travelYear-error' : undefined}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm aria-invalid:border-red-600"
          {...fields.travelYear}
        >
          <option value="">Elegí el año</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        {errors.travelYear ? (
          <p id="travelYear-error" className="text-sm text-red-700">
            {errors.travelYear.message}
          </p>
        ) : null}
      </div>
      <TextField
        id="estimatedStudents"
        label="Alumnos estimados (opcional)"
        inputMode="numeric"
        hint="Solo informativo: no se usa para calcular precios."
        error={errors.estimatedStudents?.message}
        {...fields.estimatedStudents}
      />
    </>
  );
}

export function CreateGroupForm({ initialSchool }: { initialSchool?: SchoolOption | undefined }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true after a successful save, so the form cannot be resubmitted while navigating away.
  const [navigating, setNavigating] = useState(false);
  const [school, setSchool] = useState<SchoolOption | null>(initialSchool ?? null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof createSchoolGroupRequestSchema>,
    unknown,
    z.output<typeof createSchoolGroupRequestSchema>
  >({
    resolver: zodResolver(createSchoolGroupRequestSchema),
    defaultValues: {
      schoolId: initialSchool?.id ?? '',
      name: '',
      travelYear: '',
      estimatedStudents: '',
    },
  });
  const { field: schoolField } = useController({ name: 'schoolId', control });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const group = await apiFetch('/api/admin/school-groups', schoolGroupSchema, {
        method: 'POST',
        body: values,
      });
      setNavigating(true);
      router.push(`/admin/groups/${group.id}`);
      router.refresh();
    } catch (caught) {
      setFormError(
        applyApiError(caught, {
          setError,
          onUnauthenticated: () => router.replace(currentAdminLoginHref()),
          fieldForCode: { GROUP_TAKEN: 'name' },
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
        <SchoolPicker
          value={school}
          onChange={(selected) => {
            setSchool(selected);
            schoolField.onChange(selected?.id ?? '');
          }}
          error={errors.schoolId?.message}
        />
        <GroupFields
          fields={{
            name: register('name'),
            travelYear: register('travelYear'),
            estimatedStudents: register('estimatedStudents'),
          }}
          errors={errors}
          years={yearOptions()}
        />
        <div className="flex items-center gap-3">
          <SubmitButton pending={isSubmitting || navigating}>Crear grupo</SubmitButton>
          <Link
            href={initialSchool ? `/admin/schools/${initialSchool.id}` : '/admin/groups'}
            className="text-sm underline"
          >
            Cancelar
          </Link>
        </div>
      </fieldset>
    </form>
  );
}

// Unchanged fields are not sent, so an old group keeps its out-of-range year when renamed.
const editSchema = z.object({
  name: groupNameSchema,
  travelYear: z.coerce.number({ error: 'Elegí el año de viaje.' }).int(),
  estimatedStudents: estimatedStudentsSchema,
});

export function EditGroupForm({ group }: { group: SchoolGroup }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [formError, setFormError] = useState<string | null>(null);
  // Stays true after a successful save, so the form cannot be resubmitted while navigating away.
  const [navigating, setNavigating] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof editSchema>, unknown, z.output<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: group.name,
      travelYear: group.travelYear,
      estimatedStudents: group.estimatedStudents ?? '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const patch: Record<string, unknown> = {};
    if (values.name !== group.name) patch['name'] = values.name;
    if (values.travelYear !== group.travelYear) patch['travelYear'] = values.travelYear;
    if (values.estimatedStudents !== group.estimatedStudents)
      patch['estimatedStudents'] = values.estimatedStudents;
    try {
      if (Object.keys(patch).length > 0) {
        await apiFetch(`/api/admin/school-groups/${group.id}`, schoolGroupSchema, {
          method: 'PATCH',
          body: patch,
        });
      }
      setNavigating(true);
      router.push(`/admin/groups/${group.id}`);
      router.refresh();
    } catch (caught) {
      setFormError(
        applyApiError(caught, {
          setError,
          onUnauthenticated: () => router.replace(currentAdminLoginHref()),
          fieldForCode: { GROUP_TAKEN: 'name' },
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
        <p>
          <span className="text-sm font-medium">Colegio:</span> {group.school.name}{' '}
          <span className="text-sm text-slate-600">(no se puede cambiar)</span>
        </p>
        <GroupFields
          fields={{
            name: register('name'),
            travelYear: register('travelYear'),
            estimatedStudents: register('estimatedStudents'),
          }}
          errors={errors}
          years={yearOptions(group.travelYear)}
        />
        <div className="flex items-center gap-3">
          <SubmitButton pending={isSubmitting || navigating}>Guardar cambios</SubmitButton>
          <Link href={`/admin/groups/${group.id}`} className="text-sm underline">
            Cancelar
          </Link>
        </div>
      </fieldset>
    </form>
  );
}
