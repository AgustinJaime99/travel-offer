import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OnboardingFlow } from './onboarding-flow';

export const metadata: Metadata = { title: 'Registrá el interés en el viaje · Travel Rock' };

export default function OnboardingPage() {
  return (
    <Suspense fallback={<p className="py-12 text-center text-slate-600">Cargando…</p>}>
      <OnboardingFlow />
    </Suspense>
  );
}
