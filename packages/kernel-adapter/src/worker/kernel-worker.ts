/**
 * Sesión del **Kernel Worker** (FASE-4B-C): lado worker del protocolo.
 *
 * `startKernelWorker(port)` vive dentro del worker (navegador o
 * `node:worker_threads` vía adaptador de puerto): inicializa `ManifoldKernel`
 * **una sola vez por instancia** y despacha cada `KernelOpRequest` de forma
 * síncrona, devolviendo `KernelResultMessage` (con `toMesh` transferiendo
 * sus `ArrayBuffer` en zero-copy) o un `KernelErrorPayload`.
 *
 * Este módulo **no** se auto-arranca: el consumidor (p. ej.
 * `experiments/worker-perf/kernel-worker-entry.ts`) llama explícitamente a
 * `startKernelWorker(self)`, para que importarlo en Node no tenga efectos
 * secundarios. Los experimentos directos de Manifold (benchmarks, sondas)
 * siguen siendo válidos, pero **no** son una ruta funcional del editor: toda
 * operación del editor pasa por este worker.
 */

import { KernelError } from '../kernel.js';
import { ManifoldKernel } from '../manifold-kernel.js';
import {
  createKernelErrorPayload,
  isKernelRequest,
  meshTransferList,
  type KernelOpRequest,
  type KernelResultMessage,
  type KernelResultValue,
  type WorkerPort,
} from './protocol.js';

/** Contadores observables por pruebas y experimentos. */
export interface KernelWorkerStats {
  /** Solicitudes despachadas (incluidas las de `ping`). */
  requests: number;
  /** Mensajes entrantes que no superaron la validación runtime. */
  invalidMessages: number;
}

export interface KernelWorkerSession {
  /** Instancia del kernel en el worker (para asserts de pruebas/experimentos). */
  readonly kernel: ManifoldKernel;
  readonly stats: KernelWorkerStats;
  /** Cierra la sesión: no acepta más mensajes y libera todos los sólidos. */
  close(): void;
}

/**
 * Arranca una sesión de kernel sobre un puerto. El handshake `ready` se
 * publica cuando el WASM termina de inicializar; mientras tanto las
 * solicitudes se encolan en el puerto (el proxy también encola por su lado).
 */
export function startKernelWorker(
  port: WorkerPort,
  kernel: ManifoldKernel = new ManifoldKernel(),
): KernelWorkerSession {
  const stats: KernelWorkerStats = { requests: 0, invalidMessages: 0 };
  let closed = false;

  const post = (message: KernelResultMessage, transfer?: readonly ArrayBuffer[]): void => {
    if (closed) return;
    port.postMessage(message, transfer);
  };

  const respondOk = (request: KernelOpRequest, value: KernelResultValue): void => {
    post({ type: 'result', epoch: request.epoch, requestId: request.requestId, ok: true, value });
  };

  const dispatch = (request: KernelOpRequest): void => {
    stats.requests += 1;
    const { op } = request;
    try {
      switch (op.kind) {
        case 'ping':
          respondOk(request, null);
          return;
        case 'box':
          respondOk(request, kernel.box(op.sizeMm));
          return;
        case 'fromSketch':
          respondOk(request, kernel.fromSketch(op.pointsMm, op.extrusionMm));
          return;
        case 'union':
          respondOk(request, kernel.union(op.a, op.b));
          return;
        case 'difference':
          respondOk(request, kernel.difference(op.a, op.b));
          return;
        case 'intersect':
          respondOk(request, kernel.intersect(op.a, op.b));
          return;
        case 'translate':
          respondOk(request, kernel.translate(op.ref, op.deltaMm));
          return;
        case 'rotateZ':
          respondOk(request, kernel.rotateZ(op.ref, op.degrees));
          return;
        case 'scale':
          respondOk(request, kernel.scale(op.ref, op.factors));
          return;
        case 'measure':
          respondOk(request, kernel.measure(op.ref));
          return;
        case 'toMesh': {
          const mesh = kernel.toMesh(op.ref);
          post(
            { type: 'result', epoch: request.epoch, requestId: request.requestId, ok: true, value: mesh },
            meshTransferList(mesh),
          );
          return;
        }
        case 'dispose':
          kernel.dispose(op.ref);
          respondOk(request, null);
          return;
        case 'disposeAll':
          kernel.disposeAll();
          respondOk(request, null);
          return;
        default: {
          // Defensivo: `isKernelRequest` ya filtra, pero nada de confiar.
          const unknown: never = op;
          throw new KernelError('invalid-input', `Operación desconocida: ${JSON.stringify(unknown)}`);
        }
      }
    } catch (error) {
      // Los KernelError conservan su código; lo demás viaja con su mensaje
      // original bajo `kernel-status` (no se ocultan excepciones).
      post({
        type: 'result',
        epoch: request.epoch,
        requestId: request.requestId,
        ok: false,
        error: createKernelErrorPayload(error),
      });
    }
  };

  port.onmessage = (event): void => {
    if (!isKernelRequest(event.data)) {
      stats.invalidMessages += 1;
      return;
    }
    dispatch(event.data);
  };

  // Handshake: una sola señal `ready` por instancia, cuando el WASM está
  // operativo. Un fallo de init es irrecuperable en esta instancia → `fatal`.
  void kernel.ready
    .then(() => {
      if (closed) return;
      port.postMessage({ type: 'ready', initMs: kernel.initMs ?? 0 });
    })
    .catch((error: unknown) => {
      if (closed) return;
      port.postMessage({ type: 'fatal', error: createKernelErrorPayload(error) });
    });

  return {
    kernel,
    stats,
    close(): void {
      if (closed) return;
      closed = true;
      port.onmessage = null;
      kernel.disposeAll();
    },
  };
}
