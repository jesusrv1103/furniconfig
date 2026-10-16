/**
 * FASE-4B-C — entry del worker del experimento `worker-perf`.
 *
 * Arranque explícito (sin auto-bootstrap en `kernel-worker.ts`): Vite empaqueta
 * este módulo como worker de módulo (`new URL(..., import.meta.url)`).
 */

import type { WorkerPort } from '../../src/index.js';
import { startKernelWorker } from '../../src/worker/kernel-worker.js';

startKernelWorker(self as unknown as WorkerPort);
