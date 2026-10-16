/**
 * Helpers de las pruebas del Kernel Worker (FASE-4B-C).
 *
 * - `FakePort`: puerto determinista controlado por la prueba (sin hilos).
 * - `FakeClock`: reloj manual para el watchdog (sin esperas reales).
 * - `NodePortAdapter`: adapta un `MessagePort` de `node:worker_threads` a
 *   `WorkerPort` para las pruebas de integración con WASM real.
 * - `SpyPort`: envuelve un puerto registrando mensajes y buffers
 *   transferidos (para asserts de transferencia y detach).
 */

import { MessagePort as NodeMessagePort } from 'node:worker_threads';

import {
  isKernelRequest,
  type KernelErrorPayload,
  type KernelOpRequest,
  type WorkerClock,
  type WorkerPort,
  type WorkerPortEvent,
} from '../src/index.js';

/** Reloj manual: `advance(ms)` dispara los intervalos vencidos. */
export class FakeClock implements WorkerClock {
  #now = 0;
  #nextId = 1;
  readonly #timers = new Map<number, { callback: () => void; intervalMs: number; nextAt: number }>();

  now(): number {
    return this.#now;
  }

  setInterval(callback: () => void, ms: number): unknown {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#timers.set(id, { callback, intervalMs: ms, nextAt: this.#now + ms });
    return id;
  }

  clearInterval(handle: unknown): void {
    if (typeof handle === 'number') this.#timers.delete(handle);
  }

  /** Avanza el tiempo ejecutando los callbacks vencidos (semántica de intervalo). */
  advance(ms: number): void {
    const target = this.#now + ms;
    for (;;) {
      let due: { id: number; callback: () => void; intervalMs: number; nextAt: number } | null = null;
      for (const [id, timer] of this.#timers) {
        if (timer.nextAt <= target && (due === null || timer.nextAt < due.nextAt)) {
          due = { id, ...timer };
        }
      }
      if (due === null) break;
      this.#now = due.nextAt;
      const live = this.#timers.get(due.id);
      if (live !== undefined) live.nextAt = due.nextAt + due.intervalMs;
      due.callback();
    }
    this.#now = target;
  }
}

export interface PostedMessage {
  readonly message: unknown;
  readonly transfer: readonly ArrayBuffer[] | undefined;
}

/** Puerto determinista: la prueba decide cuándo y qué responde. */
export class FakePort implements WorkerPort {
  onmessage: ((event: WorkerPortEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly posted: PostedMessage[] = [];
  terminated = false;

  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data });
  }

  crash(error: unknown = new Error('crash simulado')): void {
    this.onerror?.(error);
  }

  /** Solicitudes `op` válidas publicadas (ignora basura de la prueba). */
  get requests(): KernelOpRequest[] {
    return this.posted.flatMap(({ message }) => (isKernelRequest(message) ? [message] : []));
  }

  get lastRequest(): KernelOpRequest | undefined {
    return this.requests[this.requests.length - 1];
  }

  emitReady(initMs = 5): void {
    this.emit({ type: 'ready', initMs });
  }

  /** Responde con cualquier valor (los hostiles simulan un worker defectuoso). */
  replyOk(request: KernelOpRequest, value: unknown): void {
    this.emit({ type: 'result', epoch: request.epoch, requestId: request.requestId, ok: true, value });
  }

  replyError(request: KernelOpRequest, error: KernelErrorPayload): void {
    this.emit({ type: 'result', epoch: request.epoch, requestId: request.requestId, ok: false, error });
  }
}

/** Registra lo que publica el worker (mensajes y buffers transferidos). */
export class SpyPort implements WorkerPort {
  onmessage: ((event: WorkerPortEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly posted: PostedMessage[] = [];
  /** Referencias a los buffers entregados con transfer (para medir detach). */
  readonly transferredBuffers: ArrayBuffer[] = [];

  readonly #inner: WorkerPort;

  constructor(inner: WorkerPort) {
    this.#inner = inner;
    // encaminar los mensajes del inner hacia esta sesión
    this.#inner.onmessage = (event) => this.onmessage?.(event);
    this.#inner.onerror = (event) => this.onerror?.(event);
  }

  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void {
    this.posted.push({ message, transfer });
    if (transfer !== undefined) this.transferredBuffers.push(...transfer);
    this.#inner.postMessage(message, transfer);
  }

  terminate(): void {
    this.#inner.terminate?.();
  }

  get requests(): KernelOpRequest[] {
    return this.posted.flatMap(({ message }) => (isKernelRequest(message) ? [message] : []));
  }
}

/** Adaptador `node:worker_threads.MessagePort` → `WorkerPort`. */
export class NodePortAdapter implements WorkerPort {
  onmessage: ((event: WorkerPortEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  readonly #port: NodeMessagePort;
  #closed = false;

  constructor(port: NodeMessagePort) {
    this.#port = port;
    port.on('message', (data: unknown) => this.onmessage?.({ data }));
    port.start();
    // no mantener vivo el event loop de Node por un puerto abierto (tests)
    port.unref();
  }

  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void {
    if (this.#closed) return; // cierre: los mensajes se descartan, no lanzan
    if (transfer !== undefined && transfer.length > 0) {
      this.#port.postMessage(message, [...transfer]);
    } else {
      this.#port.postMessage(message);
    }
  }

  terminate(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#port.close();
  }
}
