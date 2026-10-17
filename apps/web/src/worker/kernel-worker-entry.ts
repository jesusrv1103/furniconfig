/**
 * FASE-4C-A — entry del Worker del modelador (futuro 4C-B).
 *
 * Vite lo empaqueta como worker de módulo mediante
 * `new Worker(new URL('./kernel-worker-entry.ts', import.meta.url))`
 * en `lib/modeler/worker-kernel-factory.ts`. Arranca el
 * protocolo de 4B-C con el kernel Manifold (WASM dentro del
 * worker: el hilo principal nunca bloquea).
 *
 * Este módulo NO se importa desde la aplicación: solo desde
 * la URL del constructor de Worker, que se ejecuta bajo
 * demanda cuando exista la primera operación geométrica.
 */

import { startKernelWorker, type WorkerPort } from '@furniconfig/kernel-adapter';

startKernelWorker(self as unknown as WorkerPort);
