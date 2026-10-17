/**
 * FASE-4C-B, B3 — adaptador MeshData → datos de render.
 *
 * Cubre: conversión mm→m exacta componente a componente;
 * preservación de índices y orientación; desacople de buffers
 * (copia, no referencia); no mutación de la entrada; bounds en
 * metros; geometría de Three.js con los atributos correctos.
 */

import { describe, expect, it } from 'vitest';
import type { MeshData } from '@furniconfig/kernel-adapter';

import {
  createSolidBufferGeometry,
  toSolidMeshRenderData,
} from '../../src/lib/modeler/mesh-to-renderable.js';

/** Cubo100×50×20 mm centrado en el origen (malla mínima válida). */
function boxMeshData(): MeshData {
  return {
    positions: new Float32Array([
      -50, -25, -10, 50, -25, -10, 50, 25, -10, -50, 25, -10,
      -50, -25, 10, 50, -25, 10, 50, 25, 10, -50, 25, 10,
    ]),
    indices: new Uint32Array([
      0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1,
      1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
    ]),
    bounds: {
      min: [-50, -25, -10],
      max: [50, 25, 10],
    },
  };
}

describe('toSolidMeshRenderData (mm → m en la frontera de render)', () => {
  it('divide las posiciones por1000 exactamente (sin redondeos)', () => {
    const data = toSolidMeshRenderData('solid-1', boxMeshData());
    expect(data.objectId).toBe('solid-1');
    expect(data.positionsM.length).toBe(24);
    expect(data.positionsM[0]).toBeCloseTo(-0.05, 6);
    expect(data.positionsM[7]).toBeCloseTo(0.025, 6);
    expect(data.positionsM[11]).toBeCloseTo(-0.01, 6); // z del vértice3
  });

  it('preserva índices y orientación (copia byte a byte)', () => {
    const mesh = boxMeshData();
    const data = toSolidMeshRenderData('solid-1', mesh);
    expect(Array.from(data.indices)).toEqual(Array.from(mesh.indices));
    // Copia desacoplada: el original puede venir por transferencia.
    expect(data.indices).not.toBe(mesh.indices);
    expect(data.positionsM).not.toBe(mesh.positions);
  });

  it('no muta el MeshData de entrada', () => {
    const mesh = boxMeshData();
    const positionsBefore = Array.from(mesh.positions);
    const data = toSolidMeshRenderData('solid-1', mesh);
    data.positionsM[0] = 999;
    expect(Array.from(mesh.positions)).toEqual(positionsBefore);
    expect(mesh.positions[0]).toBe(-50);
  });

  it('convierte los bounds a metros', () => {
    const data = toSolidMeshRenderData('solid-1', boxMeshData());
    expect(data.boundsM.min).toEqual([-0.05, -0.025, -0.01]);
    expect(data.boundsM.max).toEqual([0.05, 0.025, 0.01]);
  });

  it('con coordenadas negativas de dominio el signo se conserva', () => {
    const mesh = boxMeshData();
    mesh.positions[0] = -1234; // mm
    const data = toSolidMeshRenderData('solid-2', mesh);
    expect(data.positionsM[0]).toBeCloseTo(-1.234, 6);
  });
});

describe('createSolidBufferGeometry (BufferGeometry de Three.js)', () => {
  it('crea la geometría con position e index correctos', () => {
    const data = toSolidMeshRenderData('solid-1', boxMeshData());
    const geometry = createSolidBufferGeometry(data);
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(8);
    expect(position.itemSize).toBe(3);
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    expect(index?.count).toBe(36);
    // Sin normales (flatShading en el material): atributo inexistente.
    expect(geometry.getAttribute('normal')).toBeUndefined();
    geometry.dispose();
  });
});
