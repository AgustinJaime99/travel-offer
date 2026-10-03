import type { Metadata } from 'next';
import Link from 'next/link';
import { SignInFlow } from './sign-in-flow';

export const metadata: Metadata = { title: 'Ingresar · Travel Rock' };

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <SignInFlow />
      <p className="text-sm">
        ¿Es tu primera vez?{' '}
        <Link href="/onboarding" className="underline">
          Registrá el interés en el viaje
        </Link>
        .
      </p>
    </div>
  );
}
