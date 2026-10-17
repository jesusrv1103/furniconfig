/**
 * FASE-4C-A — estado de los controles de cámara del modelador.
 *
 * Módulo puro (sin React ni Three.js): la pantalla guarda un
 * estado inmutable y derive de él una `ViewRequest` del
 * contrato compartido `camera-views.ts` (mismo molde que el
 * configurador, para reutilizar `CameraRig`-style en la escena).
 *
 * El `nonce` crece en cada petición para que pulsar la MISMA
 * vista vuelva a aplicarla aunque el usuario haya rotado la
 * cámara después (comportamiento idéntico al visor).
 */

import type { CameraView, ViewRequest } from '../camera-views.js';

/** Estado puro de los controles de vista del modelador. */
export interface ModelerCameraControlsState {
  /** Vista activa del usuario. */
  readonly view: CameraView;
  /** Última petición emitida; `null` al arrancar. */
  readonly request: ViewRequest | null;
}

/** Estado inicial: isométrica y sin peticiones. */
export function createCameraControlsState(
  initial: CameraView = 'isometric',
): ModelerCameraControlsState {
  return { view: initial, request: null };
}

/** Emite una petición de vista (nueva referencia; nunca muta). */
export function requestView(
  state: ModelerCameraControlsState,
  view: CameraView,
): ModelerCameraControlsState {
  const nonce = (state.request?.nonce ?? 0) + 1;
  return { view, request: { view, nonce } };
}

/** Re-aplica la vista ACTUAL (botón "Ajustar"; nuevo nonce). */
export function requestFit(
  state: ModelerCameraControlsState,
): ModelerCameraControlsState {
  const nonce = (state.request?.nonce ?? 0) + 1;
  return { view: state.view, request: { view: state.view, nonce } };
}
