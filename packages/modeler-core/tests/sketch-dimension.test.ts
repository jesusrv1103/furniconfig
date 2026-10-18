/**
 * FASE-4C-B, B2 — edición numérica de cotas de rectángulo.
 *
 * Cubre: lectura de cotas; cambio de ancho/profundidad anclado en
 * la esquina mínima (I2); invariante de mm enteros (I1); croquis
 * de salida válido para el validador del documento; rechazos con
 * `SceneError` de código estable (valor no entero/≤0, fuera de
 * cota, croquis no axial).
 */

import { describe, expect, it } from 'vitest';

import { SceneError } from '../src/errors.js';
import { SCENE_LIMITS } from '../src/limits.js';
import {
  setSketchDimension,
  sketchDimensionMm,
} from '../src/sketch-dimension.js';
import { validateSceneDocument } from '../src/validate.js';
import { createEmptySceneDocument } from '../src/document.js';
import type { SceneDocument, Sketch2D } from '../src/types/document.js';

/** Rectángulo normalizado (mismo convenio que la herramienta de dibujo). */
function rect(
  minU: number,
  minV: number,
  maxU: number,
  maxV: number,
): Sketch2D {
  return {
    plane: 'ground',
    planeOriginMm: [0, 0, 0],
    pointsMm: [
      [minU, minV],
      [maxU, minV],
      [maxU, maxV],
      [minU, maxV],
    ],
    closed: true,
  };
}

/** Documento con el rectángulo como único objeto sólido. */
function documentWith(sketch: Sketch2D, extrusionMm = 100): SceneDocument {
  const base = createEmptySceneDocument();
  const result = validateSceneDocument({
    ...base,
    materials: [
      { id: 'material-1', name: 'Tablero', finish: 'Melamina', thicknessMm: 18 },
    ],
    objects: [
      {
        id: 'solid-1',
        kind: 'solid',
        name: 'Sólido 1',
        transform: { positionMm: [0, 0, 0] },
        geometry: { source: 'sketch', sketch, extrusionMm },
        materialId: 'material-1',
      },
    ],
  });
  if (!result.ok) throw new Error('fixture inválida');
  return result.document;
}

describe('sketchDimensionMm (lectura de cotas)', () => {
  it('lee ancho y profundidad de un rectángulo normalizado', () => {
    const sketch = rect(0, 0, 1200, 600);
    expect(sketchDimensionMm(sketch, 'widthMm')).toBe(1200);
    expect(sketchDimensionMm(sketch, 'depthMm')).toBe(600);
  });

  it('lee correctamente un rectángulo en coordenadas negativas', () => {
    const sketch = rect(-500, -300, -100, -50);
    expect(sketchDimensionMm(sketch, 'widthMm')).toBe(400);
    expect(sketchDimensionMm(sketch, 'depthMm')).toBe(250);
  });

  it('rechaza croquis no axiales (triángulo,5 vértices)', () => {
    const triangle: Sketch2D = {
      ...rect(0, 0, 100, 100),
      pointsMm: [
        [0, 0],
        [100, 0],
        [50, 80],
        [0, 0], // repetido además
      ],
    };
    expect(() => sketchDimensionMm(triangle, 'widthMm')).toThrow(SceneError);
    const pentagon: Sketch2D = {
      ...rect(0, 0, 100, 100),
      pointsMm: [
        [0, 0],
        [50, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
    };
    expect(() => sketchDimensionMm(pentagon, 'widthMm')).toThrow(SceneError);
  });
});

describe('setSketchDimension (cambios exactos anclados en la esquina mínima)', () => {
  it('cambia el ancho conservando esquina mínima y profundidad', () => {
    const next = setSketchDimension(rect(200, 100, 800, 500), 'widthMm', 1200);
    expect(next.pointsMm).toEqual([
      [200, 100],
      [1400, 100],
      [1400, 500],
      [200, 500],
    ]);
    expect(sketchDimensionMm(next, 'widthMm')).toBe(1200);
    expect(sketchDimensionMm(next, 'depthMm')).toBe(400);
  });

  it('cambia la profundidad conservando esquina mínima y ancho', () => {
    const next = setSketchDimension(rect(200, 100, 800, 500), 'depthMm', 50);
    expect(next.pointsMm).toEqual([
      [200, 100],
      [800, 100],
      [800, 150],
      [200, 150],
    ]);
  });

  it('reduce la cota (encoge hacia la esquina mínima)', () => {
    const next = setSketchDimension(rect(0, 0, 1200, 600), 'widthMm', 300);
    expect(sketchDimensionMm(next, 'widthMm')).toBe(300);
    expect(sketchDimensionMm(next, 'depthMm')).toBe(600);
  });

  it('funciona con esquina mínima negativa (sigue anclada)', () => {
    const next = setSketchDimension(rect(-500, -300, -100, -50), 'widthMm', 1000);
    expect(next.pointsMm[0]).toEqual([-500, -300]);
    expect(sketchDimensionMm(next, 'widthMm')).toBe(1000);
    expect(sketchDimensionMm(next, 'depthMm')).toBe(250);
  });

  it('es puro: no muta el croquis de entrada', () => {
    const original = rect(0, 0, 1200, 600);
    const snapshot = JSON.parse(JSON.stringify(original));
    setSketchDimension(original, 'widthMm', 50);
    expect(original).toEqual(snapshot);
  });

  it('el resultado pasa validateSceneDocument dentro de un objeto', () => {
    const next = setSketchDimension(rect(0, 0, 1200, 600), 'widthMm', 1500);
    const result = validateSceneDocument({
      ...documentWith(rect(0, 0, 1200, 600)),
      objects: [
        {
          id: 'solid-1',
          kind: 'solid',
          name: 'Sólido 1',
          transform: { positionMm: [0, 0, 0] },
          geometry: { source: 'sketch', sketch: next, extrusionMm: 100 },
          materialId: 'material-1',
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('mantiene el plano y el origen del croquis', () => {
    const custom: Sketch2D = {
      ...rect(0, 0, 100, 50),
      plane: 'ground',
      planeOriginMm: [10, 20, 30],
    };
    const next = setSketchDimension(custom, 'widthMm', 200);
    expect(next.plane).toBe('ground');
    expect(next.planeOriginMm).toEqual([10, 20, 30]);
    expect(next.closed).toBe(true);
  });
});

describe('setSketchDimension (rechazos con SceneError estable)', () => {
  const sketch = rect(0, 0, 1200, 600);

  it('valores no enteros o ≤ 0 → ERR_SCENE_INVALID_OBJECT', () => {
    for (const value of [0, -5, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        setSketchDimension(sketch, 'widthMm', value);
        expect.unreachable(`debió lanzar para ${value}`);
      } catch (error) {
        expect(error).toBeInstanceOf(SceneError);
        expect((error as SceneError).code).toBe('ERR_SCENE_INVALID_OBJECT');
      }
    }
  });

  it('valores que desbordan la cota de coordenadas → error', () => {
    const limit = SCENE_LIMITS.coordinateMm.max;
    expect(() => setSketchDimension(sketch, 'widthMm', limit + 1)).toThrow(
      SceneError,
    );
    // Ancla positiva junto al borde: crecer desborda el máximo.
    const nearEdge = rect(limit - 50, 0, limit - 10, 10);
    expect(() => setSketchDimension(nearEdge, 'widthMm', 100)).toThrow(
      SceneError,
    );
    // En el borde exacto de la cota sí se admite.
    const exact = setSketchDimension(rect(0, 0, 10, 10), 'widthMm', limit);
    expect(sketchDimensionMm(exact, 'widthMm')).toBe(limit);
  });

  it('croquis no axial → error (sin aproximar)', () => {
    const lShape: Sketch2D = {
      ...sketch,
      pointsMm: [
        [0, 0],
        [100, 0],
        [100, 100],
        [50, 100],
      ],
    };
    try {
      setSketchDimension(lShape, 'widthMm', 200);
      expect.unreachable('debió rechazar la L');
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).code).toBe('ERR_SCENE_INVALID_OBJECT');
    }
  });
});
