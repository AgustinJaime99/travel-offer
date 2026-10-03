'use client';

import { applicantSchema } from '@travel-rock/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { apiFetch, ApiRequestError } from '@/lib/api-client';
import { CodeStep } from './steps/code-step';
import { ContactStep } from './steps/contact-step';
import { DoneStep } from './steps/done-step';
import { GroupStep } from './steps/group-step';
import { LocationStep } from './steps/location-step';
import { ReviewStep } from './steps/review-step';
import { SchoolStep } from './steps/school-step';
import type { IconName } from '../icons';
import { StepShell } from './steps/step-shell';
import { StudentStep } from './steps/student-step';
import { WelcomeStep } from './steps/welcome-step';
import {
  firstIncompleteStep,
  isStep,
  isStepReachable,
  type Step,
  stepTitles,
  useOnboarding,
  useOnboardingHydrated,
} from './store';

// Steps shown in the progress indicator (contact and code count as one).
const numbered: Step[] = [
  'bienvenida',
  'contacto',
  'alumno',
  'ubicacion',
  'colegio',
  'grupo',
  'confirmar',
];

// Without a session the student's draft is dropped: the device may now be used by someone else.
const signedOut = { signedIn: false, student: null, school: null, group: null } as const;

const stepperLabels = [
  'Inicio',
  'Verificación',
  'Alumno',
  'Ubicación',
  'Colegio',
  'Grupo',
  'Revisión',
] as const;

const stepIcons: Record<Step, IconName> = {
  bienvenida: 'luggage',
  contacto: 'user',
  codigo: 'mail',
  alumno: 'user',
  ubicacion: 'mapPin',
  colegio: 'school',
  grupo: 'users',
  confirmar: 'clipboard',
  listo: 'done',
};

/**
 * Multi-step onboarding. The step lives in the URL (?paso=…), so browser back/forward work; the draft
 * lives in sessionStorage, so a refresh keeps it. Unreachable steps redirect to the furthest valid one.
 */
export function OnboardingFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const hydrated = useOnboardingHydrated();
  const state = useOnboarding();
  const requested = params.get('paso');

  useEffect(() => {
    void useOnboarding.persist.rehydrate();
  }, []);

  const goTo = useCallback((step: Step) => router.push(`/onboarding?paso=${step}`), [router]);

  // The server session is the source of truth for "signed in" (it may have expired or been reused).
  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    apiFetch('/api/public/me', applicantSchema).then(
      (applicant) => {
        if (!cancelled)
          useOnboarding.getState().update({ signedIn: true, fullName: applicant.fullName });
      },
      (caught: unknown) => {
        if (!cancelled && caught instanceof ApiRequestError && caught.status === 401) {
          useOnboarding.getState().update(signedOut);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  const current: Step | null = hydrated
    ? isStep(requested) && isStepReachable(requested, state)
      ? requested
      : firstIncompleteStep(state)
    : null;

  useEffect(() => {
    if (current && current !== requested) router.replace(`/onboarding?paso=${current}`);
  }, [current, requested, router]);

  const onUnauthenticated = useCallback(() => {
    useOnboarding.getState().update({ ...signedOut, challengeId: null });
    router.replace('/onboarding?paso=contacto');
  }, [router]);

  if (!current) return <p className="py-12 text-center text-slate-600">Cargando…</p>;

  const position = numbered.indexOf(current === 'codigo' ? 'contacto' : current);
  const total = numbered.length;
  const progress = {
    current: position >= 0 ? position + 1 : total + 1,
    total,
    labels: stepperLabels,
  };
  const back = (step: Step) => () => goTo(step);

  const content = (() => {
    switch (current) {
      case 'bienvenida':
        return (
          <WelcomeStep
            accepted={state.privacyAccepted}
            onContinue={() => {
              state.update({ privacyAccepted: true });
              goTo(state.signedIn ? 'alumno' : 'contacto');
            }}
          />
        );
      case 'contacto':
        return (
          <ContactStep
            askName
            defaults={{ fullName: state.fullName, email: state.email }}
            onCodeSent={(data) => {
              state.update(data);
              goTo('codigo');
            }}
          />
        );
      case 'codigo':
        return (
          <CodeStep
            email={state.email}
            fullName={state.fullName}
            challengeId={state.challengeId!}
            onVerified={(applicant) => {
              // The email is only needed to send and resend the code.
              state.update({
                signedIn: true,
                challengeId: null,
                email: '',
                fullName: applicant.fullName,
              });
              goTo('alumno');
            }}
            onNewChallenge={(challengeId) => state.update({ challengeId })}
            onChangeEmail={() => {
              state.update({ challengeId: null });
              goTo('contacto');
            }}
          />
        );
      case 'alumno':
        return (
          <StudentStep
            defaults={state.student}
            onSave={(student) => {
              state.update({ student });
              goTo('ubicacion');
            }}
          />
        );
      case 'ubicacion':
        return (
          <LocationStep
            defaults={state.location}
            onSave={(location) => {
              const changed =
                location.province !== state.location?.province ||
                location.city !== state.location?.city;
              state.update(changed ? { location, school: null, group: null } : { location });
              goTo('colegio');
            }}
          />
        );
      case 'colegio':
        return (
          <SchoolStep
            location={state.location!}
            selected={state.school}
            onUnauthenticated={onUnauthenticated}
            onSelect={(school) => {
              state.update(school.id === state.school?.id ? { school } : { school, group: null });
              goTo('grupo');
            }}
          />
        );
      case 'grupo':
        return (
          <GroupStep
            school={state.school!}
            selected={state.group}
            onUnauthenticated={onUnauthenticated}
            onSelect={(group) => {
              state.update({ group });
              goTo('confirmar');
            }}
          />
        );
      case 'confirmar':
        return (
          <ReviewStep
            onEdit={goTo}
            onUnauthenticated={onUnauthenticated}
            onSubmitted={(result) => {
              state.completeSubmission(result);
              router.replace('/onboarding?paso=listo');
            }}
          />
        );
      case 'listo':
        return (
          <DoneStep
            result={state.submitted!}
            onAnother={() => {
              state.startAnotherStudent();
              router.replace('/onboarding?paso=alumno');
            }}
          />
        );
    }
  })();

  const previous: Partial<Record<Step, Step>> = {
    contacto: 'bienvenida',
    alumno: state.signedIn ? 'bienvenida' : 'contacto',
    ubicacion: 'alumno',
    colegio: 'ubicacion',
    grupo: 'colegio',
    confirmar: 'grupo',
  };
  const backTo = previous[current];

  return (
    <StepShell
      title={stepTitles[current]}
      icon={stepIcons[current]}
      progress={progress}
      onBack={backTo ? back(backTo) : undefined}
    >
      {content}
    </StepShell>
  );
}
