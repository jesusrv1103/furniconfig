import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { KernelError, ManifoldKernel } from '../src/index.js';
import { expectValidMesh, meshTopology } from './helpers.js';

/**
 * FASE-4B-0 — experimentos V2–V5 en Node.
 * V1 (carga bajo Vite en navegador) vive en `experiments/vite-check.mjs`.
 *
 * Todas las medidas están en milímetros (unidad interna del documento).
 */

let kernel: ManifoldKernel;
let initMs = 0;

beforeAll(async () => {
  kernel = new ManifoldKernel();
  await kernel.ready;
  initMs = kernel.initMs ?? 0;
});

afterAll(() => {
  kernel.disposeAll();
});

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? 0;
}

describe('V2 — operaciones geométricas', () => {
  it('crea una caja de 800 × 600 × 18 mm con medidas exactas y no vacía', () => {
    const ref = kernel.box([800, 600, 18]);
    const measured = kernel.measure(ref);

    expect(measured.boundsMm.min).toEqual([0, 0, 0]);
    expect(measured.boundsMm.max).toEqual([800, 600, 18]);
    expect(measured.volumeMm3).toBe(800 * 600 * 18);

    const mesh = kernel.toMesh(ref);
    expectValidMesh(mesh);
    expect(mesh.positions.length / 3).toBeGreaterThanOrEqual(8);
    expect(mesh.indices.length / 3).toBeGreaterThanOrEqual(12);

    const topo = meshTopology(mesh);
    expect(topo.openEdges).toBe(0);
    expect(topo.degenerateTris).toBe(0);

    kernel.dispose(ref);
  });

  it('crea un sólido mediante extrusión de un rectángulo 1200 × 600 × 18 mm', () => {
    const ref = kernel.fromSketch(
      [
        [0, 0],
        [1200, 0],
        [1200, 600],
        [0, 600],
      ],
      18,
    );
    const measured = kernel.measure(ref);

    expect(measured.boundsMm.max).toEqual([1200, 600, 18]);
    expect(measured.volumeMm3).toBe(1200 * 600 * 18);

    const mesh = kernel.toMesh(ref);
    expectValidMesh(mesh);
    expect(meshTopology(mesh).openEdges).toBe(0);

    kernel.dispose(ref);
  });

  it('realiza una resta booleana y valida que la geometría no está vacía', () => {
    const plate = kernel.fromSketch(
      [
        [0, 0],
        [1200, 0],
        [1200, 600],
        [0, 600],
      ],
      18,
    );
    const hole = kernel.box([200, 200, 100]);
    const holed = kernel.difference(plate, hole);

    const measured = kernel.measure(holed);
    const expected = 1200 * 600 * 18 - 200 * 200 * 18;
    expect(measured.volumeMm3).toBeCloseTo(expected, 6);
    expect(measured.boundsMm.max).toEqual([1200, 600, 18]);

    const mesh = kernel.toMesh(holed);
    expectValidMesh(mesh);
    const topo = meshTopology(mesh);
    expect(topo.openEdges).toBe(0);
    expect(topo.degenerateTris).toBe(0);

    kernel.dispose(holed);
    kernel.dispose(plate);
    kernel.dispose(hole);
  });

  it('las uniones e intersecciones producen volúmenes coherentes', () => {
    const a = kernel.box([100, 100, 100]);
    const b = kernel.box([100, 100, 100]);
    const moved = kernel.translate(b, [50, 0, 0]);

    const united = kernel.union(a, moved);
    expect(kernel.measure(united).volumeMm3).toBeCloseTo(100 * 100 * 100 * 2 - 50 * 100 * 100, 6);

    const common = kernel.intersect(a, moved);
    expect(kernel.measure(common).volumeMm3).toBeCloseTo(50 * 100 * 100, 6);

    for (const ref of [a, b, moved, united, common]) {
      expectValidMesh(kernel.toMesh(ref));
    }
    kernel.disposeAll();
  });
});

describe('V3 — precisión y cuantización', () => {
  it('conserva dimensiones exactas en mm antes y después de transformaciones', () => {
    const ref = kernel.fromSketch(
      [
        [10, 20],
        [810, 20],
        [810, 620],
        [10, 620],
      ],
      18,
    );
    const before = kernel.measure(ref);
    const moved = kernel.translate(ref, [100, -50, 7]);
    const after = kernel.measure(moved);

    const dims = (m: typeof before): [number, number, number] => [
      m.boundsMm.max[0] - m.boundsMm.min[0],
      m.boundsMm.max[1] - m.boundsMm.min[1],
      m.boundsMm.max[2] - m.boundsMm.min[2],
    ];

    expect(dims(before)).toEqual([800, 600, 18]);
    expect(dims(after)).toEqual([800, 600, 18]);
    expect(after.boundsMm.min).toEqual([110, -30, 7]);
    expect(after.volumeMm3).toBe(before.volumeMm3);

    kernel.disposeAll();
  });

  it('mide el error de punto flotante en operaciones compuestas', () => {
    const cases: Array<{ name: string; actual: number; expected: number }> = [];

    const box = kernel.box([800, 600, 18]);
    cases.push({ name: 'volumen caja', actual: kernel.measure(box).volumeMm3, expected: 8_640_000 });

    const plate = kernel.fromSketch(
      [
        [0, 0],
        [1200, 0],
        [1200, 600],
        [0, 600],
      ],
      18,
    );
    cases.push({ name: 'volumen extrusión', actual: kernel.measure(plate).volumeMm3, expected: 12_960_000 });

    const hole = kernel.box([200, 200, 100]);
    const holed = kernel.difference(plate, hole);
    cases.push({ name: 'volumen resta', actual: kernel.measure(holed).volumeMm3, expected: 12_240_000 });

    const diag = kernel.union(kernel.translate(box, [2000, 0, 0]), holed);
    cases.push({ name: 'volumen unión', actual: kernel.measure(diag).volumeMm3, expected: 8_640_000 + 12_240_000 });

    for (const { name, actual, expected } of cases) {
      const absError = Math.abs(actual - expected);
      const relError = absError / expected;
      // umbral: error relativo < 1e-9 (equivale a < 0.013 mm³ en el mayor caso)
      expect(relError, `${name}: error relativo ${relError}`).toBeLessThan(1e-9);
    }

    const maxAbs = Math.max(...cases.map((c) => Math.abs(c.actual - c.expected)));
    console.log(`[V3] error absoluto máximo observado: ${maxAbs} mm³`);
    kernel.disposeAll();
  });

  it('los límites devueltos permanecen en la rejilla de mm enteros (invariante I8)', () => {
    const shapes = [
      kernel.box([801, 603, 19]),
      kernel.fromSketch(
        [
          [7, 13],
          [743, 13],
          [743, 517],
          [7, 517],
        ],
        15,
      ),
    ];
    for (const ref of shapes) {
      const { boundsMm } = kernel.measure(ref);
      for (const v of [...boundsMm.min, ...boundsMm.max]) {
        expect(Number.isInteger(v)).toBe(true);
      }
    }
    kernel.disposeAll();
  });
});

describe('V4 — rendimiento (objetivo POC < 100 ms por operación)', () => {
  it('mide extrusión y booleanas con metodología reproducible (mediana de 20)', () => {
    const samples = 20;
    const extrudeTimes: number[] = [];
    const booleanTimes: number[] = [];
    const boxTimes: number[] = [];

    const rect = [
      [0, 0] as [number, number],
      [1200, 0] as [number, number],
      [1200, 600] as [number, number],
      [0, 600] as [number, number],
    ];

    for (let i = 0; i < samples; i += 1) {
      const t0 = performance.now();
      const hole = kernel.box([200, 200, 100]);
      const t1 = performance.now();
      const plate = kernel.fromSketch(rect, 18);
      const t2 = performance.now();
      const holed = kernel.difference(plate, hole);
      const t3 = performance.now();

      boxTimes.push(t1 - t0);
      extrudeTimes.push(t2 - t1);
      booleanTimes.push(t3 - t2);

      kernel.disposeAll();
    }

    const medExtrude = percentile(extrudeTimes, 0.5);
    const medBoolean = percentile(booleanTimes, 0.5);
    const medBox = percentile(boxTimes, 0.5);

    console.log(
      `[V4] init=${initMs.toFixed(1)} ms · box=${medBox.toFixed(3)} ms · ` +
        `extrusión=${medExtrude.toFixed(3)} ms · booleana=${medBoolean.toFixed(3)} ms ` +
        `(mediana de ${samples})`,
    );

    // Umbral existente (POC_PLAN etapa 0): operación básica < 100 ms.
    expect(medExtrude).toBeLessThan(100);
    expect(medBoolean).toBeLessThan(100);
    expect(initMs).toBeGreaterThan(0);
  });
});

describe('V5 — integración, determinismo y limpieza', () => {
  it('es determinista: dos ejecuciones producen mallas idénticas byte a byte', () => {
    const run = (): { positions: Float32Array; indices: Uint32Array } => {
      const ref = kernel.fromSketch(
        [
          [0, 0],
          [777, 0],
          [777, 333],
          [0, 333],
        ],
        21,
      );
      const mesh = kernel.toMesh(ref);
      kernel.dispose(ref);
      return { positions: mesh.positions, indices: mesh.indices };
    };

    const first = run();
    const second = run();
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.indices)).toEqual(Array.from(second.indices));
  });

  it('libera recursos: dispose es idempotente y disposeAll vacía el kernel', () => {
    const ref = kernel.box([10, 10, 10]);
    expect(kernel.liveCount).toBeGreaterThan(0);
    kernel.dispose(ref);
    kernel.dispose(ref); // segunda vez: no lanza
    expect(() => kernel.dispose(9999)).not.toThrow();
    kernel.disposeAll();
    expect(kernel.liveCount).toBe(0);
  });

  it('rechaza referencias desconocidas e entradas inválidas con códigos estables', () => {
    expect(() => kernel.measure(4242)).toThrowError(KernelError);
    expect(() => kernel.box([800.5, 600, 18])).toThrowError(/entero/);
    expect(() => kernel.box([0, 600, 18])).toThrowError(/mayor que 0|> 0/);
    expect(() => kernel.fromSketch([[0, 0], [10, 10]], 18)).toThrowError(/3 vértices/);
    expect(() =>
      kernel.fromSketch(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        0,
      ),
    ).toThrowError(/extrusión/);

    try {
      kernel.box([-1, 1, 1]);
      expect.unreachable('debió lanzar KernelError');
    } catch (error) {
      expect(error).toBeInstanceOf(KernelError);
      expect((error as KernelError).code).toBe('invalid-input');
    }
  });

  it('una segunda inicialización tras disposeAll sigue operativa (reinit)', async () => {
    kernel.disposeAll();
    const second = new ManifoldKernel();
    await second.ready;
    const ref = second.box([800, 600, 18]);
    expect(second.measure(ref).volumeMm3).toBe(8_640_000);
    expect(second.initMs).toBeGreaterThan(0);
    second.disposeAll();
    console.log(`[V5] reinit init=${(second.initMs ?? 0).toFixed(1)} ms (1ª: ${initMs.toFixed(1)} ms)`);
  });
});
