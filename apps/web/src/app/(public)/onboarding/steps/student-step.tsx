'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  relationshipLabels,
  relationships,
  relationshipSchema,
  studentFirstNameSchema,
  studentLastNameSchema,
} from '@travel-rock/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { SubmitButton, TextField } from '@/components/form';
import { useHydrated } from '@/components/use-hydrated';
import type { StudentData } from '../store';
import { primaryButton } from './step-shell';

const schema = z.object({
  relationship: relationshipSchema,
  firstName: studentFirstNameSchema,
  lastName: studentLastNameSchema,
});

/** Only the student's name: no DNI, birth date, address or student contact (B8). */
export function StudentStep({
  defaults,
  onSave,
}: {
  defaults: StudentData | null;
  onSave: (student: StudentData) => void;
}) {
  const hydrated = useHydrated();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults ?? { firstName: '', lastName: '', relationship: undefined as never },
  });

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(onSave)(event)}>
      <fieldset disabled={!hydrated} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
        <fieldset
          role="radiogroup"
          className="m-0 flex flex-col gap-2 border-0 p-0"
          aria-invalid={errors.relationship ? true : undefined}
          aria-describedby={errors.relationship ? 'relationship-error' : undefined}
        >
          <legend className="mb-1 text-sm font-medium">¿Quién completa el formulario?</legend>
          {relationships.map((relationship) => (
            <label
              key={relationship}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3"
            >
              <input
                type="radio"
                value={relationship}
                className="size-5"
                {...register('relationship')}
              />
              {relationshipLabels[relationship]}
            </label>
          ))}
          {errors.relationship ? (
            <p id="relationship-error" className="text-sm text-red-700">
              {errors.relationship.message}
            </p>
          ) : null}
        </fieldset>
        <TextField
          id="firstName"
          label="Nombre del alumno"
          autoComplete="off"
          error={errors.firstName?.message}
          {...register('firstName')}
        />
        <TextField
          id="lastName"
          label="Apellido del alumno"
          autoComplete="off"
          error={errors.lastName?.message}
          {...register('lastName')}
        />
        <SubmitButton pending={isSubmitting} className={primaryButton}>
          Continuar
        </SubmitButton>
      </fieldset>
    </form>
  );
}
