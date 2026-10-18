/**
 * FASE-4C-B, B4 — pruebas del coordinador de geometría de escena.
 *
 * Cubre con un kernel FALSO (inyección total, sin Worker real):
 *
 * - invariante: escena vacía → `ensureKernel` NUNCA se invoca;
 * - flujo completo añadir → pending → ready (malla en metros);
 * - cambios rápidos: solo publica la revisión vigente;
 * - objetos sin cambios de huella conservan SU malla;
 * - errores del kernel → estado `error` con mensaje + `retry`;
 * - cancelaciones (`OperationCancelledError`) no son fallo;
 * - reinicio del worker → resubmit total + `onRecovered`;
 * - `dispose` → estados liberados y tardíos ignorados;
 * - eliminación de objetos → sus estados desaparecen.
 */

import { describe, expect, it } from 'vitest';
import {
  OperationCancelledError,
  type AsyncGeometryKernel,
  type KernelRef,
  type MeshData,
  type MeasureResult,
} from '@furniconfig/kernel-adapter';
import {
  createEmptySceneDocument,
  type SceneDocument,
} from '@furniconfig/modeler-core';

import {
  applySceneAction,
  nextSolidId,
} from '../../src/lib/modeler/document-actions.js';
import { rectangleSketchFromCorners } from '../../src/lib/modeler/drawing.js';
import {
  SceneGeometryCoordinator,
  type SolidGeometryState,
} from '../../src/lib/modeler/scene-geometry-coordinator.js';

// ---------------------------------------------------------------------------
// Kernel falso con malla caja determinista
// ---------------------------------------------------------------------------

interface Deferred {
  readonly promise: Promise<void>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value?: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = () => innerResolve();
    reject = innerReject;
  });
  void promise.catch(() => undefined); // evita unhandledrejection en node
  return { promise, resolve, reject };
}

/** Malla caja válida a partir de los extremos del croquis (mm). */
/**
 * Malla-caja en convención de KERNEL (croquis en su plano XY con
 * extrusión +Z): el adaptador `createGroundSketchKernel` la
 * orienta a escena (x=ancho, y=altura, z=profundidad).
 */
function boxMesh(widthMm: number, depthMm: number, heightMm: number): MeshData {
  const hx = widthMm / 2;
  const hy = depthMm / 2;
  return {
    positions: new Float32Array([
      -hx, -hy, 0, hx, -hy, 0, hx, hy, 0, -hx, hy, 0,
      -hx, -hy, heightMm, hx, -hy, heightMm, hx, hy, heightMm, -hx, hy, heightMm,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
      1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
    bounds: { min: [-hx, -hy, 0], max: [hx, hy, heightMm] },
  };
}

class FakeKernel implements AsyncGeometryKernel {
  readonly name = 'fake-kernel';
  readonly ready: Promise<void> = Promise.resolve();

  fromSketchCalls: Array<{
    pointsMm: readonly (readonly [number, number])[];
    extrusionMm: number;
    cancelKey: string | undefined;
  }> = [];
  disposedRefs: KernelRef[] = [];
  liveRefs = new Set<KernelRef>();
  cancelCalls: string[] = [];

  /** Próximo `fromSketch` rechaza con este error (se consume). */
  failNextFromSketch: unknown = null;
  /** Próximo `fromSketch` queda diferido (control del orden). */
  deferNextFromSketch = false;
  /**
   * Próximo `fromSketch` queda diferido SIN registrar la clave de
   * cancelación: simula una respuesta que ESCAPA a la cancelación
   * (auditoría §3: eliminación durante regeneración).
   */
  deferNextFromSketchCancelless = false;
  cancellessWait: Deferred | null = null;
  /** Cancelar una clave rechaza la petición asociada en vuelo. */
  pendingByKey = new Map<string, Deferred>();

  #nextRef = 1;
  #refArgs = new Map<
    KernelRef,
    { widthMm: number; depthMm: number; heightMm: number }
  >();

  async fromSketch(
    pointsMm: readonly (readonly [number, number])[],
    extrusionMm: number,
    options?: { cancelKey?: string },
  ): Promise<KernelRef> {
    const cancelKey = options?.cancelKey;
    this.fromSketchCalls.push({ pointsMm, extrusionMm, cancelKey });
    if (this.failNextFromSketch !== null) {
      const error = this.failNextFromSketch;
      this.failNextFromSketch = null;
      throw error;
    }
    if (this.deferNextFromSketchCancelless) {
      this.deferNextFromSketchCancelless = false;
      const wait = deferred();
      this.cancellessWait = wait;
      await wait.promise;
    }
    if (this.deferNextFromSketch && cancelKey !== undefined) {
      const wait = deferred();
      this.pendingByKey.set(cancelKey, wait);
      await wait.promise;
    }
    const ref: KernelRef = this.#nextRef;
    this.#nextRef += 1;
    this.liveRefs.add(ref);
    // Caja determinista derivada del croquis real (no una fija).
    const us = pointsMm.map((point) => point[0]);
    const vs = pointsMm.map((point) => point[1]);
    this.#refArgs.set(ref, {
      widthMm: Math.max(...us) - Math.min(...us),
      depthMm: Math.max(...vs) - Math.min(...vs),
      heightMm: extrusionMm,
    });
    return ref;
  }

  async toMesh(ref: KernelRef): Promise<MeshData> {
    if (!this.liveRefs.has(ref)) throw new Error('unknown-ref');
    const args = this.#refArgs.get(ref);
    if (args === undefined) throw new Error('sin argumentos para la ref');
    return boxMesh(args.widthMm, args.depthMm, args.heightMm);
  }

  async dispose(ref: KernelRef): Promise<void> {
    this.disposedRefs.push(ref);
    this.liveRefs.delete(ref);
  }

  cancel(cancelKey: string): number {
    this.cancelCalls.push(cancelKey);
    const wait = this.pendingByKey.get(cancelKey);
    if (wait !== undefined) {
      this.pendingByKey.delete(cancelKey);
      wait.reject(new OperationCancelledError(0, cancelKey));
      return 1;
    }
    return 0;
  }

  // Operaciones no usadas por el flujo de 4C-B.
  async box(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async union(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async difference(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async intersect(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async translate(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async rotateZ(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async scale(): Promise<KernelRef> {
    throw new Error('no implementado en el kernel falso');
  }
  async measure(): Promise<MeasureResult> {
    throw new Error('no implementado en el kernel falso');
  }
  async disposeAll(): Promise<void> {
    this.liveRefs.clear();
  }
}

// ---------------------------------------------------------------------------
// Fixtures y helpers
// ---------------------------------------------------------------------------

function docWithRect(widthMm: number, depthMm: number, extrusionMm = 100): SceneDocument {
  const sketch = rectangleSketchFromCorners([0, 0], [widthMm, depthMm]);
  if (sketch === null) throw new Error('fixture inválida');
  const next = applySceneAction(createEmptySceneDocument(), {
    type: 'add-solid',
    sketch,
    extrusionMm,
  });
  if (next === null) throw new Error('add-solid falló en la fixture');
  return next;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

interface Harness {
  readonly coordinator: SceneGeometryCoordinator;
  readonly kernel: FakeKernel;
  readonly ensureCalls: () => number;
  readonly lastStates: () => ReadonlyMap<string, SolidGeometryState>;
  readonly recovered: () => number;
  /** Resuelve la creación diferida del kernel (solo con `ensureDeferred`). */
  readonly resolveEnsure: () => void;
}

function createHarness(
  overrides: { ensureRejects?: boolean; ensureDeferred?: boolean } = {},
): Harness {
  const kernel = new FakeKernel();
  let ensureCalls = 0;
  let states: ReadonlyMap<string, SolidGeometryState> = new Map();
  let recovered = 0;
  let resolveEnsure: (() => void) | null = null;
  const coordinator = new SceneGeometryCoordinator({
    ensureKernel: () => {
      ensureCalls += 1;
      if (overrides.ensureRejects === true) {
        return Promise.reject(new Error('worker no disponible'));
      }
      if (overrides.ensureDeferred === true) {
        // Arranque del Worker/WASM EN VUEO: la promesa no resuelve
        // hasta que la test lo decide (`resolveEnsure`).
        const wait = deferred();
        resolveEnsure = () => wait.resolve(undefined);
        return wait.promise.then(() => kernel);
      }
      return Promise.resolve(kernel);
    },
    onChange: (next) => {
      states = next;
    },
    onRecovered: () => {
      recovered += 1;
    },
  });
  return {
    coordinator,
    kernel,
    ensureCalls: () => ensureCalls,
    lastStates: () => states,
    recovered: () => recovered,
    resolveEnsure: () => {
      if (resolveEnsure === null) {
        throw new Error('ensureKernel no estaba en vuelo');
      }
      resolveEnsure();
    },
  };
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

describe('SceneGeometryCoordinator (B4)', () => {
  it('escena vacía: ensureKernel NUNCA se invoca (Worker no creado)', async () => {
    const harness = createHarness();
    harness.coordinator.setDocument(createEmptySceneDocument());
    await flush();
    expect(harness.ensureCalls()).toBe(0);
    expect(harness.lastStates().size).toBe(0);
    expect(harness.coordinator.stats.service).toBeNull();
  });

  it('añadir un sólido: pending → ready con malla en metros', async () => {
    const harness = createHarness();
    const document = docWithRect(1000, 500);
    harness.coordinator.setDocument(document);
    // Tras el envío inmediato el estado es pending (Worker en camino).
    expect(harness.lastStates().get('solid-1')?.status).toBe('pending');
    await flush();
    const state = harness.lastStates().get('solid-1');
    expect(state?.status).toBe('ready');
    expect(state?.mesh?.objectId).toBe('solid-1');
    // Malla en METROS:1000 mm → 1.0 m de ancho en bounds.
    expect(state?.mesh?.boundsM.max[0]).toBeCloseTo(0.5, 6);
    expect(state?.mesh?.boundsM.max[1]).toBeCloseTo(0.1, 6);
    // Referencias del kernel: tras toMesh se libera (cero fugas).
    expect(harness.kernel.liveRefs.size).toBe(0);
    expect(harness.kernel.disposedRefs.length).toBe(1);
    expect(harness.coordinator.stats.service?.liveRefs).toBe(0);
  });

  it('cambios rápidos: solo publica la revisión vigente', async () => {
    const harness = createHarness();
    harness.kernel.deferNextFromSketch = true;
    const base = docWithRect(1000, 500);

    harness.coordinator.setDocument(base);
    await flush(); // servicio creado; primer fromSketch diferido

    // Tres cambios seguidos de la profundidad.
    harness.coordinator.setDocument(docWithRect(1000, 200));
    harness.coordinator.setDocument(docWithRect(1000, 300));
    harness.coordinator.setDocument(docWithRect(1000, 400));
    await flush();

    // Resuelven FUERA de orden: primero la última, luego las viejas.
    const keys = [...harness.kernel.pendingByKey.keys()];
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) throw new Error('sin peticiones diferidas');
    for (const key of [lastKey, ...keys]) {
      const wait = harness.kernel.pendingByKey.get(key);
      if (wait !== undefined) {
        harness.kernel.pendingByKey.delete(key);
        wait.resolve(undefined);
      }
    }
    await flush();
    await flush();

    const state = harness.lastStates().get('solid-1');
    expect(state?.status).toBe('ready');
    // La publicación obsoleta NO machaca la vigente: la huella
    // aplicada corresponde al último documento.
    const stats = harness.coordinator.stats;
    expect(stats.published).toBeGreaterThanOrEqual(1);
    const serviceStats = stats.service;
    expect(serviceStats?.droppedStale ?? 0).toBeGreaterThanOrEqual(0);
    // Y la malla refleja la ÚLTIMA geometría (profundidad 400).
    expect(state?.mesh?.boundsM.max[2]).toBeCloseTo(0.2, 6);
  });

  it('objeto sin cambios de huella conserva SU malla (misma referencia)', async () => {
    const harness = createHarness();
    const document = docWithRect(1000, 500);
    harness.coordinator.setDocument(document);
    await flush();
    const first = harness.lastStates().get('solid-1');
    expect(first?.status).toBe('ready');

    // Documento NUEVO con el mismo sólido (otra referencia, misma geometría).
    const structuralOnly = applySceneAction(document, {
      type: 'set-grid-step',
      gridStepMm: 50,
    });
    expect(structuralOnly).not.toBeNull();
    harness.coordinator.setDocument(structuralOnly ?? document);
    await flush();
    const second = harness.lastStates().get('solid-1');
    expect(second?.mesh).toBe(first?.mesh); // misma referencia → sin recrear geometría
    expect(second?.revision).toBeGreaterThan(first?.revision ?? 0);
  });

  it('cambio de cota → nueva malla (referencia nueva y bounds nuevos)', async () => {
    const harness = createHarness();
    const document = docWithRect(1000, 500);
    harness.coordinator.setDocument(document);
    await flush();
    const first = harness.lastStates().get('solid-1');

    const wider = applySceneAction(document, {
      type: 'set-extrusion',
      objectId: 'solid-1',
      extrusionMm: 250,
    });
    expect(wider).not.toBeNull();
    harness.coordinator.setDocument(wider ?? document);
    await flush();
    const second = harness.lastStates().get('solid-1');
    expect(second?.status).toBe('ready');
    expect(second?.mesh).not.toBe(first?.mesh);
    expect(second?.mesh?.boundsM.max[1]).toBeCloseTo(0.25, 6);
  });

  it('error del kernel → estado error con mensaje y retry lo recupera', async () => {
    const harness = createHarness();
    harness.kernel.failNextFromSketch = new Error('invalid-input');
    harness.coordinator.setDocument(docWithRect(1000, 500));
    await flush();
    const failed = harness.lastStates().get('solid-1');
    expect(failed?.status).toBe('error');
    expect(failed?.errorMessage).toContain('invalid-input');

    harness.coordinator.retry('solid-1');
    expect(harness.lastStates().get('solid-1')?.status).toBe('pending');
    await flush();
    const recovered = harness.lastStates().get('solid-1');
    expect(recovered?.status).toBe('ready');
  });

  it('fallo de arranque del motor → error honesto y retry re-intenta', async () => {
    let fail = true;
    const kernel = new FakeKernel();
    let states: ReadonlyMap<string, SolidGeometryState> = new Map();
    const coordinator = new SceneGeometryCoordinator({
      ensureKernel: () =>
        fail ? Promise.reject(new Error('sin worker')) : Promise.resolve(kernel),
      onChange: (next) => {
        states = next;
      },
    });
    coordinator.setDocument(docWithRect(1000, 500));
    await flush();
    expect(states.get('solid-1')?.status).toBe('error');
    expect(states.get('solid-1')?.errorMessage).toContain('motor geométrico');

    fail = false;
    coordinator.retry('solid-1');
    await flush();
    expect(states.get('solid-1')?.status).toBe('ready');
  });

  it('cancelación (OperationCancelledError) NO es fallo', async () => {
    const harness = createHarness();
    harness.kernel.deferNextFromSketch = true;
    harness.coordinator.setDocument(docWithRect(1000, 500));
    await flush();
    // Cambio de documento: el servicio cancela la clave del objeto.
    harness.coordinator.setDocument(docWithRect(800, 500));
    // El fake cancela la petición en vuelo con el error real.
    for (const key of [...harness.kernel.pendingByKey.keys()]) {
      harness.kernel.cancel(key);
    }
    await flush();
    const state = harness.lastStates().get('solid-1');
    // O bien sigue pendiente de la revisión vigente o ya resolvió;
    // NUNCA un error por cancelación.
    expect(state?.status).not.toBe('error');
    expect(harness.coordinator.stats.service?.failures ?? 0).toBe(0);
  });

  it('reinicio del worker → resubmit y onRecovered en la primera publicación', async () => {
    const harness = createHarness();
    harness.coordinator.setDocument(docWithRect(1000, 500));
    await flush();
    expect(harness.recovered()).toBe(0);

    const callsBefore = harness.kernel.fromSketchCalls.length;
    harness.coordinator.notifyEngineStatus('restarting');
    // El estado vuelve a pending (malla antigua visible aún).
    expect(harness.lastStates().get('solid-1')?.status).toBe('pending');
    await flush();
    expect(harness.kernel.fromSketchCalls.length).toBeGreaterThan(callsBefore);
    expect(harness.lastStates().get('solid-1')?.status).toBe('ready');
    expect(harness.recovered()).toBe(1);
  });

  it('reinicio con escena vacía → onRecovered inmediato (nada que reconstruir)', () => {
    const harness = createHarness();
    harness.coordinator.setDocument(createEmptySceneDocument());
    harness.coordinator.notifyEngineStatus('restarting');
    expect(harness.recovered()).toBe(1);
  });

  it('dispose → estados liberados y resultados tardíos ignorados', async () => {
    const harness = createHarness();
    harness.kernel.deferNextFromSketch = true;
    harness.coordinator.setDocument(docWithRect(1000, 500));
    await flush();
    harness.coordinator.dispose();
    expect(harness.coordinator.disposed).toBe(true);
    expect(harness.coordinator.states.size).toBe(0);

    // Resultado tardío tras dispose: no resucita estados ni notifica.
    const statesBefore = harness.lastStates();
    for (const key of [...harness.kernel.pendingByKey.keys()]) {
      harness.kernel.pendingByKey.get(key)?.resolve(undefined);
    }
    await flush();
    expect(harness.lastStates()).toBe(statesBefore);
    // Nuevos envíos tras dispose son no-ops (sin crash).
    harness.coordinator.setDocument(docWithRect(1000, 500));
    expect(harness.coordinator.states.size).toBe(0);
  });

  it('eliminar un objeto retira su estado', async () => {
    const harness = createHarness();
    const document = docWithRect(1000, 500);
    harness.coordinator.setDocument(document);
    await flush();
    expect(harness.lastStates().has('solid-1')).toBe(true);

    const removed = applySceneAction(document, {
      type: 'remove-object',
      objectId: 'solid-1',
    });
    expect(removed).not.toBeNull();
    harness.coordinator.setDocument(removed ?? document);
    await flush();
    expect(harness.lastStates().has('solid-1')).toBe(false);
    // Sin objetos: el servicio (si existía) recibe el documento vacío.
    expect(harness.coordinator.stats.service?.pending).toBe(0);
  });

  it('nextSolidId es determinista y no colisiona', () => {
    const document = docWithRect(1000, 500);
    expect(nextSolidId(document)).toBe('solid-2');
    const second = applySceneAction(document, {
      type: 'add-solid',
      sketch: rectangleSketchFromCorners([0, 0], [10, 10]) ?? rectangleSketchFromCorners([0, 0], [20, 20])!,
      extrusionMm: 10,
    });
    expect(second).not.toBeNull();
    expect(nextSolidId(second ?? document)).toBe('solid-3');
  });

  // -------------------------------------------------------------------------
  // Auditoría §3 — concurrencia (arranque diferido, acciones rápidas,
  // eliminación en vuelo y respuestas tardías)
  // -------------------------------------------------------------------------

  it('primer dibujo con el Worker/WASM en vuelo: pending honesto hasta arrancar', async () => {
    const harness = createHarness({ ensureDeferred: true });
    harness.coordinator.setDocument(docWithRect(1000, 500));

    // Arranque diferido: un solo ensure, sin servicio ni llamadas al kernel.
    expect(harness.ensureCalls()).toBe(1);
    expect(harness.coordinator.stats.service).toBeNull();
    expect(harness.lastStates().get('solid-1')?.status).toBe('pending');

    await flush();
    expect(harness.lastStates().get('solid-1')?.status).toBe('pending'); // sigue inicializando
    expect(harness.kernel.fromSketchCalls).toHaveLength(0); // nada al kernel antes de estar listo

    harness.resolveEnsure();
    await flush();
    await flush();

    const state = harness.lastStates().get('solid-1');
    expect(state?.status).toBe('ready');
    expect(harness.kernel.fromSketchCalls).toHaveLength(1);
    // Cero KernelRef huérfanas: la única ref se creó y se liberó.
    expect(harness.kernel.liveRefs.size).toBe(0);
    expect(harness.kernel.disposedRefs).toHaveLength(1);
    expect(harness.coordinator.stats.service?.liveRefs).toBe(0);
  });

  it('dos acciones rápidas durante la inicialización: un solo kernel y la última revisión', async () => {
    const harness = createHarness({ ensureDeferred: true });
    const first = docWithRect(1000, 500);
    harness.coordinator.setDocument(first);
    expect(harness.ensureCalls()).toBe(1);

    // Acción2 (aún sin motor): cambia la cota y añade otro sólido.
    const resized = applySceneAction(first, {
      type: 'set-extrusion',
      objectId: 'solid-1',
      extrusionMm: 250,
    });
    expect(resized).not.toBeNull();
    const secondSketch = rectangleSketchFromCorners([0, 0], [600, 400]);
    if (secondSketch === null) throw new Error('fixture inválida');
    const second = applySceneAction(resized!, {
      type: 'add-solid',
      sketch: secondSketch,
      extrusionMm: 80,
    });
    expect(second).not.toBeNull();
    harness.coordinator.setDocument(second!);
    await flush();

    // NUNCA dos kernels, aunque haya dos acciones en vuelo.
    expect(harness.ensureCalls()).toBe(1);
    expect(harness.lastStates().get('solid-1')?.status).toBe('pending');
    expect(harness.lastStates().get('solid-2')?.status).toBe('pending');

    harness.resolveEnsure();
    await flush();
    await flush();

    // Sin duplicados: exactamente los ids del documento vigente.
    expect([...harness.lastStates().keys()].sort()).toEqual(['solid-1', 'solid-2']);
    expect(harness.lastStates().get('solid-1')?.status).toBe('ready');
    expect(harness.lastStates().get('solid-2')?.status).toBe('ready');

    // Se aplicó la ÚLTIMA revisión: extrusión 250 del sólido 1.
    expect(harness.lastStates().get('solid-1')?.mesh?.boundsM.max[1]).toBeCloseTo(0.25, 6);
    expect(harness.lastStates().get('solid-2')?.mesh?.boundsM.max[1]).toBeCloseTo(0.08, 6);

    // Una sola regeneración por objeto (las2 acciones NO duplican trabajo).
    expect(harness.kernel.fromSketchCalls).toHaveLength(2);
    expect(harness.kernel.disposedRefs).toHaveLength(2);
    expect(harness.kernel.liveRefs.size).toBe(0);
  });

  it('eliminar durante la regeneración: cancela la clave y no deja error', async () => {
    const harness = createHarness();
    harness.kernel.deferNextFromSketch = true;
    const document = docWithRect(1000, 500);
    harness.coordinator.setDocument(document);
    await flush(); // fromSketch en vuelo con clave de cancelación

    harness.coordinator.setDocument(createEmptySceneDocument());
    await flush();

    // La clave del objeto se canceló (resultado obsoleto anulado en origen).
    expect(harness.kernel.cancelCalls.length).toBeGreaterThanOrEqual(1);
    // El estado desaparece y la cancelación NO se reporta como error.
    expect(harness.lastStates().size).toBe(0);
    expect(harness.coordinator.stats.service?.pending).toBe(0);
    for (const state of harness.lastStates().values()) {
      expect(state.status).not.toBe('error');
    }
  });

  it('respuesta tardía que ESCAPA a la cancelación: se descarta sin resucitar', async () => {
    const harness = createHarness();
    harness.kernel.deferNextFromSketchCancelless = true;
    harness.coordinator.setDocument(docWithRect(1000, 500));
    await flush(); // fromSketch en vuelo sin clave cancelable

    // Eliminar el objeto con la respuesta aún en camino.
    harness.coordinator.setDocument(createEmptySceneDocument());
    await flush();
    expect(harness.lastStates().size).toBe(0);

    // La respuesta llega AHORA (demasiado tarde para publicarse).
    const wait = harness.kernel.cancellessWait;
    if (wait === null) throw new Error('sin petición diferida');
    harness.kernel.cancellessWait = null;
    wait.resolve(undefined);
    await flush();
    await flush();

    // No resucita el objeto ni genera error; el servicio la contó como obsoleta.
    expect(harness.lastStates().size).toBe(0);
    expect(harness.coordinator.stats.service?.droppedStale ?? 0).toBeGreaterThanOrEqual(1);
    // Y la ref tardía se liberó igualmente (cero huérfanas).
    expect(harness.kernel.disposedRefs).toHaveLength(1);
    expect(harness.kernel.liveRefs.size).toBe(0);
  });
});
