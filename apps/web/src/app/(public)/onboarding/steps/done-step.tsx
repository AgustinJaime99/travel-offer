'use client';

import type { Enrollment } from '@travel-rock/shared';
import Link from 'next/link';
import { SignOutButton } from '../../sign-out-button';
import { primaryButton } from './step-shell';

export function DoneStep({
  result,
  onAnother,
}: {
  result: { enrollment: Enrollment; alreadyRegistered: boolean };
  onAnother: () => void;
}) {
  const { enrollment } = result;
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="rounded-md border border-green-200 bg-green-50 p-4">
        {result.alreadyRegistered ? 'Ya teníamos registrado' : 'Registramos'} el interés de{' '}
        <strong>
          {enrollment.studentFirstName} {enrollment.studentLastName}
        </strong>{' '}
        en el viaje de egresados de <strong>{enrollment.group.name}</strong> (
        {enrollment.school.name}, viaje {enrollment.group.travelYear}).
      </p>
      <OfferStateMessage enrollment={enrollment} />
      <p className="text-sm text-slate-700">No es una reserva ni un compromiso de pago.</p>
      <button type="button" onClick={onAnother} className={primaryButton}>
        Registrar a otro alumno
      </button>
      <SignOutButton className="self-start" />
    </div>
  );
}

/** Same wording everywhere: CODE_REQUIRED never hints at whether an offer exists. */
export function OfferStateMessage({ enrollment }: { enrollment: Enrollment }) {
  switch (enrollment.offerState) {
    case 'AVAILABLE':
      return (
        <Link href={`/mis-viajes/${enrollment.id}`} className={`${primaryButton} text-center`}>
          Ver la propuesta
        </Link>
      );
    case 'PREPARING':
      return <p>Tu propuesta se está preparando. Te avisamos por tu asesor cuando esté lista.</p>;
    case 'CODE_REQUIRED':
      return (
        <p>
          Cuando tu asesor te dé el código del grupo, ingresalo en{' '}
          <Link href={`/mis-viajes/${enrollment.id}`} className="underline">
            Mis viajes
          </Link>{' '}
          para ver la propuesta.
        </p>
      );
  }
}
