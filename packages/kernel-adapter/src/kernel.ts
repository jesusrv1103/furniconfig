/**
 * Interfaz mínima `GeometryKernel` — FASE-4B-0 (prueba de viabilidad).
 *
 * El modelador nunca habla directamente con Manifold: solo con esta interfaz
 * (decisión aprobada en Fase 4A, `ADR-001-GEOMETRY-ENGINE.md`). Así el motor
 * es sustituible (`manifold-3d` ↔ `three-bvh-csg` ↔ otro) sin tocar la UI.
 *
 * Notas de diseño (delta registrado frente al boceto de
 * `docs/architecture/furniconfig-4/PROPOSED_ARCHITECTURE.md` §3.2):
 *
 * - `box`/`fromSketch` devuelven un `KernelRef` (manejador) en lugar de
 *   `MeshData`: para realizar booleanas se necesita el sólido vivo en el
 *   kernel; la extracción de malla es un paso aparte (`toMesh`).
 * - `MeshData` se expresa en **milímetros** (unidad interna del documento,
 *   regla 1 de `AGENTS.md`), no en metros. La conversión mm → m queda
 *   reservada a la capa de presentación (`apps/web/src/lib/units.ts`,
 *   regla 10); este paquete no renderiza.
 * - Se añaden `rotateZ` y `scale` (el modelador necesita rotar y escalar
 *   objetos) y `fromSketch` valida el polígono **antes** de llamar al kernel
 *   (regla 3; ver `polygon.ts`).
 *
 * Este paquete es **experimental**: la dependencia del kernel no está
 * aprobada como dependencia definitiva de producción (ver ADR-001).
 */

/** Punto 2D en milímetros enteros (coordenadas del croquis). */
export type MmPoint2 = readonly [number, number];

/** Punto 3D en milímetros enteros (X = ancho, Y = alto, Z = profundidad). */
export type MmPoint3 = readonly [number, number, number];

/** Envolvente axis-aligned. Unidad: milímetros salvo indicación contraria. */
export interface Aabb {
  readonly min: MmPoint3;
  readonly max: MmPoint3;
}

/**
 * Malla triangulada lista para la capa de render.
 * `positions` está en milímetros (3 floats por vértice: stride 3).
 */
export interface MeshData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly bounds: Aabb;
}

/** Medida de un sólido en unidades de documento (mm). */
export interface MeasureResult {
  readonly volumeMm3: number;
  readonly boundsMm: Aabb;
}

/** Manejador opaco de un sólido vivo en el kernel. */
export type KernelRef = number;

export type KernelErrorCode =
  | 'kernel-not-ready'
  | 'unknown-ref'
  | 'invalid-input'
  | 'kernel-status'
  // --- Añadidos en FASE-4B-C (Kernel Worker) ---
  /**
   * Pérdida de disponibilidad **no deliberada** del worker: el watchdog no
   * recibió señales de vida dentro del presupuesto (10 s PROVISIONAL en
   * reposo; presupuesto amplio con operaciones en vuelo), o el puerto del
   * worker falló (error/crash no controlado). El proxy puede reiniciar el
   * worker de forma controlada, pero **no reintenta** las operaciones
   * fallidas: el consumidor decide.
   */
  | 'worker-timeout'
  /**
   * Indisponibilidad **deliberada** del worker: `terminate()` /
   * `terminateAndRestart()` del consumidor, cierre del proxy, o fin del
   * presupuesto de reinicios (`maxRestarts`). Tras este código el worker no
   * vuelve solo: hay que crear un proxy nuevo o llamar a
   * `terminateAndRestart()`.
   */
  | 'worker-terminated';

/** Error estable del adaptador (patrón de `GeometryError`, union propio). */
export class KernelError extends Error {
  readonly code: KernelErrorCode;

  constructor(code: KernelErrorCode, message: string) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
  }
}

/**
 * Contrato mínimo del kernel geométrico.
 *
 * Obligaciones:
 * - `ready` debe resolverse antes de cualquier operación (`kernel-not-ready`).
 * - Las entradas son milímetros **enteros** (se validan; `invalid-input`).
 * - Las operaciones son puras respecto al documento: devuelven nuevos refs
 *   sin mutar los anteriores.
 */
export interface GeometryKernel {
  readonly name: string;
  readonly ready: Promise<void>;

  /** Caja de `sizeMm` con esquina mínima en el origen. */
  box(sizeMm: MmPoint3): KernelRef;

  /** Extruye un croquis cerrado (≥3 vértices, sin auto-intersección simple) a lo largo de Z. */
  fromSketch(pointsMm: readonly MmPoint2[], extrusionMm: number): KernelRef;

  union(a: KernelRef, b: KernelRef): KernelRef;
  difference(a: KernelRef, b: KernelRef): KernelRef;
  intersect(a: KernelRef, b: KernelRef): KernelRef;

  /** Traslación en mm; el original queda intacto. */
  translate(ref: KernelRef, deltaMm: MmPoint3): KernelRef;

  /**
   * Rotación en el plano Z, en **grados** (no es un parámetro en mm: admite
   * ángulos arbitrarios y no se cuantiza aquí).
   */
  rotateZ(ref: KernelRef, degrees: number): KernelRef;

  /**
   * Escala por factores **adimensionales** (fraccionarios admitidos). Las
   * dimensiones resultantes NO son mm enteros: la cuantización de parámetros
   * (I8) no aplica a factores ni a sus resultados.
   */
  scale(ref: KernelRef, factors: MmPoint3 | number): KernelRef;

  measure(ref: KernelRef): MeasureResult;
  toMesh(ref: KernelRef): MeshData;

  dispose(ref: KernelRef): void;
  disposeAll(): void;
}
