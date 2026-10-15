import Module from 'manifold-3d';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';

import {
  KernelError,
  type Aabb,
  type GeometryKernel,
  type KernelRef,
  type MmPoint2,
  type MmPoint3,
  type MeasureResult,
  type MeshData,
} from './kernel.js';
import { assertSimplePolygon } from './polygon.js';

function assertIntegerMm(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new KernelError('invalid-input', `${label} debe ser un milímetro entero (recibido: ${value})`);
  }
  return value;
}

function assertPositive(value: number, label: string): number {
  if (value <= 0) {
    throw new KernelError('invalid-input', `${label} debe ser > 0 (recibido: ${value})`);
  }
  return value;
}

function aabbFromBox(box: { min: readonly number[]; max: readonly number[] }): Aabb {
  // Un sólido vacío devuelve ±Infinity en sus bounds (comportamiento del
  // binding de manifold-3d). Se normaliza a 0 = "sin extensión"; es una
  // decisión de representación del adaptador, no un redondeo geométrico.
  const finite = (value: number | undefined): number =>
    value !== undefined && Number.isFinite(value) ? value : 0;
  const min: MmPoint3 = [finite(box.min[0]), finite(box.min[1]), finite(box.min[2])];
  const max: MmPoint3 = [finite(box.max[0]), finite(box.max[1]), finite(box.max[2])];
  return { min, max };
}

/**
 * Adaptador `GeometryKernel` sobre `manifold-3d` (WASM).
 *
 * FASE-4B-0: implementación experimental. La carga del WASM es **diferida**
 * (`ready` se dispara en la construcción, pero quien decide cuándo
 * instanciar la clase es la capa de app; el configurador actual no la usa).
 *
 * Unidades: todo el contrato trabaja en milímetros enteros. Manifold opera
 * internamente en `double` con esas magnitudes; la conversión a metros queda
 * fuera de este paquete (ver `kernel.ts`).
 */
export class ManifoldKernel implements GeometryKernel {
  readonly name = 'manifold';

  readonly ready: Promise<void>;

  #topo: ManifoldToplevel | null = null;
  #handles = new Map<KernelRef, Manifold>();
  #nextRef = 1;
  #initMs: number | null = null;

  constructor() {
    this.ready = this.#init();
  }

  /** Tiempo de inicialización (WASM) en ms; `null` si aún no terminó. */
  get initMs(): number | null {
    return this.#initMs;
  }

  async #init(): Promise<void> {
    const startedAt = performance.now();
    const toplevel = await Module();
    toplevel.setup();
    this.#topo = toplevel;
    this.#initMs = performance.now() - startedAt;
  }

  #requireTopo(): ManifoldToplevel {
    const topo = this.#topo;
    if (topo === null) {
      throw new KernelError('kernel-not-ready', 'El kernel WASM aún no está inicializado (esperar a `ready`)');
    }
    return topo;
  }

  #requireRef(ref: KernelRef): Manifold {
    const solid = this.#handles.get(ref);
    if (solid === undefined) {
      throw new KernelError('unknown-ref', `Referencia de sólido desconocida o ya liberada: ${ref}`);
    }
    return solid;
  }

  #register(solid: Manifold): KernelRef {
    const status = solid.status();
    if (status !== 'NoError') {
      solid.delete();
      throw new KernelError('kernel-status', `El kernel devolvió estado de error: ${status}`);
    }
    const ref = this.#nextRef;
    this.#nextRef += 1;
    this.#handles.set(ref, solid);
    return ref;
  }

  box(sizeMm: MmPoint3): KernelRef {
    const topo = this.#requireTopo();
    const size: [number, number, number] = [
      assertPositive(assertIntegerMm(sizeMm[0], 'ancho'), 'ancho'),
      assertPositive(assertIntegerMm(sizeMm[1], 'alto'), 'alto'),
      assertPositive(assertIntegerMm(sizeMm[2], 'profundidad'), 'profundidad'),
    ];
    return this.#register(topo.Manifold.cube(size));
  }

  fromSketch(pointsMm: readonly MmPoint2[], extrusionMm: number): KernelRef {
    const topo = this.#requireTopo();
    if (pointsMm.length < 3) {
      throw new KernelError('invalid-input', `El croquis necesita al menos 3 vértices (recibidos: ${pointsMm.length})`);
    }
    const height = assertPositive(assertIntegerMm(extrusionMm, 'extrusión'), 'extrusión');
    const polygon = pointsMm.map(([x, y]) => [assertIntegerMm(x, 'x'), assertIntegerMm(y, 'y')] as [number, number]);
    // regla 3: validar antes de calcular (área nula y auto-intersecciones;
    // el kernel por sí solo "repara" estos casos con resultados que no
    // corresponden a la intención del usuario — ver `polygon.ts`).
    assertSimplePolygon(polygon);
    return this.#register(topo.Manifold.extrude(polygon, height));
  }

  union(a: KernelRef, b: KernelRef): KernelRef {
    const topo = this.#requireTopo();
    return this.#register(topo.Manifold.union(this.#requireRef(a), this.#requireRef(b)));
  }

  difference(a: KernelRef, b: KernelRef): KernelRef {
    return this.#register(this.#requireRef(a).subtract(this.#requireRef(b)));
  }

  intersect(a: KernelRef, b: KernelRef): KernelRef {
    return this.#register(this.#requireRef(a).intersect(this.#requireRef(b)));
  }

  translate(ref: KernelRef, deltaMm: MmPoint3): KernelRef {
    const delta: [number, number, number] = [
      assertIntegerMm(deltaMm[0], 'dx'),
      assertIntegerMm(deltaMm[1], 'dy'),
      assertIntegerMm(deltaMm[2], 'dz'),
    ];
    return this.#register(this.#requireRef(ref).translate(delta));
  }

  rotateZ(ref: KernelRef, degrees: number): KernelRef {
    if (!Number.isFinite(degrees)) {
      throw new KernelError('invalid-input', `El ángulo debe ser finito (recibido: ${degrees})`);
    }
    return this.#register(this.#requireRef(ref).rotate([0, 0, degrees]));
  }

  scale(ref: KernelRef, factors: MmPoint3 | number): KernelRef {
    const parse = (value: number, label: string): number => {
      if (!Number.isFinite(value) || value <= 0) {
        throw new KernelError('invalid-input', `El factor ${label} debe ser finito y > 0 (recibido: ${value})`);
      }
      return value;
    };
    const vector: [number, number, number] =
      typeof factors === 'number'
        ? [parse(factors, 'uniforme'), parse(factors, 'uniforme'), parse(factors, 'uniforme')]
        : [parse(factors[0], 'x'), parse(factors[1], 'y'), parse(factors[2], 'z')];
    return this.#register(this.#requireRef(ref).scale(vector));
  }

  measure(ref: KernelRef): MeasureResult {
    const solid = this.#requireRef(ref);
    return {
      volumeMm3: solid.volume(),
      boundsMm: aabbFromBox(solid.boundingBox()),
    };
  }

  toMesh(ref: KernelRef): MeshData {
    const mesh = this.#requireRef(ref).getMesh();
    const numProp = mesh.numProp;
    if (numProp < 3) {
      throw new KernelError('kernel-status', `La malla del kernel no tiene canales de posición (numProp=${numProp})`);
    }

    // posiciones en mm (stride = numProp); se copian solo los 3 primeros canales.
    const vertexCount = mesh.numVert;
    const positions = new Float32Array(vertexCount * 3);
    const source = mesh.vertProperties;
    for (let v = 0; v < vertexCount; v += 1) {
      const base = v * numProp;
      positions[v * 3] = source[base] ?? 0;
      positions[v * 3 + 1] = source[base + 1] ?? 0;
      positions[v * 3 + 2] = source[base + 2] ?? 0;
    }

    const indices = Uint32Array.from(mesh.triVerts);
    const bounds = aabbFromBox(this.#requireRef(ref).boundingBox());
    return { positions, indices, bounds };
  }

  dispose(ref: KernelRef): void {
    const solid = this.#handles.get(ref);
    if (solid === undefined) {
      return; // idempotente: liberar dos veces no es un error
    }
    solid.delete();
    this.#handles.delete(ref);
  }

  disposeAll(): void {
    for (const solid of this.#handles.values()) {
      solid.delete();
    }
    this.#handles.clear();
  }

  /** Sólidos vivos observados (para tests de limpieza). */
  get liveCount(): number {
    return this.#handles.size;
  }
}
