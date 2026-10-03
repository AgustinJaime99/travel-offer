import { describe, expect, it } from 'vitest';
import { steps } from '../store';
import { isOnboarding3dEnabled, sceneForStep, sceneIds, scenePoses } from './scenes';

describe('onboarding backdrop scenes', () => {
  it('maps every step to the agreed scene', () => {
    expect(Object.fromEntries(steps.map((step) => [step, sceneForStep(step)]))).toEqual({
      bienvenida: 'preparacion',
      contacto: 'preparacion',
      codigo: 'preparacion',
      alumno: 'partida',
      ubicacion: 'partida',
      colegio: 'ruta',
      grupo: 'ruta',
      confirmar: 'destino',
      listo: 'llegada',
    });
  });

  it('never moves the bus backwards while the steps move forward', () => {
    const progress = steps.map((step) => scenePoses[sceneForStep(step)].busProgress);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  });

  it('has bounded poses: parked at both ends, destination only at the end', () => {
    for (const id of sceneIds) {
      const pose = scenePoses[id];
      for (const unit of [pose.busProgress, pose.luggageLoaded, pose.destinationReveal]) {
        expect(unit).toBeGreaterThanOrEqual(0);
        expect(unit).toBeLessThanOrEqual(1);
      }
    }
    expect(scenePoses.preparacion.cruiseSpeed).toBe(0);
    expect(scenePoses.llegada.cruiseSpeed).toBe(0);
    expect(scenePoses.ruta.destinationReveal).toBe(0);
    expect(scenePoses.destino.destinationCycles).toBe(true);
  });

  it('is enabled only by NEXT_PUBLIC_ONBOARDING_3D=1', () => {
    expect(isOnboarding3dEnabled('1')).toBe(true);
    for (const value of [undefined, '', '0', 'true', 'yes']) {
      expect(isOnboarding3dEnabled(value)).toBe(false);
    }
  });
});
