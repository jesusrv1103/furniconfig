/**
 * `@furniconfig/kernel-adapter` — EXPERIMENTAL (FASE-4B-0).
 *
 * Adaptador mínimo `GeometryKernel` sobre `manifold-3d` para la prueba de
 * viabilidad. No está integrado en el visor principal de clósets ni aprobado
 * como dependencia definitiva de producción (ADR-001, estado de candidato).
 */
export {
  type Aabb,
  type GeometryKernel,
  type KernelErrorCode,
  type KernelRef,
  type MmPoint2,
  type MmPoint3,
  type MeasureResult,
  type MeshData,
  KernelError,
} from './kernel.js';
export { ManifoldKernel } from './manifold-kernel.js';
export { assertSimplePolygon, signedDoubleAreaMm2 } from './polygon.js';

// --- FASE-4B-C: Kernel Worker ---
export {
  type AsyncGeometryKernel,
  type KernelCallOptions,
  type KernelErrorPayload,
  type KernelOp,
  type KernelOpKind,
  type KernelOpRequest,
  type KernelRequest,
  type KernelResponse,
  type KernelResultValue,
  type WorkerClock,
  type WorkerPort,
  type WorkerPortEvent,
  createKernelErrorPayload,
  isFiniteInteger,
  isKernelErrorPayload,
  isKernelOp,
  isKernelRequest,
  isMeasureResult,
  isMeshData,
  meshTransferList,
  parseWorkerResponse,
} from './worker/protocol.js';
export {
  startKernelWorker,
  type KernelWorkerSession,
  type KernelWorkerStats,
} from './worker/kernel-worker.js';
export {
  DEFAULT_BUSY_TIMEOUT_MS,
  DEFAULT_MAX_RESTARTS,
  DEFAULT_WATCHDOG_MISES_ALLOWED,
  DEFAULT_WATCHDOG_POLL_MS,
  DEFAULT_WATCHDOG_TIMEOUT_MS,
  OperationCancelledError,
  WorkerGeometryKernel,
  type WorkerKernelOptions,
  type WorkerKernelStats,
  type WorkerRestartInfo,
  type WorkerRestartReason,
} from './worker/worker-kernel.js';
