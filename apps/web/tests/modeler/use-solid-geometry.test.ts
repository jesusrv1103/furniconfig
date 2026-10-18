/**
 * FASE-4C-B — `retainSolidGeometry` (ciclo de vida de la geometría).
 *
 * Verifica la política de recursos de la auditoría §2 SIN WebGL:
 *
 * - UNA geometría por malla con los datos correctos (position/index);
 * - `adopt()` contabiliza `created` UNA sola vez (idempotente);
 * - `release()` emite el evento `dispose` de Three.js, contabiliza
 *   `disposed` y es idempotente (nunca un doble dispose);
 * - cada retención es independiente (liberar una no toca a otra);
 * - la entrada `SolidMeshRenderData` no se muta;
 * - invariante sin fugas: `disposed === created` al cerrar todo.
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
  // Los contadores son de módulo: se dejan limpios para la siguiente test.
  geometryLifecycle.created = geometryLifecycle.disposed;
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

  it('release() sin adopt() previa no contabiliza created (solo disposed)', () => {
    // Simula el descarte de una geometría nunca montada (doble render
    // de StrictMode): se libera sin haber sido adoptada.
    const retained = retainSolidGeometry(meshFixture('ghost'));
    const createdBefore = geometryLifecycle.created;

    retained.release();

    expect(geometryLifecycle.created).toBe(createdBefore);
    expect(geometryLifecycle.disposed).toBe(createdBefore + 1);
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
