/**
 * WAVE-02 BLOQUE 1 — caja de encuadre de la escena
 * (`lib/modeler/scene-bounds.ts`).
 *
 * Verifica: caja por defecto idéntica a la anterior (paridad de escena
 * vacía), AABB de clósets por posición + dimensiones, AABB de sólidos
 * por croquis + extrusión, margen del 10 % con mínimo 200 mm, y que un
 * componente con params inválidos se omite sin romper el cálculo.
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptySceneDocument,
  type SceneDocument,
  type SceneObject,
} from '@furniconfig/modeler-core';
import { DEFAULT_CONFIG } from '../../src/lib/config.js';

import {
  DEFAULT_SCENE_MATERIAL,
  buildWardrobeObject,
} from '../../src/lib/modeler/document-actions.js';
import {
  DEFAULT_SCENE_BOUNDS,
  computeSceneBounds,
} from '../../src/lib/modeler/scene-bounds.js';

/** Semilla válida con material por defecto (como la pantalla). */
function seedWithMaterial(): SceneDocument {
  const base = createEmptySceneDocument();
  return { ...base, materials: [...base.materials, DEFAULT_SCENE_MATERIAL] };
}

function documentWith(objects: readonly SceneObject[]): SceneDocument {
  const seed = seedWithMaterial();
  return { ...seed, objects: [...seed.objects, ...objects] };
}

describe('computeSceneBounds', () => {
  it('escena vacía → caja por defecto idéntica a la anterior', () => {
    expect(computeSceneBounds(seedWithMaterial())).toEqual(
      DEFAULT_SCENE_BOUNDS,
    );
    expect(DEFAULT_SCENE_BOUNDS).toEqual({
      min: [-2, 0, -2],
      max: [2, 2.4, 2],
    });
  });

  it('clóset por defecto (2400×2200×600 en el origen) → AABB con margen', () => {
    const doc = documentWith([buildWardrobeObject(seedWithMaterial())]);
    const bounds = computeSceneBounds(doc);
    // Margen por eje: 10 % del tamaño, mínimo 200 mm.
    expect(bounds.min[0]).toBeCloseTo(-0.24, 5); // 2400 × 10 % = 240
    expect(bounds.max[0]).toBeCloseTo(2.64, 5);
    expect(bounds.min[1]).toBe(0);
    expect(bounds.max[1]).toBeCloseTo(2.42, 5); // 2200 × 10 % = 220
    expect(bounds.min[2]).toBeCloseTo(-0.2, 5); // 600 × 10 % < 200 → 200
    expect(bounds.max[2]).toBeCloseTo(0.8, 5);
  });

  it('dos clósets desplazados → la caja crece hacia el segundo', () => {
    const seed = seedWithMaterial();
    const first = buildWardrobeObject(seed);
    const secondBase = { ...seed, objects: [first] };
    const second = buildWardrobeObject(secondBase);
    expect(second.transform.positionMm[0]).toBe(2600); // 2400 + gap 200
    const bounds = computeSceneBounds(documentWith([first, second]));
    expect(bounds.max[0]).toBeCloseTo(5.5, 5); // 5000 + 500 (10 %) de margen
  });

  it('clóset con params inválidos se omite sin romper el cálculo', () => {
    const seed = seedWithMaterial();
    const valid = buildWardrobeObject(seed);
    const broken: SceneObject = {
      ...valid,
      id: 'component-9',
      params: { corrupto: true } as unknown as typeof valid.params,
    };
    const bounds = computeSceneBounds(documentWith([valid, broken]));
    // Solo cuenta el válido: mismo resultado que sin el roto.
    expect(bounds).toEqual(computeSceneBounds(documentWith([valid])));
  });

  it('sólido de croquis en suelo → AABB por puntos y extrusión', () => {
    const solid: SceneObject = {
      kind: 'solid',
      id: 'solid-1',
      name: 'Sólido 1',
      transform: { positionMm: [0, 0, 0] },
      materialId: DEFAULT_SCENE_MATERIAL.id,
      geometry: {
        source: 'sketch',
        sketch: {
          plane: 'ground',
          pointsMm: [
            [1000, 500],
            [2200, 500],
            [2200, 1300],
            [1000, 1300],
          ],
        },
        extrusionMm: 800,
      },
    } as unknown as SceneObject;
    const bounds = computeSceneBounds(documentWith([solid]));
    expect(bounds.min[0]).toBeCloseTo(0.8, 5); // 1000 − 200 (margen mín.)
    expect(bounds.max[0]).toBeCloseTo(2.4, 5); // 2200 + 200
    expect(bounds.min[1]).toBe(0);
    expect(bounds.max[1]).toBeCloseTo(1.0, 5); // 800 + 200
    expect(bounds.min[2]).toBeCloseTo(0.3, 5); // 500 − 200
    expect(bounds.max[2]).toBeCloseTo(1.5, 5); // 1300 + 200
  });

  it('el margen mínimo es 200 mm aunque el mueble sea estrecho', () => {
    const seed = seedWithMaterial();
    const narrow = buildWardrobeObject(seed, {
      ...DEFAULT_CONFIG,
      dimensions: { widthMm: 400, heightMm: 1000, depthMm: 400 },
    });
    const bounds = computeSceneBounds(documentWith([narrow]));
    expect(bounds.min[0]).toBeCloseTo(-0.2, 5); // margen mínimo
    expect(bounds.max[0]).toBeCloseTo(0.6, 5); // 400 + 200
  });
});
