/**
 * FASE-4C-B, B4 — coordinador de geometría de escena.
 *
 * Conecta el runtime diferido de 4C-A (`ensureKernel`) con el
 * `SceneGeometryService` de 4B-D y traduce sus resultados a
 * estados de UI por objeto. Clase SIN React ni DOM (testeable en
 * node con kernels falsos, patrón de `ModelerGeometryRuntime`).
 *
 * Reglas de la fase (§5):
 *
 * - **Worker bajo demanda**: el kernel solo se crea cuando hay
 *   sólidos que derivar; la escena vacía nunca lo toca (la
 *   pantalla solo llama `setDocument`).
 * - **Revisión vigente**: cada envío incrementa la revisión del
 *   servicio Y la local EN LOCKSTEP (un `submit` = un incremento
 *   en ambos lados); los resultados se aplican solo si siguen
 *   siendo de la revisión del estado del objeto.
 * - **Sin recomputaciones inútiles**: un objeto cuya huella
 *   (`objectFingerprint`) no cambió conserva su malla (y su
 *   `BufferGeometry` asociada) aunque el documento tenga una
 *   revisión nueva; la comparación usa `appliedFingerprint`
 *   (huella de la geometría ya materializada en `mesh`).
 * - **Cancelaciones y errores**: lo cancelado no es fallo
 *   (criterio del servicio); un fallo marca el objeto con su
 *   mensaje y permite `retry` (resubmite el documento).
 * - **Reinicio del worker**: al entrar en `restarting` se marca
 *   la recuperación y se reconstruye TODO desde el documento
 *   (`handleKernelRestart`); la primera publicación tras el
 *   reinicio invoca `onRecovered` (la pantalla devuelve el motor
 *   a `ready` sin sondeos ni temporizadores).
 * - **Liberación**: `dispose()` cancela y dispone el servicio;
 *   los `KernelRef` los libera el propio servicio en su `finally`
 *   (cero fugas, verificado por sus `stats.liveRefs`).
 *
 * FASE-4C-D — componentes paramétricos (clósets):
 *
 * - **Derivación en el coordinador**: `buildComponent` es síncrono
 *   y puro, así que los componentes se derivan AQUÍ y no en el
 *   servicio (que necesita el kernel en su constructor): su estado
 *   vive en `componentStates`, un mapa SEPARADO de `states`, con
 *   gating por huella (mismas params → misma referencia de piezas
 *   → la escena no recrea geometría) y errores `SceneError` como
 *   estado honesto con `retry`.
 * - **Sin Worker para clósets**: el servicio solo se crea con
 *   sólidos presentes (invariante de 4C-B intacto): una escena
 *   exclusivamente de componentes NUNCA invoca `ensureKernel`.
 *   Los resultados `component-parts` del servicio (si convive con
 *   sólidos) se ignoran: la fuente única de piezas es el
 *   coordinador.
 */

import type { AsyncGeometryKernel } from '@furniconfig/kernel-adapter';
import {
  SceneError,
  buildComponent,
  createComponentRegistry,
  type ComponentInstance,
  type ComponentPart,
  type ParametricComponentRegistry,
  type SceneDocument,
} from '@furniconfig/modeler-core';

import type { GeometryKernelStatus } from './geometry-runtime.js';
import { createGroundSketchKernel } from './ground-sketch-kernel.js';
import {
  toSolidMeshRenderData,
  type SolidMeshRenderData,
} from './mesh-to-renderable.js';
import {
  SceneGeometryService,
  objectFingerprint,
  type DerivedGeometry,
  type RegenerationStats,
} from './regeneration.js';

/** Estado de derivación de un sólido para la UI. */
export type SolidGeometryStatus = 'pending' | 'ready' | 'error';

export interface SolidGeometryState {
  readonly objectId: string;
  readonly revision: number;
  readonly status: SolidGeometryStatus;
  /** Huella de geometría del objeto en esta revisión. */
  readonly fingerprint: string;
  /** Huella de la geometría ya materializada en `mesh` (null si ninguna). */
  readonly appliedFingerprint: string | null;
  /** Malla en metros (null hasta la primera publicación). */
  readonly mesh: SolidMeshRenderData | null;
  readonly errorMessage: string | null;
}

/**
 * Estado de derivación de un componente paramétrico para la UI
 * (FASE-4C-D). Análogo de `SolidGeometryState` pero con `parts`
 * en lugar de `mesh`: mapa de estados SEPARADO (§4 del mandate).
 */
export interface ComponentGeometryState {
  readonly objectId: string;
  readonly revision: number;
  readonly status: SolidGeometryStatus;
  /** Huella de los params vigentes del componente. */
  readonly fingerprint: string;
  /** Huella de las piezas ya materializadas (null si ninguna). */
  readonly appliedFingerprint: string | null;
  /** Piezas derivadas (null hasta la primera publicación o en error). */
  readonly parts: readonly ComponentPart[] | null;
  readonly errorMessage: string | null;
}

export interface SceneGeometryCoordinatorStats {
  readonly revision: number;
  readonly published: number;
  readonly droppedStale: number;
  readonly service: RegenerationStats | null;
}

export interface SceneGeometryCoordinatorOptions {
  /** Creación diferida del kernel (Worker) bajo demanda. */
  readonly ensureKernel: () => Promise<AsyncGeometryKernel>;
  /** Notificación de cada cambio del mapa de estados. */
  readonly onChange: (
    states: ReadonlyMap<string, SolidGeometryState>,
  ) => void;
  /** El worker volvió a producir resultados tras un reinicio. */
  readonly onRecovered?: () => void;
  /** Registro de componentes (hueco para fases posteriores). */
  readonly components?: ParametricComponentRegistry;
}

export class SceneGeometryCoordinator {
  readonly #options: SceneGeometryCoordinatorOptions;
  readonly #components: ParametricComponentRegistry;

  #states = new Map<string, SolidGeometryState>();
  #componentStates = new Map<string, ComponentGeometryState>();
  #componentRevision = 0;
  #service: SceneGeometryService | null = null;
  #kernelPromise: Promise<AsyncGeometryKernel> | null = null;
  #document: SceneDocument | null = null;
  /**
   * Espejo del contador de revisiones del servicio: se incrementa
   * EXACTAMENTE en los puntos en los que se invoca `submit` o
   * `handleKernelRestart` (cada uno incrementa el suyo propio en
   * lockstep). Los estados pendientes se marcan con
   * `#serviceRevision + 1` porque el envío siguiente les asignará
   * esa revisión; cualquier divergencia haría caer resultados
   * legítimos como obsoletos.
   */
  #serviceRevision = 0;
  #published = 0;
  #droppedStale = 0;
  #awaitingRecovery = false;
  #disposed = false;

  constructor(options: SceneGeometryCoordinatorOptions) {
    this.#options = options;
    // Sin registro (4C-B no crea componentes): vacío, para que el
    // servicio trate cualquier componente como no registrado.
    this.#components = options.components ?? createComponentRegistry([]);
  }

  get states(): ReadonlyMap<string, SolidGeometryState> {
    return this.#states;
  }

  /** Estados de componentes (4C-D): mapa SEPARADO de los sólidos. */
  get componentStates(): ReadonlyMap<string, ComponentGeometryState> {
    return this.#componentStates;
  }

  get stats(): SceneGeometryCoordinatorStats {
    return {
      revision: this.#serviceRevision,
      published: this.#published,
      droppedStale: this.#droppedStale,
      service: this.#service?.stats ?? null,
    };
  }

  get disposed(): boolean {
    return this.#disposed;
  }

  /**
   * Presenta una revisión del documento. Los sólidos con huella
   * unchanged conservan su malla; el resto pasa a `pending`. La
   * creación del kernel es perezosa: solo con sólidos derivables.
   */
  setDocument(document: SceneDocument): void {
    if (this.#disposed) return;
    this.#document = document;

    const solids = document.objects.filter(
      (object) => object.kind === 'solid' && object.geometry.source === 'sketch',
    );
    const currentIds = new Set(solids.map((object) => object.id));

    let changed = false;
    for (const objectId of [...this.#states.keys()]) {
      if (!currentIds.has(objectId)) {
        this.#states.delete(objectId);
        changed = true;
      }
    }

    for (const object of solids) {
      if (object.kind !== 'solid' || object.geometry.source !== 'sketch') continue;
      const fingerprint = objectFingerprint(object);
      const previous = this.#states.get(object.id);
      if (
        previous !== undefined &&
        previous.status === 'ready' &&
        previous.fingerprint === fingerprint
      ) {
        continue; // sin cambios de geometría: la malla sigue siendo válida
      }
      this.#states.set(object.id, {
        objectId: object.id,
        revision: this.#serviceRevision + 1,
        status: 'pending',
        fingerprint,
        appliedFingerprint: previous?.appliedFingerprint ?? null,
        mesh: previous?.mesh ?? null,
        errorMessage: null,
      });
      changed = true;
    }

    // Componentes (4C-D): derivación síncrona en el coordinador —
    // sin servicio, sin Worker y sin ventana asíncrona en la que
    // publicar geometría obsoleta. Huella sin cambios → misma
    // referencia de `parts` → la escena no recrea geometría.
    const components = document.objects.filter(
      (object) => object.kind === 'component',
    );
    const componentIds = new Set(components.map((object) => object.id));
    for (const objectId of [...this.#componentStates.keys()]) {
      if (!componentIds.has(objectId)) {
        this.#componentStates.delete(objectId);
        changed = true;
      }
    }
    for (const object of components) {
      if (object.kind !== 'component') continue;
      const fingerprint = objectFingerprint(object);
      const previous = this.#componentStates.get(object.id);
      if (
        previous !== undefined &&
        previous.status === 'ready' &&
        previous.fingerprint === fingerprint
      ) {
        continue; // mismas params → mismas piezas (sin recrear nada)
      }
      this.#componentStates.set(
        object.id,
        this.#deriveComponentState(object, fingerprint, previous),
      );
      changed = true;
    }

    if (changed) this.#notify();

    if (this.#service !== null) {
      this.#serviceRevision += 1;
      this.#service.submit(document);
      this.#notify();
      return;
    }
    if (solids.length > 0) {
      this.#ensureService();
    }
  }

  /**
   * Estado del motor para la UI: al entrar en `restarting` se
   * reconstruye todo desde el documento; `onRecovered` se emite
   * con la primera publicación posterior (o de inmediato si no
   * hay nada que reconstruir).
   */
  notifyEngineStatus(status: GeometryKernelStatus): void {
    if (this.#disposed) return;
    if (status !== 'restarting') return;
    this.#awaitingRecovery = true;
    if (this.#service === null) {
      if (this.#states.size === 0) {
        this.#awaitingRecovery = false;
        this.#options.onRecovered?.();
      }
      return;
    }
    this.#serviceRevision += 1;
    for (const [objectId, state] of this.#states) {
      this.#states.set(objectId, {
        ...state,
        revision: this.#serviceRevision,
        status: 'pending',
        errorMessage: null,
      });
    }
    this.#service.handleKernelRestart();
    this.#notify();
  }

  /**
   * Reintento manual: limpia el error del objeto (o el fallo de
   * arranque del motor) y resubmite el documento vigente.
   */
  retry(_objectId?: string): void {
    if (this.#disposed) return;
    // Componentes (4C-D): su derivación no depende del kernel, así
    // que se reintenta aquí directamente (los que ya están `ready`
    // no se tocan: huella vigente = piezas vigentes).
    for (const object of this.#document?.objects ?? []) {
      if (object.kind !== 'component') continue;
      const state = this.#componentStates.get(object.id);
      if (state === undefined || state.status !== 'error') continue;
      this.#componentStates.set(
        object.id,
        this.#deriveComponentState(object, objectFingerprint(object), state),
      );
    }
    for (const [objectId, state] of this.#states) {
      if (state.status === 'error') {
        this.#states.set(objectId, {
          ...state,
          revision: this.#serviceRevision + 1,
          status: 'pending',
          errorMessage: null,
        });
      }
    }
    if (this.#service !== null && this.#document !== null) {
      this.#serviceRevision += 1;
      this.#service.submit(this.#document);
      this.#notify();
      return;
    }
    // Fallo de arranque del motor: reintenta la creación
    // perezosa. Si la creación sigue EN VUEO no se toca la
    // promesa (nunca dos kernels); el `catch` de
    // `#ensureService` ya la anula cuando el arranque falla.
    if (this.#document !== null) this.setDocument(this.#document);
  }

  /** Cancela todo, dispone el servicio y bloquea posteriores usos. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#service?.dispose();
    this.#service = null;
    this.#states.clear();
    this.#componentStates.clear();
    this.#document = null;
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Deriva las piezas de un componente SIN Worker (`buildComponent`
   * es puro y síncrono). Un fallo (`SceneError` de registro, versión
   * o params) deja el estado en `error` conservando las piezas
   * anteriores si existían (la escena sigue mostrando lo último
   * válido mientras el panel expone el mensaje).
   */
  #deriveComponentState(
    object: ComponentInstance,
    fingerprint: string,
    previous: ComponentGeometryState | undefined,
  ): ComponentGeometryState {
    this.#componentRevision += 1;
    try {
      const build = buildComponent(
        this.#components,
        object.id,
        object.type,
        object.version,
        object.params ?? {},
      );
      return {
        objectId: object.id,
        revision: this.#componentRevision,
        status: 'ready',
        fingerprint,
        appliedFingerprint: fingerprint,
        parts: build.parts,
        errorMessage: null,
      };
    } catch (error) {
      const message =
        error instanceof SceneError || error instanceof Error
          ? error.message
          : 'Error desconocido al derivar el componente.';
      return {
        objectId: object.id,
        revision: this.#componentRevision,
        status: 'error',
        fingerprint,
        appliedFingerprint: previous?.appliedFingerprint ?? null,
        parts: previous?.parts ?? null,
        errorMessage: message,
      };
    }
  }

  #ensureService(): void {
    if (this.#disposed || this.#service !== null || this.#kernelPromise !== null) {
      return;
    }
    this.#kernelPromise = this.#options.ensureKernel();
    this.#kernelPromise
      .then((rawKernel) => {
        if (this.#disposed) return;
        // Orientación croquis-en-planta (4C-B): el kernel extruye
        // en su plano XY; la escena necesita planta XZ + altura Y.
        const kernel = createGroundSketchKernel(rawKernel);
        this.#service = new SceneGeometryService({
          kernel,
          components: this.#components,
          onResult: (result) => this.#handleResult(result),
          onFailure: (failure) => this.#handleFailure(failure),
        });
        if (this.#document !== null) {
          this.#serviceRevision += 1;
          this.#service.submit(this.#document);
          this.#notify();
        }
      })
      .catch(() => {
        // El motor no pudo arrancar: el badge ya muestra `error`;
        // los objetos pendientes reciben un estado honesto con
        // reintento posible.
        this.#kernelPromise = null;
        if (this.#disposed) return;
        for (const [objectId, state] of this.#states) {
          if (state.status === 'pending') {
            this.#states.set(objectId, {
              ...state,
              status: 'error',
              errorMessage: 'No se pudo iniciar el motor geométrico.',
            });
          }
        }
        this.#notify();
      });
  }

  #handleResult(result: DerivedGeometry): void {
    if (this.#disposed) return;
    const state = this.#states.get(result.objectId);
    if (state === undefined || result.revision < state.revision) {
      // Objeto eliminado en el camino o resultado de una revisión
      // anterior a la del estado vigente: se descarta.
      this.#droppedStale += 1;
      return;
    }
    if (result.kind === 'not-derivable') {
      this.#states.set(result.objectId, {
        ...state,
        revision: result.revision,
        status: 'error',
        errorMessage: result.reason,
      });
      this.#published += 1;
      this.#notify();
      return;
    }
    if (result.kind === 'component-parts') {
      // 4C-D: la derivación de componentes vive en el COORDINADOR
      // (sincronía pura, sin Worker); si el servicio convive con
      // sólidos también deriva componentes y aquí se IGNORAN
      // deliberadamente — la fuente única de `parts` es
      // `componentStates`. Ningún sólido espera esta variante.
      return;
    }
    // solid-mesh: si la malla aplicada ya corresponde a la
    // geometría vigente (misma huella), se conserva la referencia
    // y su BufferGeometry no se recrea — pero el estado vuelve a
    // `ready` (tras un reinicio estaba en `pending`).
    if (
      state.mesh !== null &&
      state.appliedFingerprint !== null &&
      state.appliedFingerprint === state.fingerprint
    ) {
      this.#states.set(result.objectId, {
        ...state,
        revision: result.revision,
        status: 'ready',
        errorMessage: null,
      });
      this.#published += 1;
      this.#markRecovered();
      this.#notify();
      return;
    }
    const mesh = toSolidMeshRenderData(result.objectId, result.mesh);
    this.#states.set(result.objectId, {
      objectId: result.objectId,
      revision: result.revision,
      status: 'ready',
      fingerprint: state.fingerprint,
      appliedFingerprint: state.fingerprint,
      mesh,
      errorMessage: null,
    });
    this.#published += 1;
    this.#markRecovered();
    this.#notify();
  }

  #handleFailure(failure: {
    objectId: string | null;
    revision: number;
    message: string;
  }): void {
    if (this.#disposed || failure.objectId === null) return;
    const state = this.#states.get(failure.objectId);
    if (state === undefined || failure.revision < state.revision) return;
    this.#states.set(failure.objectId, {
      ...state,
      revision: failure.revision,
      status: 'error',
      errorMessage: failure.message,
    });
    this.#notify();
  }

  #markRecovered(): void {
    if (!this.#awaitingRecovery) return;
    this.#awaitingRecovery = false;
    this.#options.onRecovered?.();
  }

  #notify(): void {
    this.#options.onChange(new Map(this.#states));
  }
}
