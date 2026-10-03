import { PRIVACY_NOTICE_VERSION } from '@travel-rock/shared';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Aviso de privacidad · Travel Rock' };

/** DRAFT text pending legal review (Ley 25.326, minors): see DOMAIN.md → Production blockers. */
export default function PrivacyPage() {
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Aviso de privacidad</h1>
      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
        Borrador pendiente de revisión legal (versión {PRIVACY_NOTICE_VERSION}).
      </p>
      <p>Para registrar el interés en el viaje de egresados pedimos solo lo necesario:</p>
      <ul className="list-disc pl-5">
        <li>tu nombre y apellido y tu email, que verificamos con un código;</li>
        <li>
          el nombre y apellido del alumno, y si sos su madre, padre o tutor/a o el alumno mayor de
          edad;
        </li>
        <li>el colegio y el grupo.</li>
      </ul>
      <p>
        No pedimos DNI, fecha de nacimiento, domicilio ni datos de contacto del alumno. Usamos estos
        datos solo para contactarte por el viaje de ese grupo y para mostrarte su propuesta cuando
        corresponda.
      </p>
      <p>
        El formulario lo completa un adulto responsable o el alumno mayor de edad. Registrar el
        interés no es una reserva, un contrato ni un compromiso de pago.
      </p>
      <p>
        El plazo de conservación de los datos y los canales para ejercer tus derechos se van a
        informar acá.
      </p>
    </article>
  );
}
