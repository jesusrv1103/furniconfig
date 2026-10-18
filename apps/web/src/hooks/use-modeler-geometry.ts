/**
 * FASE-4C-A/B — hook de lifecycle del motor geométrico.
 *
 * Envuelve `ModelerGeometryRuntime` para React:
 *
 * - El runtime se crea DENTRO del efecto y se dispone en la
 *   limpieza: con `StrictMode` (montaje → limpieza → montaje)
 *   se crea-dispone-crea y queda UN runtime vivo; nunca hay
 *   dos Workers.
 * - `ensureKernel()` es el único camino de creación del Worker;
 *   en 4C-B lo invoca `useSceneGeometry` antes del PRIMER
 *   sólido (la escena vacía sigue sin tocar el Worker).
 * - El reinicio interno del Worker (`onRestart` del kernel)
 *   notifica `restarting` al runtime; la pantalla devuelve el
 *   motor a `ready` vía `useSceneGeometry` cuando el worker
 *   vuelve a publicar resultados (sin sondeos ni timers).
 * - El hook no retiene estado tras desmontar: la limpieza
 *   termina el kernel y anula la referencia.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { AsyncGeometryKernel } from '@furniconfig/kernel-adapter';

import {
  ModelerGeometryRuntime,
  type GeometryKernelStatus,
} from '../lib/modeler/geometry-runtime.js';
import { createModelerWorkerKernel } from '../lib/modeler/worker-kernel-factory.js';

export interface UseModelerGeometry {
  /** Estado actual del motor para la UI. */
  readonly status: GeometryKernelStatus;
  /**
   * Crea el Worker bajo demanda y resuelve con el kernel listo.
   * Lo invoca el coordinador de `useSceneGeometry` ante el
   * primer sólido (nunca al abrir la pantalla).
   */
  ensureKernel(): Promise<AsyncGeometryKernel>;
  /**
   * Devuelve el motor a `ready` tras un reinicio (lo invoca
   * `useSceneGeometry` cuando el worker vuelve a publicar).
   */
  notifyReady(): void;
}

export function useModelerGeometry(): UseModelerGeometry {
  const [status, setStatus] = useState<GeometryKernelStatus>('idle');
  const runtimeRef = useRef<ModelerGeometryRuntime | null>(null);

  useEffect(() => {
    let runtime: ModelerGeometryRuntime | null = null;
    runtime = new ModelerGeometryRuntime({
      createKernel: () =>
        createModelerWorkerKernel({
          onRestart: () => runtime?.notifyRestarting(),
        }),
      onStatusChange: setStatus,
    });
    runtimeRef.current = runtime;
    return () => {
      runtime?.dispose();
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null;
      }
    };
  }, []);

  const ensureKernel = useCallback((): Promise<AsyncGeometryKernel> => {
    const runtime = runtimeRef.current;
    if (runtime === null) {
      return Promise.reject(
        new Error('El motor geométrico del modelador no está montado.'),
      );
    }
    return runtime.ensureKernel();
  }, []);

  const notifyReady = useCallback((): void => {
    runtimeRef.current?.notifyReady();
  }, []);

  return { status, ensureKernel, notifyReady };
}
