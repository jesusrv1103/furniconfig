/**
 * FASE-4B-D — servicio de regeneración asíncrona (D4a): resultados fuera
 * de orden, cancelación por objeto, vigencia de documento/objeto/params,
 * liberación de `KernelRef`, recuperación tras reinicio del worker y
 * verificación con WASM real tras `MessageChannel`.
 */

import { describe, expect, it } from 'vitest';

import {
  ManifoldKernel,
  OperationCancelledError,
  WorkerGeometryKernel,
  startKernelWorker,
  type AsyncGeometryKernel,
  type KernelCallOptions,
  type KernelRef,
  type KernelWorkerSession,
  type MeasureResult,
  type MeshData,
  type WorkerPort,
  type WorkerPortEvent,
} from '@furniconfig/kernel-adapter';
import {
  createComponentRegistry,
  createEmptySceneDocument,
  defineComponent,
  validateSceneDocument,
  type MmPoint3,
  type ParametricComponentRegistry,
  type SceneDocument,
  type SceneObject,
} from '@furniconfig/modeler-core';

import {
  SceneGeometryService,
  regenerationCancelKey,
  type DerivedGeometry,
} from '../../src/lib/modeler/regeneration.js';

// ---------------------------------------------------------------------------
// Registry de prueba (caja simple, sin geometry-core)
// ---------------------------------------------------------------------------

const plateRegistry: ParametricComponentRegistry = createComponentRegistry([
  defineComponent({
    type: 'test.plate',
    version: 1,
    paramsSchema: {
      widthMm: { kind: 'number', min: 1, max: 100_000 },
      heightMm: { kind: 'number', min: 1, max: 100_000 },
      thicknessMm: { kind: 'number', min: 1, max: 10_000 },
    },
    build(params) {
      const width = params.widthMm as number;
      const height = params.heightMm as number;
      const thickness = params.thicknessMm as number;
      return {
        parts: [
          {
            kind: 'box',
            partId: 'plate',
            role: 'plate',
            sizeMm: [width, height, thickness] as MmPoint3,
            positionMm: [0, 0, 0] as MmPoint3,
          },
        ],
      };
    },
  }),
]);

// ---------------------------------------------------------------------------
// Documentos de prueba
// ---------------------------------------------------------------------------

const material = {
  id: 'material-1',
  name: 'Prueba',
  finish: 'mate',
  thicknessMm: 18,
};

function sketchSolid(id: string, widthMm = 400, extrusionMm = 18): SceneObject {
  return {
    id,
    kind: 'solid',
    name: `Sólido ${id}`,
    transform: { positionMm: [0, 0, 0] },
    geometry: {
      source: 'sketch',
      sketch: {
        plane: 'ground',
        planeOriginMm: [0, 0, 0],
        pointsMm: [
          [0, 0],
          [widthMm, 0],
          [widthMm, 300],
          [0, 300],
        ],
        closed: true,
      },
      extrusionMm,
    },
    materialId: 'material-1',
  };
}

function plateComponent(id: string, widthMm = 400): SceneObject {
  return {
    id,
    kind: 'component',
    name: `Componente ${id}`,
    type: 'test.plate',
    version: 1,
    transform: { positionMm: [0, 0, 0] },
    materialId: 'material-1',
    params: { widthMm, heightMm: 300, thicknessMm: 18 },
  };
}

function makeDoc(objects: SceneObject[], id = 'scene-1'): SceneDocument {
  const base = createEmptySceneDocument(id);
  const result = validateSceneDocument(
    { ...base, materials: [material], objects },
    { components: plateRegistry },
  );
  if (!result.ok) {
    throw new Error(`fixture inválido: ${result.errors[0]?.message ?? ''}`);
  }
  return result.document;
}

function makeMesh(max: MmPoint3): MeshData {
  return {
    positions: new Float32Array([0, 0, 0]),
    indices: new Uint32Array([0, 0, 0]),
    bounds: { min: [0, 0, 0], max },
  };
}

// ---------------------------------------------------------------------------
// Kernel falso controlable (DI total; determinista)
// ---------------------------------------------------------------------------

interface ToMeshWaiter {
  readonly ref: KernelRef;
  readonly cancelKey: string | undefined;
  readonly resolve: (mesh: MeshData) => void;
  readonly reject: (error: unknown) => void;
  settled: boolean;
  /** Clave de la cancelación que lo retiró (pruebas de aislamiento por clave). */
  cancelledByKey?: string;
}

interface FromSketchWaiter {
  readonly pointsMm: readonly (readonly [number, number])[];
  readonly extrusionMm: number;
  readonly cancelKey: string | undefined;
  readonly resolve: (ref: KernelRef) => void;
  readonly reject: (error: unknown) => void;
  settled: boolean;
  /** Clave de la cancelación que lo retiró (pruebas de aislamiento por clave). */
  cancelledByKey?: string;
}

class FakeKernel implements AsyncGeometryKernel {
  readonly name = 'fake';
  readonly ready: Promise<void> = Promise.resolve();
  /**
   * Cuando es `true`, `fromSketch` queda pendiente hasta `settleFromSketch`
   * (para probar cancelación ANTES de que exista una KernelRef).
   */
  holdFromSketch = false;
  readonly fromSketchCalls: {
    pointsMm: readonly (readonly [number, number])[];
    extrusionMm: number;
    cancelKey?: string;
  }[] = [];
  readonly fromSketchWaiters: FromSketchWaiter[] = [];
  readonly disposed: KernelRef[] = [];
  readonly cancelCalls: string[] = [];
  readonly waiters: ToMeshWaiter[] = [];
  #nextRef = 1;

  box(_sizeMm: MmPoint3, _options?: KernelCallOptions): Promise<KernelRef> {
    return Promise.resolve(this.#nextRef++);
  }
  fromSketch(
    pointsMm: readonly (readonly [number, number])[],
    extrusionMm: number,
    options?: KernelCallOptions,
  ): Promise<KernelRef> {
    // Supersede idéntico a WorkerGeometryKernel.#call: publicar una operación
    // con la misma clave retira las pendientes de esa clave.
    if (options?.cancelKey !== undefined) this.cancel(options.cancelKey);
    this.fromSketchCalls.push({ pointsMm, extrusionMm, cancelKey: options?.cancelKey });
    if (this.holdFromSketch) {
      return new Promise<KernelRef>((resolve, reject) => {
        this.fromSketchWaiters.push({
          pointsMm,
          extrusionMm,
          cancelKey: options?.cancelKey,
          resolve,
          reject,
          settled: false,
        });
      });
    }
    return Promise.resolve(this.#nextRef++);
  }
  union(): Promise<KernelRef> {
    return Promise.resolve(this.#nextRef++);
  }
  difference(): Promise<KernelRef> {
    return Promise.resolve(this.#nextRef++);
  }
  intersect(): Promise<KernelRef> {
    return Promise.resolve(this.#nextRef++);
  }
  translate(ref: KernelRef): Promise<KernelRef> {
    return Promise.resolve(ref);
  }
  rotateZ(ref: KernelRef): Promise<KernelRef> {
    return Promise.resolve(ref);
  }
  scale(ref: KernelRef): Promise<KernelRef> {
    return Promise.resolve(ref);
  }
  measure(_ref: KernelRef): Promise<MeasureResult> {
    return Promise.resolve({ volumeMm3: 0, boundsMm: { min: [0, 0, 0], max: [0, 0, 0] } });
  }
  toMesh(ref: KernelRef, options?: KernelCallOptions): Promise<MeshData> {
    return new Promise((resolve, reject) => {
      this.waiters.push({
        ref,
        cancelKey: options?.cancelKey,
        resolve,
        reject,
        settled: false,
      });
    });
  }
  dispose(ref: KernelRef): Promise<void> {
    this.disposed.push(ref);
    if (this.failDispose) {
      return Promise.reject(new Error('dispose falló (simulado)'));
    }
    return Promise.resolve();
  }
  /** `true` → `dispose` rechaza (prueba de resiliencia del servicio). */
  failDispose = false;
  disposeAll(): Promise<void> {
    return Promise.resolve();
  }

  /** Método propio del WorkerGeometryKernel concreto (el servicio lo trata opcional). */
  cancel(cancelKey: string): number {
    this.cancelCalls.push(cancelKey);
    let cancelled = 0;
    for (const waiter of this.waiters) {
      if (!waiter.settled && waiter.cancelKey === cancelKey) {
        waiter.settled = true;
        waiter.cancelledByKey = cancelKey;
        waiter.reject(new OperationCancelledError(cancelled + 1, cancelKey));
        cancelled += 1;
      }
    }
    for (const pending of this.fromSketchWaiters) {
      if (!pending.settled && pending.cancelKey === cancelKey) {
        pending.settled = true;
        pending.cancelledByKey = cancelKey;
        pending.reject(new OperationCancelledError(cancelled + 1, cancelKey));
        cancelled += 1;
      }
    }
    return cancelled;
  }

  /** Rechaza el `toMesh` en vuelo con un error real (no de cancelación). */
  failWaiter(index: number, error: Error): void {
    const waiter = this.waiters[index];
    if (waiter === undefined || waiter.settled) {
      throw new Error(`waiter ${index} no disponible para fallar`);
    }
    waiter.settled = true;
    waiter.reject(error);
  }

  /** Libera un `fromSketch` retenido por `holdFromSketch` (crea la ref). */
  settleFromSketch(index: number): void {
    const waiter = this.fromSketchWaiters[index];
    if (waiter === undefined || waiter.settled) {
      throw new Error(`fromSketch waiter ${index} no disponible`);
    }
    waiter.settled = true;
    waiter.resolve(this.#nextRef++);
  }

  settle(index: number, mesh: MeshData): void {
    const waiter = this.waiters[index];
    if (waiter === undefined || waiter.settled) {
      throw new Error(`waiter ${index} no disponible (${this.waiters.length} encolados)`);
    }
    waiter.settled = true;
    waiter.resolve(mesh);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`waitFor agotado: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** `toMesh` se encola en una microtarea tras `fromSketch`: esperar su llega. */
function waitForWaiters(kernel: FakeKernel, count: number): Promise<void> {
  return waitFor(() => kernel.waiters.length >= count, `toMesh x${count} encolado`);
}

describe('SceneGeometryService (D4a) con kernel falso', () => {
  it('publica las partes de un componente de forma síncrona', () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    service.submit(makeDoc([plateComponent('component-1')]));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      objectId: 'component-1',
      kind: 'component-parts',
      revision: 1,
    });
    expect(service.stats).toMatchObject({ published: 1, pending: 0, liveRefs: 0 });
  });

  it('regenera el sólido por kernel y LIBERA su KernelRef tras la malla', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    service.submit(makeDoc([sketchSolid('object-1')]));
    expect(kernel.fromSketchCalls).toHaveLength(1);
    expect(kernel.fromSketchCalls[0]?.cancelKey).toBe(regenerationCancelKey('object-1'));
    expect(service.stats.pending).toBe(1);

    await waitForWaiters(kernel, 1);
    kernel.settle(0, makeMesh([400, 300, 18]));
    await waitFor(() => results.length === 1, 'malla publicada');

    expect(results[0]).toMatchObject({ objectId: 'object-1', kind: 'solid-mesh', revision: 1 });
    await waitFor(() => kernel.disposed.length === 1, 'ref liberada');
    expect(kernel.disposed[0]).toBe(1); // la ref devuelta por fromSketch
    await waitFor(() => service.stats.liveRefs === 0, 'sin refs vivas');
  });

  it('resultados fuera de orden: solo se publica la revisión vigente', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    service.submit(makeDoc([sketchSolid('object-1')], 'scene-1')); // rev 1
    service.submit(makeDoc([sketchSolid('object-1')], 'scene-2')); // rev 2
    expect(kernel.fromSketchCalls).toHaveLength(2);
    await waitForWaiters(kernel, 2);

    // la revisión nueva llega PRIMERO (fuera de orden)
    kernel.settle(1, makeMesh([400, 300, 18]));
    await waitFor(() => results.length === 1, 'rev 2 publicada');
    expect(results[0]?.revision).toBe(2);

    // la vieja llega después: se descarta como obsoleta
    kernel.settle(0, makeMesh([400, 300, 18]));
    await waitFor(() => service.stats.droppedStale >= 1, 'rev 1 descartada');
    expect(results).toHaveLength(1);
    expect(service.stats).toMatchObject({ published: 1, droppedStale: 1 });
  });

  it('valida la vigencia de params antes de publicar (huella canónica)', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    service.submit(makeDoc([sketchSolid('object-1', 400)]));
    service.submit(makeDoc([sketchSolid('object-1', 500)])); // params distintos
    await waitForWaiters(kernel, 2);

    kernel.settle(0, makeMesh([400, 300, 18]));
    await waitFor(() => service.stats.droppedStale >= 1, 'obsoleto por huella/revisión');
    expect(results).toHaveLength(0);
    kernel.settle(1, makeMesh([500, 300, 18]));
    await waitFor(() => results.length === 1, 'vigente publicado');
    expect(results[0]?.revision).toBe(2);
  });

  it('cancela por objectId el objeto eliminado del documento', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const failures: unknown[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1')]));
    await waitForWaiters(kernel, 1);
    service.submit(makeDoc([])); // el objeto desaparece

    expect(kernel.cancelCalls).toContain(regenerationCancelKey('object-1'));
    // el waiter fue rechazado por la cancelación: ni publicación ni fallo
    await waitFor(() => service.stats.pending === 0, 'sin pendientes');
    expect(results).toHaveLength(0);
    expect(failures).toHaveLength(0);
  });

  it('tras un reinicio reconstruye TODO desde el documento', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    const doc = makeDoc([sketchSolid('object-1'), plateComponent('component-1')]);
    service.submit(doc);
    expect(results).toHaveLength(1); // el componente (sync)
    await waitForWaiters(kernel, 1);

    service.handleKernelRestart();

    // se reconstruye desde el documento: nuevo fromSketch + componente otra vez
    expect(kernel.fromSketchCalls).toHaveLength(2);
    expect(results.filter((r) => r.kind === 'component-parts')).toHaveLength(2);

    // el supersede por clave (igual que el kernel real) retira la operación
    // del epoch anterior: cancelación silenciosa (ni publicación ni fallo)
    // con su ref liberada
    await waitFor(() => kernel.waiters[0]?.settled === true, 'epoch anterior cancelado');
    expect(kernel.waiters[0]?.cancelledByKey).toBe(regenerationCancelKey('object-1'));
    expect(service.stats.droppedStale).toBe(0);
    expect(results.filter((r) => r.kind === 'solid-mesh')).toHaveLength(0);
    await waitFor(() => kernel.disposed.length === 1, 'ref del epoch viejo liberada');

    await waitForWaiters(kernel, 2);
    kernel.settle(1, makeMesh([400, 300, 18]));
    await waitFor(
      () => results.some((result) => result.kind === 'solid-mesh' && result.revision === 2),
      'malla del epoch nuevo',
    );
    await waitFor(() => service.stats.liveRefs === 0, 'refs liberadas tras reinicio');
  });

  it('reporta honestamente los sólidos de fuente kernel como no derivables', () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    const base = createEmptySceneDocument();
    const result = validateSceneDocument({
      ...base,
      materials: [material],
      objects: [
        {
          id: 'object-9',
          kind: 'solid',
          name: 'Caché',
          transform: { positionMm: [0, 0, 0] },
          geometry: { source: 'kernel', key: 'cache-1' },
          materialId: 'material-1',
        },
      ],
    });
    if (!result.ok) throw new Error('fixture inválido');
    service.submit(result.document);
    expect(results[0]).toMatchObject({ kind: 'not-derivable', objectId: 'object-9' });
  });

  it('un componente con tipo desconocido produce onFailure sin romper el servicio', () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const failures: { objectId: string | null; message: string }[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    const base = createEmptySceneDocument();
    // validado SIN registro: el documento permite tipos desconocidos
    const result = validateSceneDocument({
      ...base,
      materials: [material],
      objects: [
        {
          id: 'component-404',
          kind: 'component',
          name: 'Desconocido',
          type: 'no.registrado',
          version: 1,
          transform: { positionMm: [0, 0, 0] },
          materialId: 'material-1',
        },
      ],
    });
    if (!result.ok) throw new Error('fixture inválido');
    service.submit(result.document);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.objectId).toBe('component-404');
    expect(results).toHaveLength(0);
    expect(service.stats.pending).toBe(0);
  });

  it('dispose cancela lo pendiente y rechaza nuevos envíos', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const failures: unknown[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1')]));
    await waitForWaiters(kernel, 1); // la malla está en vuelo
    service.dispose();
    expect(kernel.cancelCalls).toContain(regenerationCancelKey('object-1'));
    expect(service.stats.pending).toBe(0);
    expect(() => service.submit(makeDoc([]))).toThrow(/disposed/);
    // el resultado huérfano se descarta en silencio (cancelado o tardío)
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(results).toHaveLength(0);
    expect(failures).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Auditoría 4B-D §4 — escenarios de concurrencia, cancelación y fallos
// ---------------------------------------------------------------------------

describe('SceneGeometryService (D4a): auditoría de concurrencia y fallos', () => {
  it('dos regeneraciones simultáneas del mismo objeto: solo publica la última', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const failures: { objectId: string | null; revision: number }[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1')], 'scene-1'));
    await waitForWaiters(kernel, 1); // rev 1 en vuelo con su ref

    service.submit(makeDoc([sketchSolid('object-1')], 'scene-2')); // rev 2

    // el supersede por clave retira la operación vieja (como el kernel real)
    await waitFor(() => kernel.waiters[0]?.settled === true, 'rev 1 cancelada');
    expect(kernel.waiters[0]?.cancelledByKey).toBe(regenerationCancelKey('object-1'));

    await waitForWaiters(kernel, 2);
    kernel.settle(1, makeMesh([400, 300, 18]));
    await waitFor(() => results.length === 1, 'rev 2 publicada');
    // regresión del defecto hallado en la auditoría: la cancelación de la
    // rev 1 NO debe borrar la entrada pendiente de la rev 2
    expect(results[0]).toMatchObject({ objectId: 'object-1', revision: 2 });
    expect(failures).toHaveLength(0);
    expect(service.stats).toMatchObject({ published: 1, pending: 0, failures: 0 });
    await waitFor(() => kernel.disposed.length === 2, 'ambas refs liberadas');
    await waitFor(() => service.stats.liveRefs === 0, 'sin refs huérfanas');
  });

  it('objetos distintos regeneran en paralelo sin interferirse', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
    });
    service.submit(makeDoc([sketchSolid('object-1', 400), sketchSolid('object-2', 500)]));
    await waitForWaiters(kernel, 2);

    kernel.settle(0, makeMesh([400, 300, 18]));
    kernel.settle(1, makeMesh([500, 300, 18]));
    await waitFor(() => results.length === 2, 'ambas mallas');
    expect(new Set(results.map((result) => result.objectId))).toEqual(
      new Set(['object-1', 'object-2']),
    );
    await waitFor(() => kernel.disposed.length === 2, 'refs liberadas');
    await waitFor(() => service.stats.liveRefs === 0, 'sin refs vivas');
    expect(service.stats).toMatchObject({ published: 2, pending: 0, failures: 0, droppedStale: 0 });
  });

  it('cancelación ANTES de crear KernelRef: sin publicación, sin fallo, sin ref', async () => {
    const kernel = new FakeKernel();
    kernel.holdFromSketch = true; // fromSketch retenido: aún no existe ref
    const results: DerivedGeometry[] = [];
    const failures: unknown[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1')]));
    expect(kernel.fromSketchWaiters).toHaveLength(1);
    expect(kernel.waiters).toHaveLength(0); // sin toMesh: sin ref creada
    expect(service.stats.pending).toBe(1);

    service.dispose();

    expect(kernel.cancelCalls).toContain(regenerationCancelKey('object-1'));
    expect(kernel.fromSketchWaiters[0]?.cancelledByKey).toBe(regenerationCancelKey('object-1'));
    await new Promise((resolve) => setTimeout(resolve, 20)); // cadena caída
    expect(results).toHaveLength(0);
    expect(failures).toHaveLength(0);
    expect(service.stats).toMatchObject({ pending: 0, liveRefs: 0 });
    expect(kernel.disposed).toHaveLength(0); // nunca existió una KernelRef
  });

  it('la cancelación de un objeto no afecta a otro (aislamiento por clave)', async () => {
    const kernel = new FakeKernel();
    kernel.holdFromSketch = true;
    const results: DerivedGeometry[] = [];
    const failures: unknown[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1'), sketchSolid('object-2', 500)]));
    expect(kernel.fromSketchWaiters).toHaveLength(2);
    expect(service.stats.pending).toBe(2);

    service.submit(makeDoc([sketchSolid('object-1')])); // se elimina object-2

    // cada cancelación retiró SOLO su clave
    expect(kernel.fromSketchWaiters[0]?.cancelledByKey).toBe(regenerationCancelKey('object-1'));
    expect(kernel.fromSketchWaiters[1]?.cancelledByKey).toBe(regenerationCancelKey('object-2'));
    // la nueva solicitud de object-2 nunca existió; la de object-1 sigue viva
    expect(kernel.fromSketchWaiters).toHaveLength(3);
    expect(kernel.fromSketchWaiters[2]?.cancelledByKey).toBeUndefined();

    // object-1 completa su camino hasta publicar
    kernel.settleFromSketch(2);
    await waitForWaiters(kernel, 1);
    kernel.settle(0, makeMesh([400, 300, 18]));
    await waitFor(() => results.length === 1, 'object-1 publicado');
    expect(results[0]).toMatchObject({ objectId: 'object-1', revision: 2 });
    expect(failures).toHaveLength(0);
    expect(service.stats).toMatchObject({ pending: 0 });
  });

  it('un fallo de toMesh se reporta y su KernelRef se libera', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const failures: { objectId: string | null; revision: number; message: string }[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1')]));
    await waitForWaiters(kernel, 1);
    kernel.failWaiter(0, new Error('toMesh falló (simulado)'));

    await waitFor(() => failures.length === 1, 'fallo reportado');
    expect(failures[0]).toMatchObject({ objectId: 'object-1', revision: 1 });
    expect(results).toHaveLength(0);
    await waitFor(() => kernel.disposed.length === 1, 'ref liberada también en fallo');
    await waitFor(() => service.stats.liveRefs === 0, 'sin refs vivas');
    expect(service.stats.pending).toBe(0);
  });

  it('un dispose que rechaza no rompe el servicio ni cuenta como fallo', async () => {
    const kernel = new FakeKernel();
    kernel.failDispose = true;
    const results: DerivedGeometry[] = [];
    const failures: unknown[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1')]));
    await waitForWaiters(kernel, 1);
    kernel.settle(0, makeMesh([400, 300, 18]));

    await waitFor(() => results.length === 1, 'malla publicada pese al fallo de dispose');
    await waitFor(() => kernel.disposed.length === 1, 'dispose intentado');
    await waitFor(() => service.stats.liveRefs === 0, 'ref descartada de todas formas');
    expect(failures).toHaveLength(0); // el dispose fallido no es fallo de regeneración
  });

  it('documento reemplazado durante el cálculo: solo se publica el vigente', async () => {
    const kernel = new FakeKernel();
    const results: DerivedGeometry[] = [];
    const failures: { objectId: string | null; revision: number }[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });
    service.submit(makeDoc([sketchSolid('object-1', 400)], 'scene-1'));
    await waitForWaiters(kernel, 1); // cálculo en vuelo

    // otro documento con sus propios objetos reemplaza al anterior
    service.submit(
      makeDoc([sketchSolid('object-1', 400), plateComponent('component-1')], 'scene-2'),
    );
    expect(kernel.waiters[0]?.cancelledByKey).toBe(regenerationCancelKey('object-1'));
    await waitFor(
      () => results.some((result) => result.kind === 'component-parts' && result.revision === 2),
      'componente del documento nuevo',
    );

    await waitForWaiters(kernel, 2);
    kernel.settle(1, makeMesh([400, 300, 18]));
    await waitFor(
      () => results.some((result) => result.kind === 'solid-mesh' && result.revision === 2),
      'malla del documento nuevo',
    );
    // nada del documento viejo llega a publicarse
    expect(results.filter((result) => result.kind === 'solid-mesh')).toHaveLength(1);
    await waitFor(() => kernel.disposed.length === 2, 'refs del doc viejo y nuevo liberadas');
    await waitFor(() => service.stats.pending === 0, 'sin pendientes');
    expect(service.stats).toMatchObject({ published: 2, droppedStale: 0, failures: 0, liveRefs: 0 });
  });
});

// ---------------------------------------------------------------------------
// Integración con WASM real (worker + MessageChannel del runtime)
// ---------------------------------------------------------------------------

/** Adaptador del puerto real de Node → WorkerPort (misma interfaz que4B-C). */
class PortAdapter implements WorkerPort {
  onmessage: ((event: WorkerPortEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly #port: MessagePort & { unref?: () => void };
  #closed = false;

  constructor(port: MessagePort & { unref?: () => void }) {
    this.#port = port;
    port.addEventListener('message', (event: MessageEvent) =>
      this.onmessage?.({ data: event.data }),
    );
    port.start();
    port.unref?.();
  }

  postMessage(message: unknown, transfer?: readonly ArrayBuffer[]): void {
    if (this.#closed) return;
    if (transfer !== undefined && transfer.length > 0) {
      this.#port.postMessage(message, [...transfer] as Transferable[]);
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

describe('SceneGeometryService (D4a) con worker real (WASM)', () => {
  it('regenera sólidos y componentes, libera refs y se recupera del reinicio', async () => {
    const sessions: KernelWorkerSession[] = [];
    // Cada epoch necesita su PROPIO MessageChannel: terminateAndRestart cierra
    // el puerto anterior y vuelve a invocar createPort (patrón de
    // `createLinkedKernel` en las pruebas de kernel-adapter).
    const kernel = new WorkerGeometryKernel({
      createPort: () => {
        const channel = new MessageChannel();
        const workerSide = new PortAdapter(channel.port2);
        const proxySide = new PortAdapter(channel.port1);
        sessions.push(startKernelWorker(workerSide, new ManifoldKernel()));
        return proxySide;
      },
    });
    const results: DerivedGeometry[] = [];
    const failures: { message: string }[] = [];
    const service = new SceneGeometryService({
      kernel,
      components: plateRegistry,
      onResult: (result) => results.push(result),
      onFailure: (failure) => failures.push(failure),
    });

    service.submit(makeDoc([sketchSolid('object-1', 400), plateComponent('component-1')]));
    await waitFor(
      () =>
        results.some((result) => result.kind === 'solid-mesh') &&
        results.some((result) => result.kind === 'component-parts'),
      'geometría inicial',
    );
    expect(failures).toHaveLength(0);

    const mesh = results.find((result) => result.kind === 'solid-mesh');
    if (mesh?.kind !== 'solid-mesh') throw new Error('sin malla');
    expect(mesh.mesh.bounds.max).toEqual([400, 300, 18]);
    expect(mesh.mesh.positions.length).toBeGreaterThan(0);
    await waitFor(() => service.stats.liveRefs === 0, 'refs liberadas');

    // reinicio: el servicio reconstruye desde el documento con el worker nuevo
    results.length = 0;
    kernel.terminateAndRestart();
    service.handleKernelRestart();
    await waitFor(
      () => results.some((result) => result.kind === 'solid-mesh'),
      'malla tras reinicio',
    );
    const rebuilt = results.find((result) => result.kind === 'solid-mesh');
    if (rebuilt?.kind !== 'solid-mesh') throw new Error('sin malla tras reinicio');
    expect(rebuilt.mesh.bounds.max).toEqual([400, 300, 18]);
    await waitFor(() => service.stats.liveRefs === 0, 'refs liberadas tras reinicio');

    service.dispose();
    kernel.terminate();
    for (const session of sessions) session.close();
  }, 15_000);
});
