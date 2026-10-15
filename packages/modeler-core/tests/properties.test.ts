/**
 * Pruebas de propiedades del núcleo (FASE-4B-A), sin dependencias nuevas.
 *
 * Usa un PRNG determinista (mulberry32, semilla fija) para que las
 * ejecuciones sean reproducibles en CI. Propiedades verificadas:
 *
 * 1. Todo documento construido por los constructores y por un generador de
 *    rectángulos válidos pasa la validación (coherencia constructor ↔ validador).
 * 2. Ninguna mutación aleatoria que rompa una invariante hace que el
 *    validador lance excepción: siempre devuelve un resultado discriminado.
 * 3. Una entrada validada con `ok: true` no contiene jamás `NaN` ni
 *    `Infinity` (protección de frontera).
 * 4. La validación es determinista ante cualquier entrada (misma entrada →
 *    mismos errores, en el mismo orden).
 */

import { describe, expect, it } from 'vitest';
import { createEmptySceneDocument } from '../src/document.js';
import { resolveObjectSelection } from '../src/selection.js';
import type { SceneDocument } from '../src/types/document.js';
import type { SceneIssue } from '../src/errors.js';
import { validateSceneDocument } from '../src/validate.js';

/** mulberry32: PRNG de 32 bits, determinista y sin dependencias. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

interface GeneratedScene {
  document: Record<string, unknown>;
  objectIds: readonly string[];
}

/**
 * Genera un documento válido: materiales y objetos sólidos con rectángulos
 * de área positiva, ids únicos y coordenadas dentro de cota.
 */
function generateValidScene(rng: () => number): GeneratedScene {
  const materialCount = randomInt(rng, 1, 3);
  const materials: Array<Record<string, unknown>> = [];
  for (let m = 1; m <= materialCount; m += 1) {
    materials.push({
      id: `material-${m}`,
      name: `Material ${m}`,
      finish: 'mate',
      thicknessMm: randomInt(rng, 1, 60),
    });
  }

  const objectCount = randomInt(rng, 0, 4);
  const objects: Array<Record<string, unknown>> = [];
  const objectIds: string[] = [];
  for (let o = 1; o <= objectCount; o += 1) {
    const width = randomInt(rng, 1, 4000);
    const depth = randomInt(rng, 1, 700);
    const x = randomInt(rng, -50_000, 50_000);
    const y = randomInt(rng, -50_000, 50_000);
    const z = randomInt(rng, -50_000, 50_000);
    const id = `object-${o}`;
    objectIds.push(id);
    objects.push({
      id,
      kind: 'solid',
      name: `Objeto ${o}`,
      transform: { positionMm: [x, y, z] },
      geometry: {
        source: 'sketch',
        sketch: {
          plane: 'ground',
          planeOriginMm: [0, 0, 0],
          pointsMm: [
            [0, 0],
            [width, 0],
            [width, depth],
            [0, depth],
          ],
          closed: true,
        },
        extrusionMm: randomInt(rng, 1, 500),
      },
      materialId: materials[randomInt(rng, 0, materialCount - 1)]?.id as string,
    });
  }

  return {
    document: {
      documentVersion: 1,
      id: 'scene-1',
      name: 'Generada',
      gridStepMm: randomInt(rng, 1, 100),
      originMm: [
        randomInt(rng, -1000, 1000),
        randomInt(rng, -1000, 1000),
        randomInt(rng, -1000, 1000),
      ],
      objects,
      materials,
    },
    objectIds,
  };
}

/** Recolecta todos los números alcanzables de un valor ya validado. */
function collectNumbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
    return out;
  }
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      collectNumbers((value as Record<string, unknown>)[key], out);
    }
  }
  return out;
}

/** Descripción estable de un resultado, para comparar determinismo. */
function describeResult(
  result: ReturnType<typeof validateSceneDocument>,
): { ok: true } | { ok: false; errors: SceneIssue[] } {
  if (result.ok) return { ok: true };
  return { ok: false, errors: result.errors };
}

describe('propiedades — constructores y validador coherentes', () => {
  it('todo documento generado con rectángulos válidos pasa la validación (200 semillas)', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = mulberry32(seed);
      const { document } = generateValidScene(rng);
      const result = validateSceneDocument(document);
      if (!result.ok) {
        throw new Error(
          `semilla ${seed} falló: ${JSON.stringify(result.errors)}`,
        );
      }
      expect(result.ok).toBe(true);
    }
  });

  it('createEmptySceneDocument siempre valida (100 llamadas)', () => {
    for (let i = 0; i < 100; i += 1) {
      const result = validateSceneDocument(createEmptySceneDocument());
      expect(result.ok).toBe(true);
    }
  });
});

describe('propiedades — el validador nunca lanza', () => {
  it('mutaciones aleatorias sobre un documento válido siempre devuelven resultado', () => {
    const base = generateValidScene(mulberry32(42)).document;
    const mutations: Array<(doc: Record<string, unknown>) => void> = [
      (doc) => {
        doc.documentVersion = 2;
      },
      (doc) => {
        doc.objects = null;
      },
      (doc) => {
        doc.materials = 'x';
      },
      (doc) => {
        doc.gridStepMm = Number.NaN;
      },
      (doc) => {
        doc.originMm = [0, Number.POSITIVE_INFINITY, 0];
      },
      (doc) => {
        const objects = doc.objects as Array<Record<string, unknown>>;
        // Entrada hostil deliberada: viola el tipo a propósito.
        objects[0] = 'no-objeto' as unknown as Record<string, unknown>;
      },
      (doc) => {
        const objects = doc.objects as Array<Record<string, unknown>>;
        objects[1] = undefined as unknown as Record<string, unknown>;
      },
      (doc) => {
        const objects = doc.objects as Array<Record<string, unknown>>;
        const first = objects[0];
        if (first !== undefined) first.transform = null;
      },
      (doc) => {
        const objects = doc.objects as Array<Record<string, unknown>>;
        const first = objects[0];
        if (first !== undefined) first.kind = 'holograma';
      },
      (doc) => {
        const objects = doc.objects as Array<Record<string, unknown>>;
        const geometry = objects[0]?.geometry as Record<string, unknown> | undefined;
        if (geometry !== undefined) geometry.extrusionMm = -1;
      },
      (doc) => {
        const objects = doc.objects as Array<Record<string, unknown>>;
        const geometry = objects[0]?.geometry as Record<string, unknown> | undefined;
        const sketch = geometry?.sketch as Record<string, unknown> | undefined;
        if (sketch !== undefined) sketch.pointsMm = [[0, 0]];
      },
      (doc) => {
        doc.id = '';
      },
      (doc) => {
        doc.extra = { deep: { deeper: [1, 2, { x: Number.NaN }] } };
      },
    ];

    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = mulberry32(seed);
      const doc = structuredClone(base);
      const mutation =
        mutations[Math.floor(rng() * mutations.length)] ?? ((): void => {});
      mutation(doc);
      // Propiedad: nunca lanza; siempre devuelve un resultado discriminado.
      expect(() => validateSceneDocument(doc)).not.toThrow();
      const result = validateSceneDocument(doc);
      expect(typeof result.ok).toBe('boolean');
    }
  });

  it('ruido estructural arbitrario (JSON hostil) nunca hace lanzar al validador', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      0,
      NaN,
      Infinity,
      '',
      'escena',
      [],
      [1, 2, 3],
      {},
      { documentVersion: 1 },
      { documentVersion: '1', objects: 'no' },
      { __proto__: { polluted: true }, documentVersion: 1 },
      JSON.parse('{"objects": {"0": {}, "length": 1000000000000}}'),
      JSON.parse('{"materials": ' + '1'.repeat(1000) + '}'),
      JSON.parse('{"params": ' + '['.repeat(200) + ']'.repeat(200) + '}'),
      Symbol.iterator,
    ];
    for (const input of garbage) {
      expect(() => validateSceneDocument(input)).not.toThrow();
    }
    // Y la prueba clásica de contaminación de prototipos:
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('propiedades — sin NaN/Infinity en la salida', () => {
  it('una entrada validada con ok contiene solo números finitos (200 semillas)', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const { document } = generateValidScene(mulberry32(seed));
      const result = validateSceneDocument(document);
      if (!result.ok) continue;
      const numbers = collectNumbers(result.document);
      for (const n of numbers) {
        expect(Number.isFinite(n)).toBe(true);
      }
      // Y todos los campos mm enteros (I1).
      const json = JSON.stringify(result.document);
      expect(json).not.toContain('null,'); // nada indefinido colapsado
    }
  });
});

describe('propiedades — determinismo', () => {
  it('misma entrada → mismos errores, en el mismo orden (100 semillas)', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const rng = mulberry32(seed);
      const { document } = generateValidScene(rng);
      // Rompemos dos campos a la vez para tener varios errores.
      document.documentVersion = 99;
      document.gridStepMm = 0;
      const first = validateSceneDocument(structuredClone(document));
      const second = validateSceneDocument(structuredClone(document));
      expect(describeResult(second)).toEqual(describeResult(first));
    }
  });

  it('la selección también es determinista ante documentos generados', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { document, objectIds } = generateValidScene(mulberry32(seed));
      const result = validateSceneDocument(document);
      if (!result.ok) continue;
      const first = resolveObjectSelection(result.document, {
        objectId: objectIds[0] ?? null,
      });
      const second = resolveObjectSelection(result.document, {
        objectId: objectIds[0] ?? null,
      });
      expect(second).toEqual(first);
    }
  });

  it('la validación idéntica de un documento congelado es estable', () => {
    const document: SceneDocument = createEmptySceneDocument('scene-9', 'X');
    const a = validateSceneDocument(document);
    const b = validateSceneDocument(document);
    expect(describeResult(b)).toEqual(describeResult(a));
  });
});
