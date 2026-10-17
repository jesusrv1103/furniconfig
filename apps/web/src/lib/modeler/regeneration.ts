/**
 * Servicio de regeneración asíncrona de geometría derivada (FASE-4B-D, D4a).
 *
 * Capa de composición **aislada** de `apps/web`: no se importa desde las
 * pantallas existentes ni modifica sus flujos (el modelador con UI llega en
 * la Fase 4C/D4b). Responsabilidades:
 *
 * - Regenerar la geometría derivada de un `SceneDocument`: los sólidos de
 *   croquis se construyen con `AsyncGeometryKernel` (worker) y los
 *   componentes se derivan **sincrónicamente** con `buildComponent`.
 * - Publicar resultados **fuera de orden** de forma segura: cada resultado
 *   lleva su `revision` y su huella de vigencia; se descarta lo obsoleto.
 * - Cancelar solicitudes obsoletas por objeto con la clave
 *   `regenerar:${objectId}` (mecanismo del `WorkerGeometryKernel`).
 * - Validar la vigencia de **documento, objeto y parámetros** antes de
 *   publicar: revisión monotónica + huella canónica por objeto (no basta
 *   con la identidad de referencia del documento).
 * - Liberar cada `KernelRef` tras extraer su malla (sin `geometryCache`,
 *   que sigue sin autorización); cero fugas.
 * - Recuperarse de reinicios del worker **reconstruyendo desde el
 *   documento** (los handles viejos mueren con su epoch).
 *
 * Honestidad geométrica: `AsyncGeometryKernel` **no** tiene primitiva de
 * cilindro (solo `box`/`fromSketch` + booleanas/transformaciones), por eso
 * los componentes entregan sus `ComponentPart` (cajas y cilindros
 * exactos) y **no** se simulan mallas de cilindros vía kernel.
 */

import {
  OperationCancelledError,
  type AsyncGeometryKernel,
  type KernelRef,
  type MeshData,
} from '@furniconfig/kernel-adapter';
import {
  buildComponent,
  type ComponentPart,
  type ParametricComponentRegistry,
  type SceneDocument,
  type SceneObject,
} from '@furniconfig/modeler-core';

/** Geometría derivada publicada por el servicio. */
export type DerivedGeometry =
  | {
      readonly objectId: string;
      readonly revision: number;
      readonly kind: 'solid-mesh';
      readonly mesh: MeshData;
    }
  | {
      readonly objectId: string;
      readonly revision: number;
      readonly kind: 'component-parts';
      readonly parts: readonly ComponentPart[];
    }
  | {
      readonly objectId: string;
      readonly revision: number;
      readonly kind: 'not-derivable';
      readonly reason: string;
    };

export interface RegenerationFailure {
  readonly objectId: string | null;
  readonly revision: number;
  readonly message: string;
}

export interface SceneGeometryServiceOptions {
  readonly kernel: AsyncGeometryKernel;
  readonly components: ParametricComponentRegistry;
  readonly onResult: (result: DerivedGeometry) => void;
  readonly onFailure?: (failure: RegenerationFailure) => void;
}

export interface RegenerationStats {
  readonly revision: number;
  readonly published: number;
  readonly droppedStale: number;
  readonly failures: number;
  readonly pending: number;
  readonly liveRefs: number;
}

/** Clave de cancelación lógica por objeto (supersede automático). */
export function regenerationCancelKey(objectId: string): string {
  return `regenerar:${objectId}`;
}

/** JSON canónico (claves ordenadas) para huellas deterministas. */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return `n:${String(value)}`;
  if (typeof value === 'boolean') return `b:${String(value)}`;
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  const body = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',');
  return `{${body}}`;
}

/**
 * Huella de la geometría relevante de un objeto: forma, params/tipo y
 * transformación (el nombre no afecta a la geometría). Dos envíos con la
 * misma huella producen la misma geometría derivada.
 */
export function objectFingerprint(object: SceneObject): string {
  if (object.kind === 'solid') {
    return canonicalize({ kind: 'solid', geometry: object.geometry, transform: object.transform });
  }
  return canonicalize({
    kind: 'component',
    type: object.type,
    version: object.version,
    params: object.params ?? null,
    transform: object.transform,
  });
}

interface PendingRequest {
  readonly revision: number;
  readonly fingerprint: string;
}

/**
 * Servicio testeable de regeneración (inyección total de dependencias: el
 * kernel y el registro llegan por opciones; el reloj lo controla el kernel
 * inyectado en las pruebas).
 */
export class SceneGeometryService {
  readonly #kernel: AsyncGeometryKernel;
  readonly #components: ParametricComponentRegistry;
  readonly #onResult: (result: DerivedGeometry) => void;
  readonly #onFailure: ((failure: RegenerationFailure) => void) | undefined;

  #document: SceneDocument | null = null;
  #revision = 0;
  #pending = new Map<string, PendingRequest>();
  #liveRefs = new Set<KernelRef>();
  #published = 0;
  #droppedStale = 0;
  #failures = 0;
  #disposed = false;

  constructor(options: SceneGeometryServiceOptions) {
    this.#kernel = options.kernel;
    this.#components = options.components;
    this.#onResult = options.onResult;
    this.#onFailure = options.onFailure;
  }

  get stats(): RegenerationStats {
    return {
      revision: this.#revision,
      published: this.#published,
      droppedStale: this.#droppedStale,
      failures: this.#failures,
      pending: this.#pending.size,
      liveRefs: this.#liveRefs.size,
    };
  }

  /**
   * Presenta una revisión nueva del documento. Incrementa la revisión,
   * cancela lo que ya no aplica y lanza la regeneración de cada objeto.
   */
  submit(document: SceneDocument): void {
    if (this.#disposed) {
      throw new Error('SceneGeometryService: servicio disposed (submit no permitido).');
    }
    this.#revision += 1;
    this.#document = document;

    const currentIds = new Set(document.objects.map((object) => object.id));
    for (const objectId of [...this.#pending.keys()]) {
      if (!currentIds.has(objectId)) {
        this.#pending.delete(objectId);
        this.#cancelQuiet(regenerationCancelKey(objectId));
      }
    }

    for (const object of document.objects) {
      if (object.kind === 'component') {
        this.#deriveComponent(object);
        continue;
      }
      if (object.geometry.source === 'kernel') {
        // Sin caché de kernel en el documento no hay geometría regenerable:
        // se reporta honestamente en vez de fingir una reconstrucción.
        this.#pending.set(object.id, {
          revision: this.#revision,
          fingerprint: objectFingerprint(object),
        });
        this.#publish({
          objectId: object.id,
          revision: this.#revision,
          kind: 'not-derivable',
          reason: 'Referencia de kernel sin caché derivable en el documento.',
        });
        continue;
      }
      this.#requestSolidMesh(object);
    }
  }

  /**
   * Recuperación tras un reinicio del worker: las refs locales murieron con
   * su epoch, así que se descartan sin dispose y **todo se reconstruye
   * desde el documento actual** (parámetros = verdad persistente).
   */
  handleKernelRestart(): void {
    this.#liveRefs.clear();
    this.#pending.clear();
    if (this.#document !== null && !this.#disposed) {
      this.submit(this.#document);
    }
  }

  /** Cancela todo lo pendiente y deja el servicio inoperante. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const objectId of [...this.#pending.keys()]) {
      this.#cancelQuiet(regenerationCancelKey(objectId));
    }
    this.#pending.clear();
    this.#document = null;
  }

  /**
   * Cancelación lógica opcional: `cancel` no forma parte de
   * `AsyncGeometryKernel` (es un método del `WorkerGeometryKernel`
   * concreto), así que se invoca si el kernel inyectado lo expone.
   */
  #cancelQuiet(cancelKey: string): void {
    const kernel = this.#kernel as AsyncGeometryKernel & {
      readonly cancel?: (key: string) => number;
    };
    try {
      kernel.cancel?.(cancelKey);
    } catch {
      // El kernel puede estar terminado: cancelar es best-effort.
    }
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  #deriveComponent(object: SceneObject & { kind: 'component' }): void {
    const revision = this.#revision;
    this.#pending.set(object.id, {
      revision,
      fingerprint: objectFingerprint(object),
    });
    try {
      const build = buildComponent(
        this.#components,
        object.id,
        object.type,
        object.version,
        object.params ?? {},
      );
      this.#publish({
        objectId: object.id,
        revision,
        kind: 'component-parts',
        parts: build.parts,
      });
    } catch (error) {
      this.#pending.delete(object.id);
      this.#failures += 1;
      this.#onFailure?.({
        objectId: object.id,
        revision,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #requestSolidMesh(object: SceneObject & { kind: 'solid' }): void {
    if (object.geometry.source !== 'sketch') return;
    const { sketch, extrusionMm } = object.geometry;
    const objectId = object.id;
    const revision = this.#revision;
    const fingerprint = objectFingerprint(object);
    const cancelKey = regenerationCancelKey(objectId);

    this.#pending.set(objectId, { revision, fingerprint });

    void this.#kernel
      .fromSketch(sketch.pointsMm, extrusionMm, { cancelKey })
      .then(async (ref) => {
        this.#liveRefs.add(ref);
        try {
          return await this.#kernel.toMesh(ref, { cancelKey });
        } finally {
          await this.#releaseRef(ref);
        }
      })
      .then((mesh) => {
        this.#publish({
          objectId,
          revision,
          kind: 'solid-mesh',
          mesh,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof OperationCancelledError) {
          // Cancelación deliberada (supersede de una revisión nueva o
          // dispose): no es un fallo. Solo se retira la entrada si sigue
          // siendo de ESTA solicitud — borrarla sin más machacaría la
          // solicitud vigente de una revisión posterior (bug hallado en la
          // auditoría 4B-D §4: dos regeneraciones simultáneas del mismo
          // objeto).
          if (this.#pending.get(objectId)?.revision === revision) {
            this.#pending.delete(objectId);
          }
          return;
        }
        const stillPending = this.#pending.get(objectId)?.revision === revision;
        if (stillPending) this.#pending.delete(objectId);
        if (!stillPending || this.#disposed) return; // obsoleto: ni error ni publicación
        this.#failures += 1;
        this.#onFailure?.({
          objectId,
          revision,
          message: error instanceof Error ? error.message : String(error),
        });
      });
  }

  /** Libera una ref que dejó de usarse (tolerante a `unknown-ref`). */
  async #releaseRef(ref: KernelRef): Promise<void> {
    try {
      await this.#kernel.dispose(ref);
    } catch {
      // Tras un reinicio la ref ya no existe en el worker: nada que liberar.
    } finally {
      this.#liveRefs.delete(ref);
    }
  }

  /** Publica solo si el resultado sigue vigente (documento/objeto/params). */
  #publish(result: DerivedGeometry): void {
    const request = this.#pending.get(result.objectId);
    if (
      this.#disposed ||
      this.#revision !== result.revision ||
      request === undefined ||
      request.revision !== result.revision
    ) {
      this.#droppedStale += 1;
      return;
    }
    const current = this.#document?.objects.find(
      (object) => object.id === result.objectId,
    );
    if (current === undefined || objectFingerprint(current) !== request.fingerprint) {
      this.#pending.delete(result.objectId);
      this.#droppedStale += 1;
      return;
    }
    this.#pending.delete(result.objectId);
    this.#published += 1;
    this.#onResult(result);
  }
}
