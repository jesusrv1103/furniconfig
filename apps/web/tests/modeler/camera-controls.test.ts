/**
 * FASE-4C-A §8 — estado de los controles de cámara.
 *
 * Cambios de vista: nuevas referencias inmutables, nonce
 * creciente (re-aplicar la misma vista tras rotar) y
 * "Ajustar" que conserva la vista actual.
 */

import { describe, expect, it } from 'vitest';

import {
  createCameraControlsState,
  requestFit,
  requestView,
} from '../../src/lib/modeler/camera-controls.js';

describe('controles de cámara del modelador', () => {
  it('arranca en isométrica sin peticiones', () => {
    const state = createCameraControlsState();
    expect(state).toEqual({ view: 'isometric', request: null });
  });

  it('requestView cambia la vista y emite un nonce', () => {
    const state = requestView(createCameraControlsState(), 'front');
    expect(state.view).toBe('front');
    expect(state.request).toEqual({ view: 'front', nonce: 1 });
  });

  it('el nonce crece en cada petición (re-aplica tras rotar)', () => {
    let state = createCameraControlsState();
    state = requestView(state, 'side');
    state = requestView(state, 'side'); // misma vista de nuevo
    state = requestFit(state);
    expect(state.request?.nonce).toBe(3);
    expect(state.request?.view).toBe('side');
  });

  it('requestFit conserva la vista activa', () => {
    const initial = createCameraControlsState();
    const withSide = requestView(initial, 'side');
    const fitted = requestFit(withSide);
    expect(fitted.view).toBe('side');
    expect(fitted.request).toEqual({ view: 'side', nonce: 2 });
  });

  it('es puro: nunca muta el estado anterior', () => {
    const initial = createCameraControlsState();
    const frozen = Object.freeze({ ...initial });
    const next = requestView(frozen, 'front');
    expect(next).not.toBe(initial);
    expect(initial.request).toBeNull();
    expect(initial.view).toBe('isometric');
  });
});
