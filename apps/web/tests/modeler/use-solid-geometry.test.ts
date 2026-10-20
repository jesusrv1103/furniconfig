/**
 * FASE-4C-B — `retainSolidGeometry` (ciclo de vida de la geometría).
 *
 * Verifica la política de recursos de la auditoría §2 SIN WebGL:
 *
 * - UNA geometría por malla con los datos correctos (position/index);
 * - `adopt()` contabiliza `created` UNA sola vez (idempotente);
 * - `release()` emite el evento `dispose` de Three.js, contabiliza
 *   `disposed` y es idempotente (nunca un doble dispose);
 * - **montaje estricto** (`adopt → release → adopt → release`):
 *   CADA `release` dispone de verdad (2 eventos `dispose`), sin
 *   referencias zombie ni búferes huérfanos (corrección de recursos);
 * - `release()` sin adopción vigente es no-op (sin contadores);
 * - cada retención es independiente (liberar una no toca a otra);
 * - la entrada `SolidMeshRenderData` no se muta;
 * - invariante sin fugas: `disposed === created` (verificado en el
 *   `afterEach` de cada prueba, sin rebalanceo).
 *
 * La celosía React (`useSolidGeometry`: adopt al montar, release al
 * sustituir y al desmontar) se verifica en navegador real con el
 * check visual `7l`.
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  geometryLifecycle,
  retainSolidGeometry,
} from '../../src/components/modeler/use-solid-geometry.js';
import type { SolidMeshRenderData } from '../../src/lib/modeler/mesh-to-renderable.js';

/** Malla de render mínima (3 vértices, 1 triángulo). */
function meshFixture(objectId: string, offsetM = 0): SolidMeshRenderData {
  return {
    objectId,
    positionsM: new Float32Array([offsetM, 0, 0, 1, 0, 0, 1, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    boundsM: { min: [offsetM, 0, 0], max: [offsetM + 1, 1, 0] },
  };
}

/** Cuenta eventos `dispose` de una geometría de Three.js. */
function trackDisposals(geometry: BufferGeometryLike): { count: () => number } {
  let count = 0;
  geometry.addEventListener('dispose', () => {
    count += 1;
  });
  return { count: () => count };
}

/** Mínimo estructural de `BufferGeometry` para el tracker. */
interface BufferGeometryLike {
  addEventListener: (type: 'dispose', listener: () => void) => void;
}

afterEach(() => {
  // Sin rebalanceo: cada ciclo del suite debe cerrar
  // `created === disposed` por sí solo (evidencia de que no quedan
  // recursos huérfanos ni pares sin acoplar).
  expect(geometryLifecycle.created).toBe(geometryLifecycle.disposed);
});

describe('retainSolidGeometry (retención y liberación de BufferGeometry)', () => {
  it('crea UNA geometría con los datos de la malla (position/index)', () => {
    const mesh = meshFixture('solid-1');
    const retained = retainSolidGeometry(mesh);

    expect(retained.geometry.getAttribute('position')).toBeDefined();
    expect(retained.geometry.getIndex()?.count).toBe(3);
    // La construcción NO contabiliza: eso lo hace `adopt()`.
    expect(geometryLifecycle.created).toBe(geometryLifecycle.disposed);

    retained.release();
  });

  it('adopt() contabiliza created UNA sola vez (idempotente)', () => {
    const retained = retainSolidGeometry(meshFixture('solid-1'));
    const createdBefore = geometryLifecycle.created;

    retained.adopt();
    retained.adopt();
    retained.adopt();

    expect(geometryLifecycle.created).toBe(createdBefore + 1);
    retained.release();
  });

  it('release() emite el evento dispose de Three.js y cuenta la liberación', () => {
    const retained = retainSolidGeometry(meshFixture('solid-1'));
    retained.adopt();
    const tracker = trackDisposals(retained.geometry);

    retained.release();

    expect(tracker.count()).toBe(1);
    expect(geometryLifecycle.disposed).toBe(geometryLifecycle.created);
  });

  it('release() es idempotente (nunca un doble dispose)', () => {
    const retained = retainSolidGeometry(meshFixture('solid-1'));
    retained.adopt();
    const tracker = trackDisposals(retained.geometry);
    const disposedBefore = geometryLifecycle.disposed;

    retained.release();
    retained.release();
    retained.release();

    expect(tracker.count()).toBe(1);
    expect(geometryLifecycle.disposed).toBe(disposedBefore + 1);
  });

  it('montaje estricto (adopt→release→adopt→release): CADA release dispone de verdad', () => {
    // Secuencia REAL de StrictMode en dev (montaje → limpieza →
    // remontaje) seguida del release definitivo (sustitución de la
    // malla o desmontaje: eliminación, Undo/Redo, regeneración,
    // navegación fuera del modelador). El renderer sube la
    // geometría a GPU DESPUÉS del dispose intermedio: si el remontaje
    // no rearmara la retención, el release final no dispondría nada
    // y los búferes re-subidos quedarían huérfanos.
    const retained = retainSolidGeometry(meshFixture('solid-1'));
    const tracker = trackDisposals(retained.geometry);
    const createdBefore = geometryLifecycle.created;
    const disposedBefore = geometryLifecycle.disposed;

    retained.adopt(); // montaje 1
    retained.adopt(); // idempotente (sin doble conteo)
    retained.release(); // limpieza estricta → dispose #1
    retained.adopt(); // remontaje estricto: debe REARMAR
    retained.adopt(); // idempotente
    retained.release(); // sustitución/desmontaje real → dispose #2
    retained.release(); // idempotente: sin tercer dispose

    expect(tracker.count()).toBe(2);
    expect(geometryLifecycle.created - createdBefore).toBe(2);
    expect(geometryLifecycle.disposed - disposedBefore).toBe(2);
    expect(geometryLifecycle.created).toBe(geometryLifecycle.disposed);
  });

  it('release() sin adopción vigente no contamina (ni contadores ni eventos)', () => {
    // Una retención nunca adoptada no tiene nada que liberar: el
    // release es no-op honesto. La geometría fantasma descartada por
    // el doble render de StrictMode nunca se RETIENE (nadie llama a
    // adopt ni release: es basura GC sin contador).
    const retained = retainSolidGeometry(meshFixture('ghost'));
    const tracker = trackDisposals(retained.geometry);
    const createdBefore = geometryLifecycle.created;
    const disposedBefore = geometryLifecycle.disposed;

    retained.release();

    expect(tracker.count()).toBe(0);
    expect(geometryLifecycle.created).toBe(createdBefore);
    expect(geometryLifecycle.disposed).toBe(disposedBefore);
  });

  it('las retenciones son independientes (liberar una no afecta a otra)', () => {
    const first = retainSolidGeometry(meshFixture('solid-1'));
    const second = retainSolidGeometry(meshFixture('solid-2', 5));
    first.adopt();
    second.adopt();
    const firstTracker = trackDisposals(first.geometry);
    const secondTracker = trackDisposals(second.geometry);

    expect(second.geometry).not.toBe(first.geometry);
    first.release();

    expect(firstTracker.count()).toBe(1);
    expect(secondTracker.count()).toBe(0);
    second.release();
    expect(secondTracker.count()).toBe(1);
  });

  it('no muta la malla de entrada (ciclo de vida desacoplado)', () => {
    const mesh = meshFixture('solid-1');
    const positionsSnapshot = [...mesh.positionsM];
    const indicesSnapshot = [...mesh.indices];

    const retained = retainSolidGeometry(mesh);
    retained.adopt();
    retained.release();

    expect([...mesh.positionsM]).toEqual(positionsSnapshot);
    expect([...mesh.indices]).toEqual(indicesSnapshot);
  });
});
