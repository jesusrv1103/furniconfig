/**
 * FASE-4C-B, B1 — pruebas de la lógica pura de dibujo.
 *
 * Cubre: snap simétrico (positivo/negativo/límites), los cuatro
 * sentidos de arrastre (mismo `Sketch2D` normalizado), generación
 * de croquis válidos (invariantes I1/I2), rechazo de degenerados
 * y fuera de cota, gesto (begin/update/finish/cancel) y
 * protección contra clics accidentales.
 */

import { describe, expect, it } from 'vitest';
import { SCENE_LIMITS, validateSceneDocument, createEmptySceneDocument } from '@furniconfig/modeler-core';

import {
  CLICK_GUARD_PX,
  beginDrawGesture,
  cancelDrawGesture,
  createDrawGesture,
  drawDimensionsMm,
  finishDrawGesture,
  isClick,
  rectangleSketchFromCorners,
  snapMm,
  snapPointMm,
  updateDrawGesture,
  worldToGroundMm,
} from '../../src/lib/modeler/drawing.js';

/** Gesto con esquinas snapeadas ya conocidas (helper de tests). */
function gestureBetween(
  originMm: readonly [number, number],
  currentMm: readonly [number, number],
) {
  return {
    originMm: [originMm[0], originMm[1]] as const,
    currentMm: [currentMm[0], currentMm[1]] as const,
  };
}

describe('snapMm (snap simétrico a la cuadrícula)', () => {
  it('redondea positivos a la cuadrícula más cercana', () => {
    expect(snapMm(0, 10)).toBe(0);
    expect(snapMm(4, 10)).toBe(0);
    expect(snapMm(14, 10)).toBe(10);
    expect(snapMm(16, 10)).toBe(20);
    expect(snapMm(20, 10)).toBe(20);
  });

  it('es SIMÉTRICO en .5 (JS Math.round es asimétrico: -1.5 → -1)', () => {
    // Comprobación del motivo del diseño: el redondeo nativo falla aquí.
    expect(Math.round(-1.5)).toBe(-1);
    expect(snapMm(15, 10)).toBe(20);
    expect(snapMm(-15, 10)).toBe(-20);
    expect(snapMm(25, 10)).toBe(30);
    expect(snapMm(-25, 10)).toBe(-30);
  });

  it('redondea negativos por magnitud y reaplica el signo', () => {
    expect(snapMm(-4, 10)).toBe(0); // magnitud < medio paso → 0 (nunca −0)
    expect(snapMm(-14, 10)).toBe(-10);
    expect(snapMm(-16, 10)).toBe(-20);
    expect(Object.is(snapMm(-1, 10), 0)).toBe(true); // nunca −0
  });

  it('respeta el invariante de enteros con pasos variados', () => {
    for (const step of [1, 7, 10, 100]) {
      for (const value of [-1234, -99, -1, 0, 1, 99, 1234]) {
        const snapped = snapMm(value, step);
        expect(Number.isInteger(snapped)).toBe(true);
        expect(Math.abs(snapped - value)).toBeLessThanOrEqual(step / 2);
      }
    }
  });

  it('rechaza programación inválida (RangeError)', () => {
    expect(() => snapMm(10, 0)).toThrow(RangeError);
    expect(() => snapMm(10, -5)).toThrow(RangeError);
    expect(() => snapMm(10, 2.5)).toThrow(RangeError);
    expect(() => snapMm(Number.NaN, 10)).toThrow(RangeError);
    expect(() => snapMm(Number.POSITIVE_INFINITY, 10)).toThrow(RangeError);
  });
});

describe('snapPointMm / worldToGroundMm (proyección y cuantización)', () => {
  it('convierte el punto ground (mundo, metros) a mm planos (X, Z)', () => {
    expect(worldToGroundMm([1.5, 0.7, -2.25])).toEqual([1500, -2250]);
    expect(worldToGroundMm([0, 0, 0])).toEqual([0, 0]);
  });

  it('snapPointMm deja ambas coordenadas enteras y simétricas', () => {
    expect(snapPointMm([-15, 25], 10)).toEqual([-20, 30]);
  });
});

describe('rectangleSketchFromCorners (cuatro sentidos de arrastre)', () => {
  const cases: ReadonlyArray<{
    name: string;
    a: readonly [number, number];
    b: readonly [number, number];
  }> = [
    { name: 'abajo-derecha', a: [0, 0], b: [1200, 600] },
    { name: 'abajo-izquierda', a: [1200, 0], b: [0, 600] },
    { name: 'arriba-derecha', a: [0, 600], b: [1200, 0] },
    { name: 'arriba-izquierda', a: [1200, 600], b: [0, 0] },
  ];

  it('los4 sentidos producen EXACTAMENTE el mismo Sketch2D', () => {
    const sketches = cases.map((entry) =>
      rectangleSketchFromCorners(entry.a as [number, number], entry.b as [number, number]),
    );
    for (const sketch of sketches) {
      expect(sketch).not.toBeNull();
      expect(sketch).toEqual(sketches[0]);
    }
  });

  it('produce un croquis válido para validateSceneDocument (I1/I2)', () => {
    const sketch = rectangleSketchFromCorners([0, 0], [1200, 600]);
    expect(sketch).not.toBeNull();
    const document = createEmptySceneDocument();
    const result = validateSceneDocument({
      ...document,
      materials: [
        { id: 'material-1', name: 'Tablero', finish: 'Melamina', thicknessMm: 18 },
      ],
      objects: [
        {
          id: 'solid-1',
          kind: 'solid',
          name: 'Sólido 1',
          transform: { positionMm: [0, 0, 0] },
          geometry: { source: 'sketch', sketch, extrusionMm: 100 },
          materialId: 'material-1',
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('normaliza a la esquina mínima con winding fijo (I2)', () => {
    const sketch = rectangleSketchFromCorners([800, 400], [200, 100]);
    expect(sketch?.pointsMm).toEqual([
      [200, 100],
      [800, 100],
      [800, 400],
      [200, 400],
    ]);
    expect(sketch?.plane).toBe('ground');
    expect(sketch?.planeOriginMm).toEqual([0, 0, 0]);
    expect(sketch?.closed).toBe(true);
  });

  it('admite coordenadas negativas (cuadrantes2-3)', () => {
    const sketch = rectangleSketchFromCorners([-500, -300], [-100, -50]);
    expect(sketch?.pointsMm).toEqual([
      [-500, -300],
      [-100, -300],
      [-100, -50],
      [-500, -50],
    ]);
  });

  it('rechaza degenerados (ancho o profundidad 0)', () => {
    expect(rectangleSketchFromCorners([100, 100], [100, 600])).toBeNull();
    expect(rectangleSketchFromCorners([100, 100], [900, 100])).toBeNull();
    expect(rectangleSketchFromCorners([100, 100], [100, 100])).toBeNull();
  });

  it('rechaza fuera de la cota provisional de coordenadas', () => {
    const limit = SCENE_LIMITS.coordinateMm.max;
    expect(rectangleSketchFromCorners([0, 0], [limit + 1, 100])).toBeNull();
    expect(rectangleSketchFromCorners([-limit - 1, 0], [100, 100])).toBeNull();
    // En cota exacta sí se admite.
    expect(rectangleSketchFromCorners([0, 0], [limit, 100])).not.toBeNull();
  });
});

describe('gesto de dibujo (begin/update/finish/cancel)', () => {
  it('el gesto vacío no produce croquis ni dimensiones', () => {
    const gesture = createDrawGesture();
    expect(finishDrawGesture(gesture)).toBeNull();
    expect(drawDimensionsMm(gesture)).toBeNull();
  });

  it('begin snapea el origen y fija la esquina actual allí', () => {
    const gesture = beginDrawGesture([0.123, 0, -0.44], 10);
    expect(gesture.originMm).toEqual([120, -440]);
    expect(gesture.currentMm).toEqual([120, -440]);
  });

  it('update mueve la esquina actual con snap simétrico', () => {
    const gesture = beginDrawGesture([0, 0, 0], 10);
    const moved = updateDrawGesture(gesture, [1.155, 0, -0.244], 10);
    expect(moved.originMm).toEqual([0, 0]);
    expect(moved.currentMm).toEqual([1160, -240]);
  });

  it('finish cierra el gesto en un Sketch2D válido', () => {
    const gesture = updateDrawGesture(
      beginDrawGesture([0, 0, 0], 10),
      [1.2, 0, 0.6],
      10,
    );
    const sketch = finishDrawGesture(gesture);
    expect(sketch?.pointsMm).toEqual([
      [0, 0],
      [1200, 0],
      [1200, 600],
      [0, 600],
    ]);
    expect(drawDimensionsMm(gesture)).toEqual({ widthMm: 1200, depthMm: 600 });
  });

  it('un clic sin arrastre (origen = actual) es degenerado → null', () => {
    const gesture = updateDrawGesture(
      beginDrawGesture([0.5, 0, 0.5], 10),
      [0.504, 0, 0.503], // < paso: mismo punto tras snap
      10,
    );
    expect(finishDrawGesture(gesture)).toBeNull();
  });

  it('cancel (Escape) limpia el gesto sin estados parciales', () => {
    const gesture = updateDrawGesture(
      beginDrawGesture([0, 0, 0], 10),
      [1, 0, 1],
      10,
    );
    const cancelled = cancelDrawGesture();
    expect(cancelled.originMm).toBeNull();
    expect(cancelled.currentMm).toBeNull();
    expect(finishDrawGesture(cancelled)).toBeNull();
    // El gesto original queda intacto (puro, sin mutación).
    expect(gesture.currentMm).toEqual([1000, 1000]);
  });

  it('update sobre gesto vacío es no-op (sin crash)', () => {
    const gesture = updateDrawGesture(createDrawGesture(), [1, 0, 1], 10);
    expect(gesture.originMm).toBeNull();
  });
});

describe('isClick (clickGuard contra clics accidentales)', () => {
  it('derivas pequeñas cuentan como clic y grandes como arrastre', () => {
    expect(isClick(0)).toBe(true);
    expect(isClick(CLICK_GUARD_PX)).toBe(true);
    expect(isClick(CLICK_GUARD_PX + 0.1)).toBe(false);
    expect(isClick(40)).toBe(false);
  });

  it('valores no finitos o negativos no son clic', () => {
    expect(isClick(Number.NaN)).toBe(false);
    expect(isClick(-1)).toBe(false);
    expect(isClick(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
