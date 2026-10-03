'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { Step } from '../store';
import { isOnboarding3dEnabled, type SceneId, sceneForStep, scenePoses } from './scenes';

// Three.js only reaches the browser when the flag is on and WebGL works.
const JourneyCanvas = dynamic(() => import('./journey-canvas'), { ssr: false });

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(reducedMotionQuery);
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => window.matchMedia(reducedMotionQuery).matches,
    () => true,
  );
}

let webglSupport: boolean | undefined;
function supportsWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas');
      webglSupport = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

const noop = () => () => {};

/**
 * Decorative trip narrative behind the onboarding steps (hero band on phones, background on desktop) (post-MVP, `NEXT_PUBLIC_ONBOARDING_3D=1`).
 * Hidden from assistive technology; the forms below never depend on it. Without WebGL it shows a
 * static illustration of the same scene.
 */
export function JourneyBackdrop({ step }: { step: Step }) {
  const enabled = isOnboarding3dEnabled(process.env.NEXT_PUBLIC_ONBOARDING_3D);
  const reducedMotion = usePrefersReducedMotion();
  const webgl = useSyncExternalStore(noop, supportsWebGL, () => false);
  const [failed, setFailed] = useState(false);
  const onUnsupported = useCallback(() => setFailed(true), []);
  if (!enabled) return null;

  const scene = sceneForStep(step);
  const [top, horizon] = scenePoses[scene].sky;
  const mode = !webgl || failed ? 'fallback' : reducedMotion ? 'static' : 'animated';

  return (
    <div
      aria-hidden="true"
      data-testid="onboarding-backdrop"
      data-scene={scene}
      data-mode={mode}
      className="absolute inset-0 overflow-hidden"
      style={{ backgroundImage: `linear-gradient(to bottom, ${top}, ${horizon})` }}
    >
      {mode === 'fallback' ? (
        <StaticJourney scene={scene} />
      ) : (
        <JourneyCanvas scene={scene} animate={mode === 'animated'} onUnsupported={onUnsupported} />
      )}
    </div>
  );
}

/** No-WebGL illustration: road, bus position and destination of the scene, without animation. */
function StaticJourney({ scene }: { scene: SceneId }) {
  const pose = scenePoses[scene];
  const busX = 40 + pose.busProgress * 170;
  return (
    <svg
      viewBox="0 0 320 144"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 size-full"
    >
      <rect x="0" y="104" width="320" height="40" fill="#86efac" />
      <rect x="0" y="112" width="320" height="16" fill="#475569" />
      {pose.destinationReveal > 0 ? (
        <g opacity={pose.destinationReveal}>
          <polygon points="230,104 262,48 294,104" fill="#64748b" />
          <polygon points="254,62 262,48 270,62" fill="#f8fafc" />
          <rect x="250" y="100" width="70" height="8" fill="#fde68a" />
          <rect x="285" y="100" width="35" height="6" fill="#0ea5e9" />
        </g>
      ) : (
        <g>
          <rect x="12" y="76" width="34" height="28" fill="#fecaca" />
          <polygon points="8,78 29,60 50,78" fill="#b91c1c" />
        </g>
      )}
      <g transform={`translate(${busX} 84)`}>
        <rect width="58" height="24" rx="3" fill="#f59e0b" />
        <rect x="6" y="5" width="40" height="8" fill="#bae6fd" />
        <circle cx="13" cy="26" r="5" fill="#1e293b" />
        <circle cx="45" cy="26" r="5" fill="#1e293b" />
        {pose.luggageLoaded > 0 ? (
          <g>
            <rect x="10" y="-8" width="10" height="8" fill="#2563eb" />
            <rect x="23" y="-8" width="10" height="8" fill="#db2777" />
            <rect x="36" y="-8" width="10" height="8" fill="#16a34a" />
          </g>
        ) : (
          <g>
            <rect x="-34" y="10" width="9" height="12" fill="#2563eb" />
            <rect x="-23" y="10" width="9" height="12" fill="#db2777" />
            <rect x="-12" y="10" width="9" height="12" fill="#16a34a" />
          </g>
        )}
      </g>
    </svg>
  );
}
