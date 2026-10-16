/**
 * Protocolo del **Kernel Worker** (FASE-4B-C).
 *
 * Mensajes tipados entre el hilo principal (proxy `WorkerGeometryKernel`) y
 * el worker que aloja el WASM de Manifold (`startKernelWorker`). Reglas:
 *
 * - Solicitudes y respuestas son **uniones discriminadas** validadas en
 *   tiempo de ejecución: los mensajes entrantes son **datos externos**, los
 *   tipos TypeScript no bastan (regla 3, validar antes de calcular).
 * - Toda solicitud lleva `epoch` (generación del worker) + `requestId`
 *   (contador monótono del proxy). El worker hace eco del `epoch`; el proxy
 *   solo acepta respuestas de su generación actual y las empareja por id
 *   (el orden de llegada es irrelevante).
 * - Los errores del worker se serializan como `KernelErrorPayload` con los
 *   códigos estables de `KernelError` (más `worker-timeout` /
 *   `worker-terminated` del proxy); las excepciones no tipadas no se ocultan
 *   (se reenvían con su mensaje original bajo `kernel-status`).
 * - `toMesh` devuelve los `ArrayBuffer` de posiciones e índices como
 *   **transferibles** (zero-copy). No se definen umbrales de transferencia:
 *   cualquier medición que los justifique vendrá después (4B-C §8).
 *
 * Este módulo es **puro** (tipos + validadores, sin DOM ni WASM).
 */

import type {
  KernelErrorCode,
  KernelRef,
  MmPoint2,
  MmPoint3,
  MeasureResult,
  MeshData,
} from '../kernel.js';

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/** Las 11 operaciones de `GeometryKernel` + `ping` (sonda del watchdog). */
export type KernelOpKind =
  | 'box'
  | 'fromSketch'
  | 'union'
  | 'difference'
  | 'intersect'
  | 'translate'
  | 'rotateZ'
  | 'scale'
  | 'measure'
  | 'toMesh'
  | 'dispose'
  | 'disposeAll'
  | 'ping';

/**
 * Operación en crudo con los argumentos tal cual los escribe el proxy. Las
 * `KernelRef` que viajan en operaciones salientes son **handles del proxy**
 * (se traducen a refs del worker justo antes de `postMessage`).
 */
export type KernelOp =
  | { readonly kind: 'box'; readonly sizeMm: MmPoint3 }
  | {
      readonly kind: 'fromSketch';
      readonly pointsMm: readonly MmPoint2[];
      readonly extrusionMm: number;
    }
  | {
      readonly kind: 'union' | 'difference' | 'intersect';
      readonly a: KernelRef;
      readonly b: KernelRef;
    }
  | { readonly kind: 'translate'; readonly ref: KernelRef; readonly deltaMm: MmPoint3 }
  | { readonly kind: 'rotateZ'; readonly ref: KernelRef; readonly degrees: number }
  | {
      readonly kind: 'scale';
      readonly ref: KernelRef;
      readonly factors: MmPoint3 | number;
    }
  | { readonly kind: 'measure'; readonly ref: KernelRef }
  | { readonly kind: 'toMesh'; readonly ref: KernelRef }
  | { readonly kind: 'dispose'; readonly ref: KernelRef }
  | { readonly kind: 'disposeAll' }
  | { readonly kind: 'ping' };

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Error serializado del worker (mismos códigos estables que `KernelError`). */
export interface KernelErrorPayload {
  readonly code: KernelErrorCode;
  readonly message: string;
}

/** Solicitud proxy → worker. */
export interface KernelOpRequest {
  readonly type: 'op';
  readonly epoch: number;
  readonly requestId: number;
  readonly op: KernelOp;
}

/** Handshake: el WASM terminó de inicializarse en esta instancia. */
export interface KernelReadyMessage {
  readonly type: 'ready';
  readonly initMs: number;
}

/** Fallo irrecuperable de la instancia (p. ej. el init del WASM rechazó). */
export interface KernelFatalMessage {
  readonly type: 'fatal';
  readonly error: KernelErrorPayload;
}

/** Valor de resultado según la operación (número = KernelRef del worker). */
export type KernelResultValue = number | MeasureResult | MeshData | null;

export type KernelResultMessage =
  | {
      readonly type: 'result';
      readonly epoch: number;
      readonly requestId: number;
      readonly ok: true;
      readonly value: KernelResultValue;
    }
  | {
      readonly type: 'result';
      readonly epoch: number;
      readonly requestId: number;
      readonly ok: false;
      readonly error: KernelErrorPayload;
    };

/** Mensajes worker → proxy. */
export type KernelResponse = KernelReadyMessage | KernelFatalMessage | KernelResultMessage;

/** Mensaje proxy → worker (alias semántico). */
export type KernelRequest = KernelOpRequest;

// ---------------------------------------------------------------------------
// Puerto y reloj inyectables
// ---------------------------------------------------------------------------

/** Evento mínimo de mensaje aceptado por un puerto. */
export interface WorkerPortEvent {
  readonly data: unknown;
}

/**
 * Puerto de comunicación inyectable. Lo implementan el `Worker` del
 * navegador, un adaptador de `node:worker_threads` (pruebas de integración)
 * o un `FakePort` (pruebas deterministas).
 */
export interface WorkerPort {
  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void;
  onmessage: ((event: WorkerPortEvent) => void) | null;
  onerror?: ((event: unknown) => void) | null;
  terminate?(): void;
  close?(): void;
}

/** Reloj inyectable para el watchdog (determinista en pruebas). */
export interface WorkerClock {
  now(): number;
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

/** Opciones por llamada: cancelación lógica por clave. */
export interface KernelCallOptions {
  /**
   * Clave lógica de la operación (p. ej. `regenerar:objeto-1`). Una solicitud
   * nueva con la misma clave cancela las pendientes anteriores y, si estas
   * llegan tarde, sus resultados se descartan (liberando refs huérfanas).
   */
  readonly cancelKey?: string;
}

/**
 * Reflejo **asíncrono** de `GeometryKernel` (FASE-4B-C).
 *
 * Un proxy sobre un worker no puede respetar las firmas síncronas de
 * `GeometryKernel`: los resultados no existen todavía cuando se hace la
 * llamada. Esta interfaz conserva el **conjunto y la semántica** de las
 * operaciones (mismos argumentos, mismos errores estables, mismas unidades
 * en mm) con `Promise` en su lugar. La interfaz síncrona original se
 * conserva intacta para los experimentos directos de benchmarking; no es una
 * ruta funcional del editor (todas las operaciones del editor pasan por el
 * worker).
 */
export interface AsyncGeometryKernel {
  readonly name: string;
  readonly ready: Promise<void>;
  box(sizeMm: MmPoint3, options?: KernelCallOptions): Promise<KernelRef>;
  fromSketch(
    pointsMm: readonly MmPoint2[],
    extrusionMm: number,
    options?: KernelCallOptions,
  ): Promise<KernelRef>;
  union(a: KernelRef, b: KernelRef, options?: KernelCallOptions): Promise<KernelRef>;
  difference(a: KernelRef, b: KernelRef, options?: KernelCallOptions): Promise<KernelRef>;
  intersect(a: KernelRef, b: KernelRef, options?: KernelCallOptions): Promise<KernelRef>;
  translate(
    ref: KernelRef,
    deltaMm: MmPoint3,
    options?: KernelCallOptions,
  ): Promise<KernelRef>;
  rotateZ(ref: KernelRef, degrees: number, options?: KernelCallOptions): Promise<KernelRef>;
  scale(
    ref: KernelRef,
    factors: MmPoint3 | number,
    options?: KernelCallOptions,
  ): Promise<KernelRef>;
  measure(ref: KernelRef, options?: KernelCallOptions): Promise<MeasureResult>;
  toMesh(ref: KernelRef, options?: KernelCallOptions): Promise<MeshData>;
  dispose(ref: KernelRef): Promise<void>;
  disposeAll(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Validación runtime de mensajes (los mensajes son datos externos)
// ---------------------------------------------------------------------------

const KERNEL_ERROR_CODES: readonly KernelErrorCode[] = [
  'kernel-not-ready',
  'unknown-ref',
  'invalid-input',
  'kernel-status',
  'worker-timeout',
  'worker-terminated',
];

const KERNEL_OP_KINDS: readonly KernelOpKind[] = [
  'box',
  'fromSketch',
  'union',
  'difference',
  'intersect',
  'translate',
  'rotateZ',
  'scale',
  'measure',
  'toMesh',
  'dispose',
  'disposeAll',
  'ping',
];

/** Entero finito (ids, epochs y refs viajan siempre como enteros). */
export function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && Number.isFinite(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMmPoint3(value: unknown): value is MmPoint3 {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1]) &&
    isFiniteNumber(value[2])
  );
}

function isMmPoint2(value: unknown): value is MmPoint2 {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isFiniteNumber(value[0]) &&
    isFiniteNumber(value[1])
  );
}

function isSketchPoints(value: unknown): value is readonly MmPoint2[] {
  return Array.isArray(value) && value.every((point) => isMmPoint2(point));
}

function isAabb(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    isMmPoint3((value as { min?: unknown }).min) &&
    isMmPoint3((value as { max?: unknown }).max)
  );
}

/** `MeasureResult` estructural (bounds normalizados por el adaptador). */
export function isMeasureResult(value: unknown): value is MeasureResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    isFiniteNumber((value as { volumeMm3?: unknown }).volumeMm3) &&
    isAabb((value as { boundsMm?: unknown }).boundsMm)
  );
}

/**
 * `MeshData` estructural. Tras el transporte estructurado (structured
 * clone/transfer) los arrays llegan como TypedArrays del realm receptor.
 */
export function isMeshData(value: unknown): value is MeshData {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { positions?: unknown }).positions instanceof Float32Array &&
    (value as { indices?: unknown }).indices instanceof Uint32Array &&
    isAabb((value as { bounds?: unknown }).bounds)
  );
}

export function isKernelErrorPayload(value: unknown): value is KernelErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    KERNEL_ERROR_CODES.includes((value as { code: KernelErrorCode }).code) &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}

/**
 * Valida una operación recibida (forma e ids). La validación **geométrica**
 * profunda la hace el propio `ManifoldKernel`, que lanza `KernelError` con
 * sus códigos estables (regla 3).
 */
export function isKernelOp(value: unknown): value is KernelOp {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== 'string' || !KERNEL_OP_KINDS.includes(kind as KernelOpKind)) {
    return false;
  }
  switch (kind) {
    case 'box':
      return isMmPoint3(record.sizeMm);
    case 'fromSketch':
      return isSketchPoints(record.pointsMm) && isFiniteInteger(record.extrusionMm);
    case 'union':
    case 'difference':
    case 'intersect':
      return isFiniteInteger(record.a) && isFiniteInteger(record.b);
    case 'translate':
      return isFiniteInteger(record.ref) && isMmPoint3(record.deltaMm);
    case 'rotateZ':
      return isFiniteInteger(record.ref) && isFiniteNumber(record.degrees);
    case 'scale':
      return (
        isFiniteInteger(record.ref) &&
        (isFiniteNumber(record.factors) || isMmPoint3(record.factors))
      );
    case 'measure':
    case 'toMesh':
    case 'dispose':
      return isFiniteInteger(record.ref);
    case 'disposeAll':
    case 'ping':
      return true;
    default:
      return false;
  }
}

export function isKernelRequest(value: unknown): value is KernelOpRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'op' &&
    isFiniteInteger((value as { epoch?: unknown }).epoch) &&
    isFiniteInteger((value as { requestId?: unknown }).requestId) &&
    isKernelOp((value as { op?: unknown }).op)
  );
}

/**
 * Parsea un mensaje entrante en el proxy. Devuelve `null` ante cualquier
 * mensaje malformado (se ignora: no puede asociarse a una solicitud).
 * El **valor** de un resultado se valida después contra el tipo esperado de
 * la operación (`isMeasureResult` / `isMeshData` / ref entero).
 */
export function parseWorkerResponse(value: unknown): KernelResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'ready') {
    // initMs es un tiempo con decimales (performance.now): finito, no entero
    return isFiniteNumber(record.initMs) ? { type: 'ready', initMs: record.initMs } : null;
  }
  if (record.type === 'fatal') {
    return isKernelErrorPayload(record.error) ? { type: 'fatal', error: record.error } : null;
  }
  if (record.type === 'result') {
    if (!isFiniteInteger(record.epoch) || !isFiniteInteger(record.requestId)) return null;
    if (record.ok === true) {
      return {
        type: 'result',
        epoch: record.epoch,
        requestId: record.requestId,
        ok: true,
        value: record.value as KernelResultValue,
      };
    }
    if (record.ok === false && isKernelErrorPayload(record.error)) {
      return {
        type: 'result',
        epoch: record.epoch,
        requestId: record.requestId,
        ok: false,
        error: record.error,
      };
    }
    return null;
  }
  return null;
}

/**
 * Serializa cualquier excepción del worker sin ocultarla: los `KernelError`
 * conservan su código; cualquier otra excepción viaja con su mensaje
 * original bajo `kernel-status` (documentado en el README).
 */
export function createKernelErrorPayload(error: unknown): KernelErrorPayload {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    KERNEL_ERROR_CODES.includes((error as { code: KernelErrorCode }).code) &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return {
      code: (error as { code: KernelErrorCode }).code,
      message: (error as { message: string }).message,
    };
  }
  if (error instanceof Error) {
    return { code: 'kernel-status', message: `${error.name}: ${error.message}` };
  }
  return { code: 'kernel-status', message: `Excepción no tipada: ${String(error)}` };
}

/**
 * Buffers transferibles de una malla (zero-copy). Las vistas se crean de
 * nuevo en cada `toMesh`, así que transferirlas nunca deja al worker con un
 * buffer en uso. Solo se transfieren `ArrayBuffer` reales (un
 * `SharedArrayBuffer` —imposible con esta construcción— viajaría copiado).
 */
export function meshTransferList(mesh: MeshData): readonly ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  for (const buffer of [mesh.positions.buffer, mesh.indices.buffer]) {
    if (buffer instanceof ArrayBuffer) buffers.push(buffer);
  }
  return buffers;
}
