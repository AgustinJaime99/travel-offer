'use client';

import type { Enrollment, Province, PublicGroup, PublicSchool } from '@travel-rock/shared';
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface StudentData {
  firstName: string;
  lastName: string;
  relationship: 'GUARDIAN' | 'ADULT_STUDENT';
}

interface OnboardingState {
  /** One per onboarding: retries of the final submission return the same enrollment. */
  idempotencyKey: string;
  privacyAccepted: boolean;
  fullName: string;
  email: string;
  challengeId: string | null;
  signedIn: boolean;
  student: StudentData | null;
  location: { province: Province; city: string } | null;
  school: PublicSchool | null;
  group: PublicGroup | null;
  submitted: { enrollment: Enrollment; alreadyRegistered: boolean } | null;
}

interface OnboardingActions {
  update: (patch: Partial<OnboardingState>) => void;
  /**
   * After a submission the draft is dropped. Only the confirmation shown by the done step (which
   * names the student) and the signed-in state needed for "Registrar a otro alumno" remain.
   */
  completeSubmission: (submitted: NonNullable<OnboardingState['submitted']>) => void;
  /** Registering another student with the same verified account. */
  startAnotherStudent: () => void;
  reset: () => void;
}

/**
 * Random UUID v4. `crypto.randomUUID` only exists on secure origins (HTTPS or localhost); the store is
 * created at import time, so a plain-HTTP origin must not crash the page.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const initial = (): OnboardingState => ({
  idempotencyKey: newIdempotencyKey(),
  privacyAccepted: false,
  fullName: '',
  email: '',
  challengeId: null,
  signedIn: false,
  student: null,
  location: null,
  school: null,
  group: null,
  submitted: null,
});

/**
 * Transient onboarding draft (ADR-11): sessionStorage survives a refresh but not closing the tab.
 * The server stays authoritative for everything that is submitted.
 */
export const useOnboarding = create<OnboardingState & OnboardingActions>()(
  persist(
    (set) => ({
      ...initial(),
      update: (patch) => set(patch),
      completeSubmission: (submitted) =>
        set({ ...initial(), privacyAccepted: true, signedIn: true, submitted }),
      startAnotherStudent: () =>
        set({
          idempotencyKey: newIdempotencyKey(),
          student: null,
          school: null,
          group: null,
          submitted: null,
        }),
      reset: () => set(initial()),
    }),
    {
      name: 'travel-rock-onboarding',
      storage: createJSONStorage(() => sessionStorage),
      // Rehydrated explicitly on the client, so the server render and the first client render match.
      skipHydration: true,
    },
  ),
);

/** True once the persisted draft has been read back from sessionStorage. */
export function useOnboardingHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useOnboarding.persist.onFinishHydration(onChange),
    () => useOnboarding.persist.hasHydrated(),
    () => false,
  );
}

export const steps = [
  'bienvenida',
  'contacto',
  'codigo',
  'alumno',
  'ubicacion',
  'colegio',
  'grupo',
  'confirmar',
  'listo',
] as const;
export type Step = (typeof steps)[number];

export function isStep(value: string | null): value is Step {
  return value !== null && (steps as readonly string[]).includes(value);
}

export const stepTitles: Record<Step, string> = {
  bienvenida: 'Viaje de egresados',
  contacto: 'Tus datos de contacto',
  codigo: 'Revisá tu email',
  alumno: 'Datos del alumno',
  ubicacion: '¿Dónde queda el colegio?',
  colegio: 'Buscá el colegio',
  grupo: 'Elegí el grupo',
  confirmar: 'Revisá y confirmá',
  listo: '¡Listo!',
};

/** The furthest step the draft allows: deep links and refreshes never skip a required step. */
export function firstIncompleteStep(state: OnboardingState): Step {
  if (state.submitted) return 'listo';
  if (!state.privacyAccepted) return 'bienvenida';
  if (!state.signedIn) return state.challengeId ? 'codigo' : 'contacto';
  if (!state.student) return 'alumno';
  if (!state.location) return 'ubicacion';
  if (!state.school) return 'colegio';
  if (!state.group) return 'grupo';
  return 'confirmar';
}

export function isStepReachable(step: Step, state: OnboardingState): boolean {
  const limit = firstIncompleteStep(state);
  if (limit === 'listo') return step === 'listo';
  if (step === 'listo') return false;
  // Contact and code steps are skipped once signed in.
  if (state.signedIn && (step === 'contacto' || step === 'codigo')) return false;
  if (step === 'codigo') return state.challengeId !== null;
  return steps.indexOf(step) <= steps.indexOf(limit);
}
