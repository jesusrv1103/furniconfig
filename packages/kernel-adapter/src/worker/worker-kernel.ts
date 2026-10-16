/**
 * `WorkerGeometryKernel` (FASE-4B-C): proxy del kernel en el **hilo
 * principal**. Implementa `AsyncGeometryKernel` sobre el protocolo de
 * `protocol.ts` y un `WorkerPort` inyectable.
 *
 * Propiedades del diseño:
 *
 * - **Toda operación del editor pasa por el worker** (regla 4B-C). Los
 *   experimentos directos de Manifold se conservan solo para benchmarking.
 * - **Handshake `ready`**: las llamadas previas se **encolan** y se envían
 *   en orden al llegar el `ready`; `kernel-not-ready` queda para el estado
 *   terminal dispuesto.
 * - **Emparejado por `epoch` + `requestId`**: el orden de llegada es
 *   irrelevante; respuestas de otra generación o sin solicitud asociada se
 *   descartan (estadísticas aparte).
 * - **Handles locales**: las `KernelRef` expuestas al consumidor son handles
 *   del proxy (nunca números crudos del worker). Tras un reinicio se vacía
 *   el mapa: un handle viejo produce `unknown-ref` estable y el consumidor
 *   sabe que debe reconstruir los sólidos desde `SceneDocument` (nunca se
 *   reutilizan referencias de un epoch anterior).
 * - **Cancelación lógica por clave** (`cancel(key)`): retira de la cola lo
 *   que aún no se envió; lo ya en vuelo se suelta del llamante
 *   (`OperationCancelledError`) y, si el worker devuelve una `KernelRef`
 *   para esa solicitud descartada, el proxy la **desecha con `dispose`**
 *   (sin fugas de sólidos).
 * - **Watchdog** configurable (10 s PROVISIONAL en reposo; presupuesto
 *   amplio —60 s PROVISIONAL— con operaciones en vuelo: un worker ocupado no
 *   responde pings y eso **no** prueba que murió). Tras declarar la pérdida
 *   se reinicia el worker de forma controlada (sin reintento automático de
 *   operaciones) y se rechazan las pendientes con `worker-timeout`.
 * - **`terminate()` / `terminateAndRestart()`**: cierre deliberado (con y
 *   sin arranque inmediato); pendientes rechazadas con `worker-terminated`.
 */

import { KernelError, type KernelRef, type MmPoint2, type MmPoint3, type MeasureResult, type MeshData } from '../kernel.js';
import {
  isMeshData,
  isMeasureResult,
  isFiniteInteger,
  parseWorkerResponse,
  type AsyncGeometryKernel,
  type KernelCallOptions,
  type KernelErrorPayload,
  type KernelOp,
  type KernelOpRequest,
  type WorkerClock,
  type WorkerPort,
} from './protocol.js';

/** PROVISIONAL: presupuesto de vida en reposo sin mensajes (4B-C §7). */
export const DEFAULT_WATCHDOG_TIMEOUT_MS = 10_000;
/** PROVISIONAL: presupuesto con operaciones en vuelo (no interrumpibles). */
export const DEFAULT_BUSY_TIMEOUT_MS = 60_000;
/** PROVISIONAL: cadencia del sondeo del watchdog. */
export const DEFAULT_WATCHDOG_POLL_MS = 1_000;
/** Tolerancia de ticks perdidos antes de declarar la pérdida del worker. */
export const DEFAULT_WATCHDOG_MISES_ALLOWED = 2;
/** Reinicios automáticos controlados permitidos antes de quedarse abajo. */
export const DEFAULT_MAX_RESTARTS = 3;

/** Razón del reinicio comunicada al consumidor. */
export type WorkerRestartReason = 'worker-timeout' | 'worker-terminated' | 'worker-fatal';

export interface WorkerRestartInfo {
  readonly reason: WorkerRestartReason;
  /** Epoch de la instancia perdida. */
  readonly epoch: number;
  /** Solicitudes rechazadas por la pérdida (0 = solo handshake pendiente). */
  readonly rejectedRequests: number;
  /** Reinicios acumulados trasladados. */
  readonly restarts: number;
  readonly willRestart: boolean;
}

export interface WorkerKernelOptions {
  /** Fábrica del puerto: una llamada = un worker nuevo (navegador/adaptador). */
  readonly createPort: () => WorkerPort;
  readonly watchdogTimeoutMs?: number;
  readonly busyTimeoutMs?: number;
  readonly watchdogPollMs?: number;
  readonly watchdogMissesAllowed?: number;
  readonly autoRestart?: boolean;
  readonly maxRestarts?: number;
  readonly clock?: WorkerClock;
  readonly onRestart?: (info: WorkerRestartInfo) => void;
}

/** Error de **cancelación lógica** (no es un fallo del kernel). */
export class OperationCancelledError extends Error {
  override readonly name = 'OperationCancelledError';
  readonly requestId: number;
  readonly cancelKey: string | null;

  constructor(requestId: number, cancelKey: string | null) {
    super(
      `Solicitud ${requestId} cancelada${cancelKey !== null ? ` (clave "${cancelKey}")` : ''}.`,
    );
    this.requestId = requestId;
    this.cancelKey = cancelKey;
  }
}

type PendingExpected = 'ref' | 'measure' | 'mesh' | 'void';

interface PendingRequest {
  readonly requestId: number;
  /** Operación con handles del proxy (se traducen al publicar). */
  readonly op: KernelOp;
  readonly expected: PendingExpected;
  readonly cancelKey: string | null;
  readonly settle: {
    resolve(value: unknown): void;
    reject(error: unknown): void;
  };
  /** En vuelo (ya publicado) frente a encolado (aún no se envió). */
  posted: boolean;
  /** Cancelado por clave o supersede: su resultado se descartará al llegar. */
  cancelled: boolean;
}

export interface WorkerKernelStats {
  readonly epoch: number;
  readonly state: 'starting' | 'ready' | 'terminated';
  readonly pending: number;
  readonly queued: number;
  readonly inFlight: number;
  readonly refsAlive: number;
  readonly restarts: number;
  readonly invalidMessages: number;
  readonly staleResponses: number;
  readonly unmatchedResponses: number;
  readonly lastInitMs: number | null;
}

const SYSTEM_CLOCK: WorkerClock = {
  now: () => performance.now(),
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

export class WorkerGeometryKernel implements AsyncGeometryKernel {
  readonly name = 'manifold-worker';
  readonly ready: Promise<void>;

  #resolveReady!: () => void;

  readonly #createPort: () => WorkerPort;
  readonly #watchdogTimeoutMs: number;
  readonly #busyTimeoutMs: number;
  readonly #watchdogPollMs: number;
  readonly #watchdogMissesAllowed: number;
  readonly #autoRestart: boolean;
  readonly #maxRestarts: number;
  readonly #clock: WorkerClock;
  readonly #onRestart: ((info: WorkerRestartInfo) => void) | undefined;

  #port: WorkerPort | null = null;
  #state: 'starting' | 'ready' | 'terminated' = 'starting';
  /** Generación del worker: cambia en cada arranque (nunca se reutiliza). */
  #epoch = 0;
  #restarts = 0;
  #nextRequestId = 1;
  #nextHandle = 1;
  #lastInitMs: number | null = null;

  readonly #pending = new Map<number, PendingRequest>();
  #queue: PendingRequest[] = [];
  /** Handle del proxy → ref viva del worker en la generación actual. */
  readonly #refMap = new Map<number, { workerRef: number; epoch: number }>();

  #lastMessageAt = 0;
  #misses = 0;
  #watchdogHandle: unknown = null;

  readonly #stats = {
    invalidMessages: 0,
    staleResponses: 0,
    unmatchedResponses: 0,
  };

  constructor(options: WorkerKernelOptions) {
    this.#createPort = options.createPort;
    this.#watchdogTimeoutMs = options.watchdogTimeoutMs ?? DEFAULT_WATCHDOG_TIMEOUT_MS;
    this.#busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
    this.#watchdogPollMs = options.watchdogPollMs ?? DEFAULT_WATCHDOG_POLL_MS;
    this.#watchdogMissesAllowed = options.watchdogMissesAllowed ?? DEFAULT_WATCHDOG_MISES_ALLOWED;
    this.#autoRestart = options.autoRestart ?? true;
    this.#maxRestarts = options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    this.#clock = options.clock ?? SYSTEM_CLOCK;
    this.#onRestart = options.onRestart;
    this.ready = new Promise<void>((resolve) => {
      this.#resolveReady = resolve;
    });
    this.#start();
    this.#watchdogHandle = this.#clock.setInterval(() => this.#watchdogTick(), this.#watchdogPollMs);
  }

  get stats(): WorkerKernelStats {
    let inFlight = 0;
    let queued = 0;
    for (const entry of this.#pending.values()) {
      if (entry.posted) inFlight += 1;
    }
    queued = this.#queue.length;
    return {
      epoch: this.#epoch,
      state: this.#state,
      pending: this.#pending.size,
      queued,
      inFlight,
      refsAlive: this.#refMap.size,
      restarts: this.#restarts,
      ...this.#stats,
      lastInitMs: this.#lastInitMs,
    };
  }

  // -------------------------------------------------------------------------
  // Operaciones (AsyncGeometryKernel)
  // -------------------------------------------------------------------------

  box(sizeMm: MmPoint3, options?: KernelCallOptions): Promise<KernelRef> {
    return this.#call({ kind: 'box', sizeMm }, 'ref', options);
  }

  fromSketch(
    pointsMm: readonly MmPoint2[],
    extrusionMm: number,
    options?: KernelCallOptions,
  ): Promise<KernelRef> {
    return this.#call({ kind: 'fromSketch', pointsMm, extrusionMm }, 'ref', options);
  }

  union(a: KernelRef, b: KernelRef, options?: KernelCallOptions): Promise<KernelRef> {
    return this.#call({ kind: 'union', a, b }, 'ref', options);
  }

  difference(a: KernelRef, b: KernelRef, options?: KernelCallOptions): Promise<KernelRef> {
    return this.#call({ kind: 'difference', a, b }, 'ref', options);
  }

  intersect(a: KernelRef, b: KernelRef, options?: KernelCallOptions): Promise<KernelRef> {
    return this.#call({ kind: 'intersect', a, b }, 'ref', options);
  }

  translate(
    ref: KernelRef,
    deltaMm: MmPoint3,
    options?: KernelCallOptions,
  ): Promise<KernelRef> {
    return this.#call({ kind: 'translate', ref, deltaMm }, 'ref', options);
  }

  rotateZ(ref: KernelRef, degrees: number, options?: KernelCallOptions): Promise<KernelRef> {
    return this.#call({ kind: 'rotateZ', ref, degrees }, 'ref', options);
  }

  scale(
    ref: KernelRef,
    factors: MmPoint3 | number,
    options?: KernelCallOptions,
  ): Promise<KernelRef> {
    return this.#call({ kind: 'scale', ref, factors }, 'ref', options);
  }

  measure(ref: KernelRef, options?: KernelCallOptions): Promise<MeasureResult> {
    return this.#call({ kind: 'measure', ref }, 'measure', options);
  }

  toMesh(ref: KernelRef, options?: KernelCallOptions): Promise<MeshData> {
    return this.#call({ kind: 'toMesh', ref }, 'mesh', options);
  }

  dispose(ref: KernelRef): Promise<void> {
    // Semántica idéntica al kernel síncrono: liberar dos veces no es error.
    if (!this.#refMap.has(ref)) return Promise.resolve();
    return this.#call({ kind: 'dispose', ref }, 'void');
  }

  disposeAll(): Promise<void> {
    this.#refMap.clear();
    return this.#call({ kind: 'disposeAll' }, 'void');
  }

  // -------------------------------------------------------------------------
  // Cancelación y terminación
  // -------------------------------------------------------------------------

  /**
   * Cancelación lógica por clave: retira de la cola las solicitudes aún no
   * enviadas y suelta del llamante las que están en vuelo (su resultado,
   * si llega, se descarta y su `KernelRef` se libera con `dispose`).
   * Devuelve el nº de solicitudes canceladas.
   */
  cancel(cancelKey: string): number {
    let cancelled = 0;
    const remaining: PendingRequest[] = [];
    for (const entry of this.#queue) {
      if (entry.cancelKey === cancelKey) {
        entry.cancelled = true;
        this.#pending.delete(entry.requestId);
        entry.settle.reject(new OperationCancelledError(entry.requestId, cancelKey));
        cancelled += 1;
      } else {
        remaining.push(entry);
      }
    }
    this.#queue = remaining;
    for (const entry of this.#pending.values()) {
      if (entry.posted && entry.cancelKey === cancelKey && !entry.cancelled) {
        entry.cancelled = true;
        entry.settle.reject(new OperationCancelledError(entry.requestId, cancelKey));
        cancelled += 1;
      }
    }
    return cancelled;
  }

  /** Cierre deliberado permanente (sin reinicio). Pendientes → `worker-terminated`. */
  terminate(): void {
    if (this.#state === 'terminated') return;
    this.#stopPermanently(
      new KernelError('worker-terminated', 'El worker fue terminado deliberadamente (terminate).'),
    );
    if (this.#watchdogHandle !== null) {
      this.#clock.clearInterval(this.#watchdogHandle);
      this.#watchdogHandle = null;
    }
  }

  /**
   * Terminación deliberada con arranque inmediato: escape hatch para una
   * operación ya en ejecución que no debe completarse (el worker es monohilo
   * e interrumpible solo a nivel de proceso). Pendientes → `worker-terminated`.
   */
  terminateAndRestart(): void {
    if (this.#state === 'terminated') {
      // Reanuda incluso tras un cierre permanente: es una decisión explícita.
      this.#restarts += 1;
      this.#start();
      if (this.#watchdogHandle === null) {
        this.#watchdogHandle = this.#clock.setInterval(() => this.#watchdogTick(), this.#watchdogPollMs);
      }
      return;
    }
    this.#failAllPending(
      new KernelError(
        'worker-terminated',
        'El worker fue terminado deliberadamente (terminateAndRestart); reconstruir los sólidos desde SceneDocument.',
      ),
    );
    this.#refMap.clear();
    this.#closePort();
    this.#restarts += 1;
    this.#start();
  }

  // -------------------------------------------------------------------------
  // Interno: ciclo de vida
  // -------------------------------------------------------------------------

  #start(): void {
    this.#epoch += 1;
    this.#state = 'starting';
    this.#misses = 0;
    const port = this.#createPort();
    this.#port = port;
    port.onmessage = (event) => this.#onMessage(event.data);
    port.onerror = () =>
      this.#handleLoss(
        'worker-timeout',
        'worker-fatal',
        'El puerto del worker reportó un error no controlado.',
      );
    const nowMs = this.#clock.now();
    this.#lastMessageAt = nowMs;
  }

  #closePort(): void {
    const port = this.#port;
    this.#port = null;
    if (port === null) return;
    port.onmessage = null;
    port.onerror = null;
    try {
      if (typeof port.terminate === 'function') {
        port.terminate();
      } else if (typeof port.close === 'function') {
        port.close();
      }
    } catch {
      // Un puerto ya cerrado no debe impedir la recuperación.
    }
  }

  #stopPermanently(error: KernelError): void {
    this.#failAllPending(error);
    this.#refMap.clear();
    this.#queue = [];
    this.#closePort();
    this.#state = 'terminated';
  }

  #failAllPending(error: KernelError): void {
    for (const entry of this.#pending.values()) {
      entry.settle.reject(error);
    }
    this.#pending.clear();
    this.#queue = [];
  }

  /**
   * Pérdida de disponibilidad no deliberada (watchdog, puerto caído o
   * `fatal` del worker): rechaza pendientes con el código indicado y
   * reinicia el worker si queda presupuesto. **Nunca** reintenta operaciones.
   */
  #handleLoss(code: 'worker-timeout', reason: WorkerRestartReason, message: string): void {
    if (this.#state === 'terminated') return;
    const lostEpoch = this.#epoch;
    const rejected = this.#pending.size;
    this.#failAllPending(new KernelError(code, message));
    this.#refMap.clear();
    this.#closePort();
    const willRestart = this.#autoRestart && this.#restarts < this.#maxRestarts;
    if (willRestart) {
      this.#restarts += 1;
      this.#start();
    } else {
      this.#stopPermanently(new KernelError('worker-terminated', `${message} (sin presupuesto de reinicio).`));
    }
    this.#onRestart?.({
      reason,
      epoch: lostEpoch,
      rejectedRequests: rejected,
      restarts: this.#restarts,
      willRestart,
    });
  }

  // -------------------------------------------------------------------------
  // Interno: solicitudes
  // -------------------------------------------------------------------------

  #call<T>(op: KernelOp, expected: PendingExpected, options?: KernelCallOptions): Promise<T> {
    if (this.#state === 'terminated') {
      return Promise.reject(
        new KernelError(
          'worker-terminated',
          'El worker está terminado sin reinicio programado; cree un proxy nuevo o llame a terminateAndRestart().',
        ),
      );
    }
    const requestId = this.#nextRequestId;
    this.#nextRequestId += 1;
    const cancelKey = options?.cancelKey ?? null;
    // Supersede: una clave nueva retira a la anterior (cancelación lógica).
    if (cancelKey !== null) this.cancel(cancelKey);
    return new Promise<T>((resolve, reject) => {
      const entry: PendingRequest = {
        requestId,
        op,
        expected,
        cancelKey,
        settle: {
          resolve: (value: unknown) => resolve(value as T),
          reject,
        },
        posted: false,
        cancelled: false,
      };
      this.#pending.set(requestId, entry);
      if (this.#state === 'ready') {
        this.#post(entry);
      } else {
        this.#queue.push(entry);
      }
    });
  }

  /** Traduce handles del proxy a refs del worker; `null` si alguno murió. */
  #translateOp(op: KernelOp): KernelOp | null {
    const ref = (handle: number): number | null => this.#refMap.get(handle)?.workerRef ?? null;
    switch (op.kind) {
      case 'box':
      case 'fromSketch':
      case 'disposeAll':
      case 'ping':
        return op;
      case 'union':
      case 'difference':
      case 'intersect': {
        const a = ref(op.a);
        const b = ref(op.b);
        return a !== null && b !== null ? { ...op, a, b } : null;
      }
      case 'translate':
      case 'rotateZ':
      case 'scale':
      case 'measure':
      case 'toMesh': {
        const workerRef = ref(op.ref);
        return workerRef !== null ? { ...op, ref: workerRef } : null;
      }
      case 'dispose': {
        const workerRef = ref(op.ref);
        return workerRef !== null ? { kind: 'dispose', ref: workerRef } : null;
      }
      default:
        return null;
    }
  }

  #post(entry: PendingRequest): void {
    const port = this.#port;
    if (port === null) return;
    const wire = this.#translateOp(entry.op);
    if (wire === null) {
      // Handle huérfano (p. ej. tras un reinicio): error estable, sin publicar.
      this.#pending.delete(entry.requestId);
      entry.settle.reject(
        new KernelError(
          'unknown-ref',
          `Referencia desconocida o de otra generación (epoch ${this.#epoch}); reconstruir los sólidos desde SceneDocument.`,
        ),
      );
      return;
    }
    const request: KernelOpRequest = { type: 'op', epoch: this.#epoch, requestId: entry.requestId, op: wire };
    entry.posted = true;
    port.postMessage(request);
  }

  #flushQueue(): void {
    const queued = this.#queue;
    this.#queue = [];
    for (const entry of queued) {
      if (this.#pending.has(entry.requestId)) this.#post(entry);
    }
  }

  // -------------------------------------------------------------------------
  // Interno: respuestas
  // -------------------------------------------------------------------------

  #onMessage(data: unknown): void {
    this.#lastMessageAt = this.#clock.now();
    const message = parseWorkerResponse(data);
    if (message === null) {
      this.#stats.invalidMessages += 1;
      return;
    }
    if (message.type === 'fatal') {
      this.#handleLoss('worker-timeout', 'worker-fatal', `Fallo fatal del worker: ${message.error.message}`);
      return;
    }
    if (message.type === 'ready') {
      if (this.#state !== 'starting') return; // handshake duplicado/inesperado
      this.#state = 'ready';
      this.#lastInitMs = message.initMs;
      this.#misses = 0;
      this.#resolveReady();
      this.#flushQueue();
      return;
    }
    // result
    if (message.epoch !== this.#epoch) {
      this.#stats.staleResponses += 1;
      return;
    }
    const entry = this.#pending.get(message.requestId);
    if (entry === undefined) {
      this.#stats.unmatchedResponses += 1;
      return;
    }
    this.#pending.delete(message.requestId);
    if (entry.cancelled) {
      this.#discardCancelledResult(message.ok ? message.value : null);
      return;
    }
    if (!message.ok) {
      entry.settle.reject(new KernelError(message.error.code, message.error.message));
      return;
    }
    this.#settleSuccess(entry, message.value);
  }

  /** Descarta el resultado de una solicitud cancelada y libera su sólido. */
  #discardCancelledResult(value: unknown): void {
    if (isFiniteInteger(value)) {
      // El worker creó un sólido para una operación ya desechada: liberarlo.
      const port = this.#port;
      if (port !== null && this.#state === 'ready') {
        const requestId = this.#nextRequestId;
        this.#nextRequestId += 1;
        port.postMessage({
          type: 'op',
          epoch: this.#epoch,
          requestId,
          op: { kind: 'dispose', ref: value },
        } satisfies KernelOpRequest);
      }
    }
  }

  #settleSuccess(entry: PendingRequest, value: unknown): void {
    // Un dispose confirmado retira el handle del mapa (si el worker falló,
    // el handle queda para que un reinicio lo invalide o el llamante reintente).
    if (entry.op.kind === 'dispose') {
      this.#refMap.delete(entry.op.ref);
    }
    switch (entry.expected) {
      case 'ref': {
        if (!isFiniteInteger(value)) {
          entry.settle.reject(
            new KernelError('kernel-status', `Respuesta inválida del worker: se esperaba una referencia entera (recibido: ${String(value)}).`),
          );
          return;
        }
        const handle = this.#nextHandle;
        this.#nextHandle += 1;
        this.#refMap.set(handle, { workerRef: value, epoch: this.#epoch });
        entry.settle.resolve(handle);
        return;
      }
      case 'measure': {
        if (!isMeasureResult(value)) {
          entry.settle.reject(
            new KernelError('kernel-status', 'Respuesta inválida del worker: MeasureResult malformado.'),
          );
          return;
        }
        entry.settle.resolve(value);
        return;
      }
      case 'mesh': {
        if (!isMeshData(value)) {
          entry.settle.reject(
            new KernelError('kernel-status', 'Respuesta inválida del worker: MeshData malformado.'),
          );
          return;
        }
        entry.settle.resolve(value);
        return;
      }
      case 'void':
        entry.settle.resolve(undefined);
        return;
      default: {
        const unknown: never = entry.expected;
        entry.settle.reject(new KernelError('kernel-status', `Espera desconocida: ${String(unknown)}`));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Interno: watchdog
  // -------------------------------------------------------------------------

  /**
   * Sondeo de vida. Con el worker **en reposo** no llegan mensajes, así que
   * el proxy envía `ping` (resultados sin solicitud asociada: solo refrescan
   * el temporizador). Con operaciones **en vuelo** el worker monohilo no
   * responderá hasta terminarlas: eso no se toma como muerte — hay un
   * presupuesto amplio (`busyTimeoutMs`) y solo al superarlo se declara la
   * pérdida.
   */
  #watchdogTick(): void {
    if (this.#state !== 'ready' && this.#state !== 'starting') return;
    const nowMs = this.#clock.now();
    let inFlight = 0;
    for (const entry of this.#pending.values()) {
      if (entry.posted) inFlight += 1;
    }
    const deadline = inFlight > 0 ? this.#busyTimeoutMs : this.#watchdogTimeoutMs;
    if (nowMs - this.#lastMessageAt > deadline) {
      this.#misses += 1;
      if (this.#misses >= this.#watchdogMissesAllowed) {
        this.#misses = 0;
        this.#handleLoss(
          'worker-timeout',
          'worker-timeout',
          `Sin respuesta del worker dentro del presupuesto (${deadline} ms).`,
        );
        return;
      }
    } else {
      this.#misses = 0;
      // keep-alive solo en reposo (con operaciones en vuelo, pings encolados
      // solo añadirían ruido de "sin emparejar").
      if (this.#state === 'ready' && inFlight === 0) {
        const port = this.#port;
        if (port !== null) {
          const requestId = this.#nextRequestId;
          this.#nextRequestId += 1;
          port.postMessage({ type: 'op', epoch: this.#epoch, requestId, op: { kind: 'ping' } } satisfies KernelOpRequest);
        }
      }
    }
  }
}
