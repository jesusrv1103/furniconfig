import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Module from 'manifold-3d';

import {
  KernelError,
  ManifoldKernel,
  assertSimplePolygon,
  signedDoubleAreaMm2,
  type MmPoint2,
} from '../src/index.js';
import { expectClosedMesh } from './helpers.js';

/**
 * FASE-4B-0 — pruebas de **robustez** (ampliación autorizada del cierre).
 *
 * ## Tolerancias y su justificación (nada se redondea para "quedar bien")
 *
 * | Constante | Valor | Fundamento |
 * |-----------|-------|------------|
 * | `BOUND_TOL_MM` | `1e-9` mm | El núcleo opera en `double` (éps = 2,22e-16). Con magnitudes ≤ 2·10⁵ mm la cota teórica de redondeo es ≈ 4,4e-11 mm; se da un margen de ~23× que absorbe también el error de `libm` (sin/cos) en rotaciones. |
 * | `VOL_REL_TOL` | `1e-12` | Para volúmenes hasta 1e15 mm³ el ulp es 0,125 mm³ (relativo 1,25e-16). Se tolera 1e-12 (margen ~8·10³×) por el condicionamiento de las booleanas y la perturbación simbólica en caras coplanares. |
 *
 * Se distinguen explícitamente tres capas (test "distingue…"):
 *
 * 1. **Cuantización de parámetros**: solo los parámetros en mm deben ser
 *    enteros (I8) — el adaptador los rechaza si no lo son.
 * 2. **Precisión de cálculo**: el núcleo trabaja en `double`; las mediciones
 *    (`measure()`) devuelven esos `double` sin redondear.
 * 3. **Representación final**: `MeshData.positions` es `Float32Array`
 *    (32 bits) — ahí sí hay pérdida por magnitude, y se cuantifica.
 */

const BOUND_TOL_MM = 1e-9;
const VOL_REL_TOL = 1e-12;

/** Registro de errores observados (se imprime al terminar la suite). */
const observed = {
  rotBoundMaxErrMm: 0,
  rotVolMaxRelErr: 0,
  scaleBoundMaxErrMm: 0,
  scaleVolMaxRelErr: 0,
  concaveVolMaxRelErr: 0,
  coplanarMaxAbsErrMm3: 0,
  smallVolMaxRelErr: 0,
  largeVolMaxRelErr: 0,
};

afterAll(() => {
  console.log('[robustez] errores máximos observados:', JSON.stringify(observed));
});

let kernel: ManifoldKernel;

beforeAll(async () => {
  kernel = new ManifoldKernel();
  await kernel.ready;
});

afterAll(() => {
  kernel.disposeAll();
});

function kernelErrorOf(fn: () => unknown): KernelError {
  try {
    fn();
  } catch (error) {
    if (error instanceof KernelError) return error;
    throw error;
  }
  throw new Error('se esperaba un KernelError y no se lanzó ninguno');
}

function relativeError(actual: number, expected: number): number {
  return Math.abs(actual - expected) / Math.abs(expected);
}

function dimsOf(bounds: { min: readonly number[]; max: readonly number[] }): [number, number, number] {
  return [
    (bounds.max[0] ?? 0) - (bounds.min[0] ?? 0),
    (bounds.max[1] ?? 0) - (bounds.min[1] ?? 0),
    (bounds.max[2] ?? 0) - (bounds.min[2] ?? 0),
  ];
}

// ---------------------------------------------------------------------------
describe('Robustez — rotaciones con ángulos no rectos', () => {
  const angles = [17.5, 30, 45, -60, 123.456];

  it.each(angles)('rotación de %s° conserva volumen y envolvente exacta', (angle) => {
    const box = kernel.box([800, 600, 18]);
    const rotated = kernel.rotateZ(box, angle);
    const { boundsMm, volumeMm3 } = kernel.measure(rotated);

    const rad = (angle * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const expectedW = 800 * cos + 600 * sin;
    const expectedH = 800 * sin + 600 * cos;
    const [w, h, d] = dimsOf(boundsMm);

    const boundErr = Math.max(Math.abs(w - expectedW), Math.abs(h - expectedH), Math.abs(d - 18));
    observed.rotBoundMaxErrMm = Math.max(observed.rotBoundMaxErrMm, boundErr);
    expect(boundErr, `desviación de envolvente ${boundErr} mm`).toBeLessThanOrEqual(BOUND_TOL_MM);

    const volErr = relativeError(volumeMm3, 8_640_000);
    observed.rotVolMaxRelErr = Math.max(observed.rotVolMaxRelErr, volErr);
    expect(volErr, `desviación de volumen relativa ${volErr}`).toBeLessThanOrEqual(VOL_REL_TOL);

    expectClosedMesh(kernel.toMesh(rotated));
    kernel.disposeAll();
  });

  it('no redondea la envolvente a mm enteros (los bounds quedan fraccionarios)', () => {
    const box = kernel.box([800, 600, 18]);
    const rotated = kernel.rotateZ(box, 30);
    const { boundsMm } = kernel.measure(rotated);

    const nonInteger = [...boundsMm.min, ...boundsMm.max].filter((v) => !Number.isInteger(v));
    expect(nonInteger.length, 'al menos un límite debe quedar fraccionario').toBeGreaterThan(0);
    // el valor medido coincide con el doble de precisión sin cuantizar
    expect(boundsMm.max[0]).toBeCloseTo(692.820323027551, 9);
    kernel.disposeAll();
  });

  it('una rotación de 360° vuelve a la envolvente original (idéntica malla)', () => {
    const box = kernel.box([800, 600, 18]);
    const original = kernel.toMesh(box);
    const full = kernel.rotateZ(box, 360);
    const rotated = kernel.toMesh(full);

    expect(dimsOf(kernel.measure(full).boundsMm)).toEqual([800, 600, 18]);
    // tolerancia de representación: solo el bit de redondeo de float32
    expect(Array.from(rotated.indices)).toEqual(Array.from(original.indices));
    expect(Math.max(...Array.from(rotated.positions, (v, i) => Math.abs(v - (original.positions[i] ?? 0))))).toBeLessThanOrEqual(
      BOUND_TOL_MM + 0.001,
    );
    kernel.disposeAll();
  });
});

// ---------------------------------------------------------------------------
describe('Robustez — escalados fraccionarios', () => {
  it('escala uniforme 1,5 mantiene la proporción de dimensiones y volumen', () => {
    const box = kernel.box([800, 600, 18]);
    const scaled = kernel.scale(box, 1.5);
    const { boundsMm, volumeMm3 } = kernel.measure(scaled);

    expect(dimsOf(boundsMm)).toEqual([1200, 900, 27]);
    const volErr = relativeError(volumeMm3, 8_640_000 * 1.5 ** 3);
    observed.scaleVolMaxRelErr = Math.max(observed.scaleVolMaxRelErr, volErr);
    expect(volErr).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(scaled));
    kernel.disposeAll();
  });

  it('escala 1/3 produce dimensiones fraccionarias sin redondear', () => {
    const box = kernel.box([800, 600, 18]);
    const scaled = kernel.scale(box, 1 / 3);
    const { boundsMm, volumeMm3 } = kernel.measure(scaled);
    const [w, h, d] = dimsOf(boundsMm);

    const expected: [number, number, number] = [800 / 3, 600 / 3, 18 / 3];
    const boundErr = Math.max(
      Math.abs(w - expected[0]),
      Math.abs(h - expected[1]),
      Math.abs(d - expected[2]),
    );
    observed.scaleBoundMaxErrMm = Math.max(observed.scaleBoundMaxErrMm, boundErr);
    expect(boundErr).toBeLessThanOrEqual(BOUND_TOL_MM);
    expect(Number.isInteger(w), 'w debe quedar fraccionario').toBe(false);

    const volErr = relativeError(volumeMm3, 8_640_000 / 27);
    observed.scaleVolMaxRelErr = Math.max(observed.scaleVolMaxRelErr, volErr);
    expect(volErr).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(scaled));
    kernel.disposeAll();
  });

  it('escala no uniforme fraccionaria (0,5 · 2 · 1,25) es coherente por eje', () => {
    const box = kernel.box([800, 600, 18]);
    const scaled = kernel.scale(box, [0.5, 2, 1.25]);
    const { boundsMm, volumeMm3 } = kernel.measure(scaled);

    expect(dimsOf(boundsMm)).toEqual([400, 1200, 22.5]);
    const volErr = relativeError(volumeMm3, 8_640_000 * 0.5 * 2 * 1.25);
    observed.scaleVolMaxRelErr = Math.max(observed.scaleVolMaxRelErr, volErr);
    expect(volErr).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(scaled));
    kernel.disposeAll();
  });

  it('rechaza factores no finitos o no positivos con código estable', () => {
    const box = kernel.box([800, 600, 18]);
    expect(kernelErrorOf(() => kernel.scale(box, 0)).code).toBe('invalid-input');
    expect(kernelErrorOf(() => kernel.scale(box, -1.5)).code).toBe('invalid-input');
    expect(kernelErrorOf(() => kernel.scale(box, Number.NaN)).code).toBe('invalid-input');
    expect(kernelErrorOf(() => kernel.rotateZ(box, Number.POSITIVE_INFINITY)).code).toBe('invalid-input');
    kernel.disposeAll();
  });
});

// ---------------------------------------------------------------------------
describe('Robustez — polígonos cóncavos válidos', () => {
  it('extruye una L (cónica) con volumen igual al área de shoelace × altura', () => {
    const points: MmPoint2[] = [
      [0, 0],
      [400, 0],
      [400, 200],
      [200, 200],
      [200, 600],
      [0, 600],
    ];
    const area = Math.abs(signedDoubleAreaMm2(points)) / 2;
    expect(area).toBe(160_000); // 400×600 − 200×400

    const solid = kernel.fromSketch(points, 18);
    const { boundsMm, volumeMm3 } = kernel.measure(solid);

    const volErr = relativeError(volumeMm3, area * 18);
    observed.concaveVolMaxRelErr = Math.max(observed.concaveVolMaxRelErr, volErr);
    expect(volErr, `desviación relativa ${volErr}`).toBeLessThanOrEqual(VOL_REL_TOL);
    expect(dimsOf(boundsMm)).toEqual([400, 600, 18]);
    expectClosedMesh(kernel.toMesh(solid));
    kernel.disposeAll();
  });

  it('extruye una U (cóncava con dos huecos laterales)', () => {
    const points: MmPoint2[] = [
      [0, 0],
      [400, 0],
      [400, 600],
      [300, 600],
      [300, 100],
      [100, 100],
      [100, 600],
      [0, 600],
    ];
    const expectedVolume = (Math.abs(signedDoubleAreaMm2(points)) / 2) * 18;

    const solid = kernel.fromSketch(points, 18);
    const { volumeMm3 } = kernel.measure(solid);

    const volErr = relativeError(volumeMm3, expectedVolume);
    observed.concaveVolMaxRelErr = Math.max(observed.concaveVolMaxRelErr, volErr);
    expect(volErr).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(solid));
    kernel.disposeAll();
  });

  it('una cóncava rotada45° conserva volumen y sigue cerrada', () => {
    const points: MmPoint2[] = [
      [0, 0],
      [400, 0],
      [400, 200],
      [200, 200],
      [200, 600],
      [0, 600],
    ];
    const solid = kernel.fromSketch(points, 18);
    const rotated = kernel.rotateZ(solid, 45);
    const { volumeMm3 } = kernel.measure(rotated);

    const volErr = relativeError(volumeMm3, 160_000 * 18);
    observed.concaveVolMaxRelErr = Math.max(observed.concaveVolMaxRelErr, volErr);
    expect(volErr).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(rotated));
    kernel.disposeAll();
  });
});

// ---------------------------------------------------------------------------
describe('Robustez — polígonos inválidos (se rechazan antes de calcular)', () => {
  const bowties: MmPoint2[][] = [
    [
      [0, 0],
      [400, 400],
      [400, 0],
      [0, 400],
    ],
    [
      [0, 0],
      [300, 0],
      [0, 300],
      [300, 300],
    ],
  ];

  it.each([0, 1])('el bowtie #%i se rechaza con invalid-input', (index) => {
    const points = bowties[index] ?? [];
    const error = kernelErrorOf(() => kernel.fromSketch(points, 18));
    expect(error.code).toBe('invalid-input');
    expect(error.message).toMatch(/auto-intersecta/);
  });

  it('un polígono de área nula (puntos colineales) se rechaza', () => {
    const error = kernelErrorOf(() =>
      kernel.fromSketch(
        [
          [0, 0],
          [100, 0],
          [200, 0],
        ],
        18,
      ),
    );
    expect(error.code).toBe('invalid-input');
    expect(error.message).toMatch(/área nula/);
  });

  it('menos de 3 vértices se rechaza (comprobación de la función pura)', () => {
    const error = kernelErrorOf(() => assertSimplePolygon([[0, 0], [10, 10]]));
    expect(error.code).toBe('invalid-input');
    expect(error.message).toMatch(/3 vértices/);
  });

  it('documenta por qué lo rechazamos: el núcleo por sí solo "repara" el bowtie', async () => {
    // Evidencia con manifold-3d@3.5.4 sin pasar por el adaptador: el kernel
    // devuelve status NoError con una base de 40 000 mm², cuando el área
    // shoelace del mismo polígono es 0 mm² y su área visual (dos triángulos
    // de 400×400) sería 160 000 mm². El resultado no refleja ninguna de las
    // dos interpretaciones posibles → validamos en la interfaz (regla 3).
    const toplevel = await Module();
    toplevel.setup();
    const solid = toplevel.Manifold.extrude(
      [
        [0, 0],
        [400, 400],
        [400, 0],
        [0, 400],
      ],
      18,
    );
    expect(solid.status()).toBe('NoError');
    expect(solid.volume()).toBe(720_000); // 40 000 mm² × 18 mm
    expect(Math.abs(signedDoubleAreaMm2(bowties[0] ?? []) / 2)).toBe(0);
    solid.delete();
  });
});

// ---------------------------------------------------------------------------
describe('Robustez — booleanas con caras compartidas (coplanares)', () => {
  it('dos cajas apiladas que comparten una cara completa', () => {
    const a = kernel.box([100, 100, 100]);
    const b = kernel.translate(kernel.box([100, 100, 100]), [0, 0, 100]);

    const united = kernel.union(a, b);
    expect(kernel.measure(united).volumeMm3).toBe(2_000_000);
    expectClosedMesh(kernel.toMesh(united));

    const subtracted = kernel.difference(a, b);
    expect(kernel.measure(subtracted).volumeMm3).toBe(1_000_000);
    expectClosedMesh(kernel.toMesh(subtracted));

    // solo se tocan: la intersección es de medida cero → vacío, sin error
    const common = kernel.intersect(a, b);
    expect(kernel.measure(common).volumeMm3).toBe(0);
    expect(kernel.toMesh(common).indices.length).toBe(0);
    // bounds del vacío normalizados a "sin extensión" (ver aabbFromBox)
    expect(kernel.measure(common).boundsMm).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    kernel.disposeAll();
  });

  it('caras coplanares parciales (solape del 50 % en X)', () => {
    const a = kernel.box([100, 100, 100]);
    const c = kernel.translate(kernel.box([100, 100, 100]), [50, 0, 0]);

    const cases: Array<{ actual: number; expected: number; label: string }> = [
      { actual: kernel.measure(kernel.union(a, c)).volumeMm3, expected: 1_500_000, label: 'unión' },
      { actual: kernel.measure(kernel.difference(a, c)).volumeMm3, expected: 500_000, label: 'resta' },
      { actual: kernel.measure(kernel.intersect(a, c)).volumeMm3, expected: 500_000, label: 'intersección' },
    ];
    for (const { actual, expected, label } of cases) {
      const err = Math.abs(actual - expected);
      observed.coplanarMaxAbsErrMm3 = Math.max(observed.coplanarMaxAbsErrMm3, err);
      expect(err, `${label}: desviación ${err} mm³`).toBeLessThanOrEqual(expected * VOL_REL_TOL);
    }
    kernel.disposeAll();
  });

  it('caras superiores coplanares en Z (mismo plano, solape parcial)', () => {
    const p = kernel.box([100, 100, 18]);
    const q = kernel.translate(kernel.box([100, 100, 18]), [50, 50, 0]);

    const united = kernel.union(p, q);
    const err = Math.abs(kernel.measure(united).volumeMm3 - 315_000);
    observed.coplanarMaxAbsErrMm3 = Math.max(observed.coplanarMaxAbsErrMm3, err);
    expect(err).toBeLessThanOrEqual(315_000 * VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(united));
    kernel.disposeAll();
  });
});

// ---------------------------------------------------------------------------
describe('Robustez — dimensiones muy pequeñas y muy grandes', () => {
  it('muy pequeño: caja de 1 mm³ exacta y escalada al submilímetro', () => {
    const tiny = kernel.box([1, 1, 1]);
    expect(kernel.measure(tiny).volumeMm3).toBe(1);

    const sub = kernel.scale(tiny, 0.1); // 0,1 × 0,1 × 0,1 mm
    const { boundsMm, volumeMm3 } = kernel.measure(sub);
    expect(dimsOf(boundsMm)[0]).toBeCloseTo(0.1, 12);
    const err = relativeError(volumeMm3, 0.001);
    observed.smallVolMaxRelErr = Math.max(observed.smallVolMaxRelErr, err);
    expect(err).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(sub));
    kernel.disposeAll();
  });

  it('muy pequeño: diferencia booleana con resultado de 0,125 mm³', () => {
    const box = kernel.scale(kernel.box([10, 10, 10]), 0.05); // 0,5 mm de arista
    const { volumeMm3 } = kernel.measure(box);
    const err = relativeError(volumeMm3, 0.125);
    observed.smallVolMaxRelErr = Math.max(observed.smallVolMaxRelErr, err);
    expect(err).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(box));
    kernel.disposeAll();
  });

  it('muy grande: caja de 100 m por lado con volumen exacto (1e15 mm³)', () => {
    const big = kernel.box([100_000, 100_000, 100_000]);
    const { volumeMm3, boundsMm } = kernel.measure(big);
    expect(volumeMm3).toBe(1e15);
    expect(dimsOf(boundsMm)).toEqual([100_000, 100_000, 100_000]);
    kernel.disposeAll();
  });

  it('muy grande: resta booleana grande sigue exacta dentro de la tolerancia', () => {
    const big = kernel.box([100_000, 100_000, 100_000]);
    const slab = kernel.box([1_000, 1_000, 100_000]);
    const cut = kernel.difference(big, slab);
    const { volumeMm3 } = kernel.measure(cut);

    const expected = 1e15 - 1e11; // 999 900 000 000 000
    const err = relativeError(volumeMm3, expected);
    observed.largeVolMaxRelErr = Math.max(observed.largeVolMaxRelErr, err);
    expect(err, `desviación relativa ${err}`).toBeLessThanOrEqual(VOL_REL_TOL);
    expectClosedMesh(kernel.toMesh(cut));
    kernel.disposeAll();
  });

  it('traslación grande conserva bounds en mm exactos (double)', () => {
    const box = kernel.box([800, 600, 18]);
    const moved = kernel.translate(box, [100_000, 50_000, 0]);
    const { boundsMm } = kernel.measure(moved);
    expect(boundsMm.min).toEqual([100_000, 50_000, 0]);
    expect(boundsMm.max).toEqual([100_800, 50_600, 18]);
    kernel.disposeAll();
  });
});

// ---------------------------------------------------------------------------
describe('Robustez — cuantización de parámetros vs cálculo vs representación', () => {
  it('1) los parámetros en mm deben ser enteros: se rechazan los fraccionarios', () => {
    expect(kernelErrorOf(() => kernel.box([800.5, 600, 18])).code).toBe('invalid-input');
    expect(kernelErrorOf(() => kernel.fromSketch([[0.5, 0], [10, 0], [10, 10]], 18)).code).toBe('invalid-input');
    expect(kernelErrorOf(() => kernel.translate(kernel.box([1, 1, 1]), [1.5, 0, 0])).code).toBe('invalid-input');
    kernel.disposeAll();
  });

  it('2) el cálculo interno es double: bounds exactos más allá de 2²⁴ mm', () => {
    const box = kernel.box([800, 600, 18]);
    const moved = kernel.translate(box, [16_777_217, 0, 0]); // 2²⁴ + 1
    const { boundsMm, volumeMm3 } = kernel.measure(moved);

    // sin redondeo: el double sí representa 16 777 217
    expect(boundsMm.min[0]).toBe(16_777_217);
    expect(boundsMm.max[0]).toBe(16_777_217 + 800);
    expect(volumeMm3).toBe(8_640_000);
    kernel.disposeAll();
  });

  it('3) la representación final (Float32) pierde más allá de 2²⁴ mm y se cuantifica', () => {
    const box = kernel.box([800, 600, 18]);
    const moved = kernel.translate(box, [16_777_217, 0, 0]);
    const mesh = kernel.toMesh(moved);
    const xs = Array.from(mesh.positions).filter((_, i) => i % 3 === 0);
    const expectedX = [16_777_217, 16_777_217 + 800];

    const maxDev = Math.max(...xs.map((v) => Math.min(...expectedX.map((e) => Math.abs(v - e)))));
    // Float32 con 24 bits: paso de 2 mm en [2²⁴, 2²⁵) → desviación de 1 mm
    expect(maxDev).toBeGreaterThanOrEqual(1);
    expect(maxDev).toBeLessThan(2);
    kernel.disposeAll();
  });

  it('3b) a escala de mueble (< 2²⁴ mm) la representación Float32 es exacta', () => {
    const box = kernel.box([800, 600, 18]);
    const mesh = kernel.toMesh(box);
    const inexact = Array.from(mesh.positions).filter((v) => Math.fround(v) !== v);
    expect(inexact, 'ninguna coordenada debe perder precisión').toEqual([]);
    kernel.disposeAll();
  });
});
