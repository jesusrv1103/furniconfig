/**
 * FASE-4C-A — hook de lifecycle del motor geométrico.
 *
 * Envuelve `ModelerGeometryRuntime` para React:
 *
 * - El runtime se crea DENTRO del efecto y se dispone en la
 *   limpieza: con `StrictMode` (montaje → limpieza → montaje)
 *   se crea-dispone-crea y queda UN runtime vivo; nunca hay
 *   dos Workers.
 * - `ensureKernel()` es el único camino de creación del Worker
 *   y en 4C-A **nada lo invoca** (la escena vacía no calcula
 *   Manifold): el estado permanece `idle`.
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
   * En 4C-A no se usa; 4C-B lo llamará antes del primer cálculo.
   */
  ensureKernel(): Promise<AsyncGeometryKernel>;
}

export function useModelerGeometry(): UseModelerGeometry {
  const [status, setStatus] = useState<GeometryKernelStatus>('idle');
  const runtimeRef = useRef<ModelerGeometryRuntime | null>(null);

  useEffect(() => {
    const runtime = new ModelerGeometryRuntime({
      createKernel: createModelerWorkerKernel,
      onStatusChange: setStatus,
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
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

  return { status, ensureKernel };
}
