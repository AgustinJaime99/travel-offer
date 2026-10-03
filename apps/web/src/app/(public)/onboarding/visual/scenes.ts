import type { Step } from '../store';

/**
 * Narrative of the decorative onboarding backdrop: packing, departure, on the road, destination,
 * arrival. Purely visual; it never reads or changes onboarding data.
 */
export const sceneIds = ['preparacion', 'partida', 'ruta', 'destino', 'llegada'] as const;
export type SceneId = (typeof sceneIds)[number];

const sceneByStep: Record<Step, SceneId> = {
  bienvenida: 'preparacion',
  contacto: 'preparacion',
  codigo: 'preparacion',
  alumno: 'partida',
  ubicacion: 'partida',
  colegio: 'ruta',
  grupo: 'ruta',
  confirmar: 'destino',
  listo: 'llegada',
};

export function sceneForStep(step: Step): SceneId {
  return sceneByStep[step];
}

/** Target pose of the world for a scene; the renderer eases between poses. */
export interface ScenePose {
  /** Bus position along the road, 0 (home) to 1 (destination). */
  busProgress: number;
  /** Road and scenery scroll speed, world units per second (0 = parked). */
  cruiseSpeed: number;
  /** 0 = suitcases on the sidewalk, 1 = loaded on the bus roof. */
  luggageLoaded: number;
  /** 0 = hidden, 1 = destination fully visible. */
  destinationReveal: number;
  /** The destination alternates between beach and mountain while true. */
  destinationCycles: boolean;
  /** Sky gradient, top and horizon (hex). */
  sky: readonly [string, string];
}

export const scenePoses: Record<SceneId, ScenePose> = {
  preparacion: {
    busProgress: 0,
    cruiseSpeed: 0,
    luggageLoaded: 0,
    destinationReveal: 0,
    destinationCycles: false,
    sky: ['#fde68a', '#fff7ed'],
  },
  partida: {
    busProgress: 0.2,
    cruiseSpeed: 1.5,
    luggageLoaded: 1,
    destinationReveal: 0,
    destinationCycles: false,
    sky: ['#7dd3fc', '#e0f2fe'],
  },
  ruta: {
    busProgress: 0.5,
    cruiseSpeed: 4,
    luggageLoaded: 1,
    destinationReveal: 0,
    destinationCycles: false,
    sky: ['#38bdf8', '#e0f2fe'],
  },
  destino: {
    busProgress: 0.75,
    cruiseSpeed: 2,
    luggageLoaded: 1,
    destinationReveal: 0.7,
    destinationCycles: true,
    sky: ['#0ea5e9', '#fef3c7'],
  },
  llegada: {
    busProgress: 1,
    cruiseSpeed: 0,
    luggageLoaded: 1,
    destinationReveal: 1,
    destinationCycles: false,
    sky: ['#fb923c', '#fde68a'],
  },
};

/** True when the build enables the 3D backdrop (`NEXT_PUBLIC_ONBOARDING_3D=1`, inlined at build). */
export function isOnboarding3dEnabled(flag: string | undefined): boolean {
  return flag === '1';
}
