/**
 * FASE-4C-A — rig de cámara del modelador (vistas + encuadre).
 *
 * Réplica del patrón `CameraRig` del configurador SIN copiar
 * ni modificar su componente: reutiliza las MISMAS utilidades
 * puras de `lib/camera-views.ts` (`fitDistance`, `viewPosition`,
 * `boxCenter`, `reframe`, `VIEW_DIRECTIONS`, `VIEWER_FOV_DEG`).
 *
 * Comportamiento:
 *
 * - encuadre inicial isométrico y reencuadre si cambia el
 *   `bounds` o el aspecto (mantiene la dirección del usuario
 *   mediante `reframe`);
 * - `viewRequest` (con `nonce` creciente) aplica las vistas
 *   Isométrica/Frontal/Lateral y el botón "Ajustar";
 * - cualquier interacción con OrbitControls marca modo
 *   `free` (escucha el evento `start` del propio controlador):
 *   la cámara queda en manos del usuario y el rig no pelea.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';

import {
  VIEWER_FOV_DEG,
  VIEW_DIRECTIONS,
  boxCenter,
  fitDistance,
  reframe,
  viewPosition,
  type Aabb,
  type CameraView,
  type ViewRequest,
} from '../../lib/camera-views.js';

type Vec3 = [number, number, number];

/** Interfaz estructural mínima de OrbitControls (patrón del visor). */
interface RigControls {
  target: { set(x: number, y: number, z: number): void };
  update(): void;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

interface RigState {
  /** Vista activa o `free` tras interacción del usuario. */
  view: CameraView | 'free';
  /** Último `nonce` aplicado (evita re-aplicar en re-renders). */
  nonce: number;
  /** Último encuadre aplicado (base de `reframe`). */
  fit: number;
  /** Centro usado en el último encuadre. */
  center: Vec3;
}

export interface ModelerCameraRigProps {
  /** Caja de encuadre (m). */
  readonly bounds: Aabb;
  /** Petición de vista desde la interfaz (null: sin petición). */
  readonly viewRequest: ViewRequest | null;
}

export function ModelerCameraRig({ bounds, viewRequest }: ModelerCameraRigProps) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as RigControls | null;
  const viewportSize = useThree((state) => state.size);
  const aspect =
    viewportSize.width / Math.max(viewportSize.height, 1);

  const stateRef = useRef<RigState>({
    view: 'isometric',
    nonce: 0,
    fit: 0,
    center: boxCenter(bounds),
  });

  const applyView = (view: CameraView): void => {
    const state = stateRef.current;
    const center = boxCenter(bounds);
    const direction = VIEW_DIRECTIONS[view];
    const distance = fitDistance(bounds, direction, VIEWER_FOV_DEG, aspect);
    const position = viewPosition(center, direction, distance);
    camera.position.set(position[0], position[1], position[2]);
    state.fit = distance;
    state.center = center;
    if (controls !== null) {
      controls.target.set(center[0], center[1], center[2]);
      controls.update();
    } else {
      camera.lookAt(center[0], center[1], center[2]);
    }
  };

  // Interacción del usuario (arrastre/zoom): modo libre.
  useEffect(() => {
    if (controls === null) return;
    const onStart = (): void => {
      stateRef.current.view = 'free';
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);

  // Encuadre inicial y reencuadre (bounds/aspecto nuevos):
  // en modo libre se conserva la dirección con `reframe`.
  useLayoutEffect(() => {
    const state = stateRef.current;
    if (state.view === 'free') {
      const center = boxCenter(bounds);
      const isoFit = fitDistance(
        bounds,
        VIEW_DIRECTIONS.isometric,
        VIEWER_FOV_DEG,
        aspect,
      );
      const position = reframe(
        camera.position.toArray() as Vec3,
        state.center,
        center,
        state.fit,
        isoFit,
      );
      camera.position.set(position[0], position[1], position[2]);
      state.fit = isoFit;
      state.center = center;
      if (controls !== null) {
        controls.target.set(center[0], center[1], center[2]);
        controls.update();
      } else {
        camera.lookAt(center[0], center[1], center[2]);
      }
      return;
    }
    applyView(state.view);
  }, [bounds, aspect, camera, controls]);

  // Peticiones de vista desde la interfaz (nonce creciente).
  useLayoutEffect(() => {
    if (viewRequest === null) return;
    if (stateRef.current.nonce === viewRequest.nonce) return; // ya aplicada
    stateRef.current.nonce = viewRequest.nonce;
    stateRef.current.view = viewRequest.view;
    applyView(viewRequest.view);
  }, [viewRequest, bounds, aspect, camera, controls]);

  // El rig no dibuja: solo mueve la cámara y los controles.
  return null;
}
