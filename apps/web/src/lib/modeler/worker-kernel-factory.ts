/**
 * FASE-4C-A — fábrica del `WorkerGeometryKernel` del modelador.
 *
 * El Worker se crea SOLO bajo demanda (la invoca
 * `ModelerGeometryRuntime.ensureKernel`, nunca al abrir la
 * pantalla). Cada llamada a `createPort` corresponde a un
 * epoch: el watchdog/`terminateAndRestart` vuelve a invocarla.
 *
 * El `new Worker(new URL(…))` es el patrón estático que Vite
 * reconoce: el entry empaqueta un chunk de worker INDEPENDIENTE
 * que solo se descarga cuando el Worker se instancia (jamás en
 * el bundle de entrada del configurador).
 */

import {
  WorkerGeometryKernel,
  type WorkerKernelOptions,
  type WorkerPort,
} from '@furniconfig/kernel-adapter';

/** Opciones de la fábrica (hoy, notificación de reinicios). */
export interface ModelerWorkerKernelOptions {
  /** Se invoca cuando el watchdog o el proxy reinician el worker. */
  readonly onRestart?: WorkerKernelOptions['onRestart'];
}

export function createModelerWorkerKernel(
  options: ModelerWorkerKernelOptions = {},
): WorkerGeometryKernel {
  return new WorkerGeometryKernel({
    createPort: () =>
      new Worker(
        new URL('../../worker/kernel-worker-entry.ts', import.meta.url),
        { type: 'module' },
      ) as unknown as WorkerPort,
    onRestart: options.onRestart,
  });
}
