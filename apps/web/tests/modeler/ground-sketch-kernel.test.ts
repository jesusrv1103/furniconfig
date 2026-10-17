/**
 * FASE-4C-B — `createGroundSketchKernel` (adaptador de
 * orientación croquis-en-planta).
 *
 * Verifica: transformación de malla (u,v,w)→(u,w,v) con
 * inversión de winding, AABB intercambiado en Y/Z, passthrough
 * de refs no croquis (box), medida orientada solo para refs de
 * croquis, delegación de dispose/disposeAll/cancel y etiqueta
 * del kernel envuelto.
 */

import { describe, expect, it } from 'vitest';
import type {
  AsyncGeometryKernel,
  KernelRef,
  MeshData,
} from '@furniconfig/kernel-adapter';

import {
  createGroundSketchKernel,
  meshToSceneAxes,
} from '../../src/lib/modeler/ground-sketch-kernel.js';

function mesh(
  positions: readonly number[],
  indices: readonly number[] = [0, 1, 2],
  bounds: { min: readonly number[]; max: readonly number[] } = {
    min: [0, 0, 0],
    max: [1, 1, 1],
  },
): MeshData {
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
    bounds: {
      min: [bounds.min[0] ?? 0, bounds.min[1] ?? 0, bounds.min[2] ?? 0],
      max: [bounds.max[0] ?? 0, bounds.max[1] ?? 0, bounds.max[2] ?? 0],
    },
  };
}

/** Kernel fajo mínimo: registra llamadas y devuelve valores fijos. */
class StubKernel implements AsyncGeometryKernel {
  readonly name = 'stub';
  readonly ready: Promise<void> = Promise.resolve();

  fromSketchCalls = 0;
  toMeshCalls: KernelRef[] = [];
  disposed: KernelRef[] = [];
  cancelCalls: string[] = [];
  disposeAllCalls = 0;

  /** Malla devuelta para el PRÓXIMO toMesh. */
  nextMesh: MeshData = mesh([1, 2, 3, 4, 5, 6], [0, 2, 1], {
    min: [10, 20, 30],
    max: [40, 50, 60],
  });

  async fromSketch(): Promise<KernelRef> {
    this.fromSketchCalls += 1;
    return 7;
  }

  async toMesh(ref: KernelRef): Promise<MeshData> {
    this.toMeshCalls.push(ref);
    return this.nextMesh;
  }

  async box(): Promise<KernelRef> {
    return 8;
  }
  async union(): Promise<KernelRef> {
    return 9;
  }
  async difference(): Promise<KernelRef> {
    return 9;
  }
  async intersect(): Promise<KernelRef> {
    return 9;
  }
  async translate(): Promise<KernelRef> {
    return 9;
  }
  async rotateZ(): Promise<KernelRef> {
    return 9;
  }
  async scale(): Promise<KernelRef> {
    return 9;
  }
  async measure(): Promise<{
    volumeMm3: number;
    boundsMm: { min: [number, number, number]; max: [number, number, number] };
  }> {
    return {
      volumeMm3: 42,
      boundsMm: { min: [10, 20, 30], max: [40, 50, 60] },
    };
  }
  async dispose(ref: KernelRef): Promise<void> {
    this.disposed.push(ref);
  }
  async disposeAll(): Promise<void> {
    this.disposeAllCalls += 1;
  }
  cancel(cancelKey: string): number {
    this.cancelCalls.push(cancelKey);
    return 1;
  }
}

describe('meshToSceneAxes', () => {
  it('intercambia Y/Z de las posiciones e invierte el winding', () => {
    const result = meshToSceneAxes(mesh([1, 2, 3, 4, 5, 6], [0, 2, 1]));
    expect([...result.positions]).toEqual([1, 3, 2, 4, 6, 5]);
    expect([...result.indices]).toEqual([0, 1, 2]);
  });

  it('intercambia Y/Z del AABB', () => {
    const result = meshToSceneAxes(
      mesh([0, 0, 0], [0, 0, 0], { min: [10, 20, 30], max: [40, 50, 60] }),
    );
    expect(result.bounds.min).toEqual([10, 30, 20]);
    expect(result.bounds.max).toEqual([40, 60, 50]);
  });

  it('soporta mallas sin posiciones completas (listas vacías)', () => {
    const result = meshToSceneAxes(mesh([], [], { min: [0, 0, 0], max: [0, 0, 0] }));
    expect([...result.positions]).toEqual([]);
    expect([...result.indices]).toEqual([]);
  });
});

describe('createGroundSketchKernel', () => {
  it('orienta toMesh y measure de los refs creados por fromSketch', async () => {
    const stub = new StubKernel();
    const kernel = createGroundSketchKernel(stub);

    const ref = await kernel.fromSketch(
      [
        [0, 0],
        [100, 0],
        [100, 50],
      ],
      25,
    );
    expect(stub.fromSketchCalls).toBe(1);

    const meshResult = await kernel.toMesh(ref);
    expect([...meshResult.positions]).toEqual([1, 3, 2, 4, 6, 5]);
    expect([...meshResult.indices]).toEqual([0, 1, 2]); // winding invertido
    expect(meshResult.bounds.min).toEqual([10, 30, 20]);

    const measured = await kernel.measure(ref);
    expect(measured.volumeMm3).toBe(42); // volumen sin tocar
    expect(measured.boundsMm.min).toEqual([10, 30, 20]); // orientado
  });

  it('los refs de box quedan en coordenadas de kernel (passthrough)', async () => {
    const stub = new StubKernel();
    const kernel = createGroundSketchKernel(stub);

    const ref = await kernel.box([10, 20, 30]);
    const result = await kernel.toMesh(ref);
    expect([...result.positions]).toEqual([1, 2, 3, 4, 5, 6]); // sin tocar
    expect([...result.indices]).toEqual([0, 2, 1]); // sin tocar
    expect(result.bounds.min).toEqual([10, 20, 30]); // sin tocar

    const measured = await kernel.measure(ref);
    expect(measured.boundsMm.min).toEqual([10, 20, 30]); // sin tocar
  });

  it('dispose/disposeAll liberan y limpian el seguimiento; cancel se delega', async () => {
    const stub = new StubKernel();
    const kernel = createGroundSketchKernel(stub);

    const ref = await kernel.fromSketch([[0, 0], [10, 0], [0, 10]], 5);
    kernel.cancel?.('clave-1');
    await kernel.dispose(ref);
    await kernel.disposeAll();

    expect(stub.disposed).toEqual([7]);
    expect(stub.disposeAllCalls).toBe(1);
    expect(stub.cancelCalls).toEqual(['clave-1']);
  });

  it('expone nombre envuelto y delega el estado listo', async () => {
    const stub = new StubKernel();
    const kernel = createGroundSketchKernel(stub);
    expect(kernel.name).toBe('stub+planta');
    await expect(kernel.ready).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Auditoría §1 — verificación geométrica de la transformación
// ---------------------------------------------------------------------------

/**
 * Caja cerrada en convención de KERNEL: (u, v) en su plano XY con
 * extrusión hacia +w, winding hacia fuera (volumen firmado > 0).
 */
function extrudedBox(
  u0: number,
  u1: number,
  v0: number,
  v1: number,
  w0: number,
  w1: number,
): MeshData {
  return {
    positions: new Float32Array([
      u0, v0, w0, u1, v0, w0, u1, v1, w0, u0, v1, w0,
      u0, v0, w1, u1, v0, w1, u1, v1, w1, u0, v1, w1,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
      2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
    ]),
    bounds: { min: [u0, v0, w0], max: [u1, v1, w1] },
  };
}

/**
 * Volumen firmado por divergencia (tetraedros del origen):
 * positivo ⇔ winding CCW visto desde fuera en sistema diestro.
 */
function signedVolume(positions: Float32Array, indices: Uint32Array): number {
  let sum = 0;
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = (indices[i] ?? 0) * 3;
    const b = (indices[i + 1] ?? 0) * 3;
    const c = (indices[i + 2] ?? 0) * 3;
    const ax = positions[a] ?? 0;
    const ay = positions[a + 1] ?? 0;
    const az = positions[a + 2] ?? 0;
    const bx = positions[b] ?? 0;
    const by = positions[b + 1] ?? 0;
    const bz = positions[b + 2] ?? 0;
    const cx = positions[c] ?? 0;
    const cy = positions[c + 1] ?? 0;
    const cz = positions[c + 2] ?? 0;
    sum +=
      ax * (by * cz - bz * cy) +
      ay * (bz * cx - bx * cz) +
      az * (bx * cy - by * cx);
  }
  return sum / 6;
}

describe('Auditoría §1 — correspondencia kernel XY ↔ escena XZ', () => {
  it('el croquis en planta mapea a XZ y la extrusión queda en +Y (positiva)', async () => {
    const stub = new StubKernel();
    const kernel = createGroundSketchKernel(stub);

    // Rectángulo en planta: u (ancho) ∈ [100,1300], v (prof.) ∈ [200,800].
    const ref = await kernel.fromSketch(
      [
        [100, 200],
        [1300, 200],
        [1300, 800],
        [100, 800],
      ],
      100,
    );
    // El kernel devuelve su extrusión: (u,v) en XY, w ∈ [0,100].
    stub.nextMesh = extrudedBox(100, 1300, 200, 800, 0, 100);
    const scene = await kernel.toMesh(ref);

    // Bounds exactos: u→X, extrusión→Y desde 0, v→Z (mm intactos).
    expect(scene.bounds.min).toEqual([100, 0, 200]);
    expect(scene.bounds.max).toEqual([1300, 100, 800]);

    // Todo vértice con Y ≥ 0 (extrusión hacia arriba, nunca bajo el suelo).
    for (let i = 1; i < scene.positions.length; i += 3) {
      expect(scene.positions[i] ?? -1).toBeGreaterThanOrEqual(0);
    }
    // Y máxima = extrusión exacta.
    let maxY = -Infinity;
    for (let i = 1; i < scene.positions.length; i += 3) {
      maxY = Math.max(maxY, scene.positions[i] ?? -Infinity);
    }
    expect(maxY).toBe(100);
  });

  it('preserva negativos, positivos y fracciones exactas (sin redondeos)', async () => {
    const stub = new StubKernel();
    const kernel = createGroundSketchKernel(stub);
    const ref = await kernel.fromSketch([[0, 0], [1, 0], [0, 1]], 1);
    // Valores con signo mixto y fracciones representables en Float32.
    stub.nextMesh = extrudedBox(-800, 400.75, -300, 300, 0, 0.125);
    const scene = await kernel.toMesh(ref);

    expect(scene.bounds.min).toEqual([-800, 0, -300]);
    expect(scene.bounds.max).toEqual([400.75, 0.125, 300]);
    // Vértice (u0,v0,w0) → (x,y,z) exacto.
    expect([...scene.positions.slice(0, 3)]).toEqual([-800, 0, -300]);
    // Vértice (u0,v0,w1) → la fracción llega bit a bit.
    expect([...scene.positions.slice(12, 15)]).toEqual([-800, 0.125, -300]);
  });

  it('las normales quedan hacia fuera: volumen firmado > 0 e invariante', () => {
    const kernelMesh = extrudedBox(-600, 600, -300, 300, 0, 100);
    const volumeBefore = signedVolume(kernelMesh.positions, kernelMesh.indices);
    // Convención diestra del kernel: positivo y = ancho·prof·alto.
    expect(volumeBefore).toBeCloseTo(1200 * 600 * 100, 3);
    expect(volumeBefore).toBeGreaterThan(0);

    const sceneMesh = meshToSceneAxes(kernelMesh);
    const volumeAfter = signedVolume(sceneMesh.positions, sceneMesh.indices);
    // |det| = 1 (permutación) → volumen idéntico; el winding revertido
    // compensa la reflexión → normales siguen hacia fuera.
    expect(volumeAfter).toBeCloseTo(volumeBefore, 3);
    expect(volumeAfter).toBeGreaterThan(0);
  });

  it('no muta los buffers originales (devuelve copias nuevas)', () => {
    const original = extrudedBox(-800, 400, -300, 300, 0, 100);
    const positionsSnapshot = [...original.positions];
    const indicesSnapshot = [...original.indices];
    const boundsSnapshot = {
      min: [...original.bounds.min],
      max: [...original.bounds.max],
    };

    const result = meshToSceneAxes(original);

    expect(result.positions).not.toBe(original.positions);
    expect(result.indices).not.toBe(original.indices);
    expect(result.bounds).not.toBe(original.bounds);
    // Entrada idéntica al snapshot (byte a byte).
    expect([...original.positions]).toEqual(positionsSnapshot);
    expect([...original.indices]).toEqual(indicesSnapshot);
    expect([...original.bounds.min]).toEqual(boundsSnapshot.min);
    expect([...original.bounds.max]).toEqual(boundsSnapshot.max);
    // Salida transformada, no la misma referencia.
    expect([...result.positions]).not.toEqual(positionsSnapshot);
  });

  it('los componentes de positions son una permutación exacta (sin pérdida)', () => {
    const original = extrudedBox(-800, 400.5, -300, 300, 0, 100.25);
    const scene = meshToSceneAxes(original);

    const sortedBefore = [...original.positions].sort((a, b) => a - b);
    const sortedAfter = [...scene.positions].sort((a, b) => a - b);
    expect(sortedAfter).toEqual(sortedBefore);
    // Solo se permutan posiciones (mismo recuento) e índices (triángulos intactos).
    expect(scene.positions.length).toBe(original.positions.length);
    expect(scene.indices.length).toBe(original.indices.length);
  });
});
