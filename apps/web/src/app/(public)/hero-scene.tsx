'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { isStep } from './onboarding/store';
import { JourneyBackdrop } from './onboarding/visual/journey-backdrop';

/**
 * With `NEXT_PUBLIC_ONBOARDING_3D=1`, the onboarding replaces the hero photo with the 3D trip that
 * follows the current step. The flow keeps `?paso=` on a reachable step, so the URL is enough here.
 */
export function HeroScene() {
  const pathname = usePathname();
  const step = useSearchParams().get('paso');
  if (pathname !== '/onboarding' || !isStep(step)) return null;
  return <JourneyBackdrop step={step} />;
}
