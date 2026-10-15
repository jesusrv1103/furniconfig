import { expect } from 'vitest';

import type { MeshData } from '../src/index.js';

/** Comprueba que la malla es cerrada y orientada (garantía 2-manifold). */
export function meshTopology(mesh: MeshData): {
  openEdges: number;
  duplicatedEdges: number;
  degenerateTris: number;
} {
  const { indices } = mesh;
  if (indices.length % 3 !== 0) {
    throw new Error(`longitud de índices no múltiplo de 3: ${indices.length}`);
  }
  const directed = new Map<string, number>();
  let degenerateTris = 0;

  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] ?? 0;
    const b = indices[t + 1] ?? 0;
    const c = indices[t + 2] ?? 0;
    if (a === b || b === c || a === c) {
      degenerateTris += 1;
    }
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      const key = `${from}_${to}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }

  let openEdges = 0;
  let duplicatedEdges = 0;
  for (const [key, count] of directed) {
    const [from = 0, to = 0] = key.split('_').map(Number);
    const reverse = directed.get(`${to}_${from}`) ?? 0;
    openEdges += Math.abs(count - reverse);
    if (count > 1) {
      duplicatedEdges += count - 1;
    }
  }
  return { openEdges, duplicatedEdges, degenerateTris };
}

/** Malla no vacía, finita e indexada dentro de rango. */
export function expectValidMesh(mesh: MeshData): void {
  expect(mesh.positions.length).toBeGreaterThan(0);
  expect(mesh.indices.length).toBeGreaterThan(0);
  expect(mesh.indices.length % 3).toBe(0);
  const vertexCount = mesh.positions.length / 3;
  for (const value of mesh.positions) {
    expect(Number.isFinite(value)).toBe(true);
  }
  for (const index of mesh.indices) {
    expect(index).toBeLessThan(vertexCount);
  }
}

/** Malla cerrada: sin aristas abiertas, sin duplicados ni triángulos degenerados. */
export function expectClosedMesh(mesh: MeshData): void {
  expectValidMesh(mesh);
  const topo = meshTopology(mesh);
  expect(topo.openEdges, `aristas abiertas: ${topo.openEdges}`).toBe(0);
  expect(topo.duplicatedEdges, `aristas duplicadas: ${topo.duplicatedEdges}`).toBe(0);
  expect(topo.degenerateTris, `triángulos degenerados: ${topo.degenerateTris}`).toBe(0);
}
