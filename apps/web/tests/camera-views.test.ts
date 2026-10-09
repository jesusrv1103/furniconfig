import { describe, expect, it } from 'vitest';
import {
  boxCenter,
  fitDistance,
  reframe,
  viewPosition,
  VIEWER_FOV_DEG,
  VIEW_DIRECTIONS,
  type Aabb,
} from '../src/lib/camera-views.js';

/**
 * Pruebas de la capa pura de encuadre de cámara
 * (presentación; en metros). Verifican el cierre analítico
 * de `fitDistance` proyectando las esquinas de la caja con
 * la base ortonormal de la cámara, la monotonicidad y la
 * pureza de las funciones.
 */

/** Clóset por defecto: 2.4 × 2.2 × 0.6 m, frente en z = 0. */
const WARDROBE: Aabb = {
  min: [0, 0, 0],
  max: [2.4, 2.2, 0.6],
};

const TAN_HALF_FOV = Math.tan((VIEWER_FOV_DEG * Math.PI) / 360);

function cameraBasis(direction: [number, number, number]) {
  const length = Math.hypot(...direction);
  const dir = direction.map((c) => c / length) as [
    number,
    number,
    number,
  ];
  const forward: [number, number, number] = [
    -dir[0],
    -dir[1],
    -dir[2],
  ];
  const worldUp: [number, number, number] =
    Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const right: [number, number, number] = [
    forward[1] * worldUp[2] - forward[2] * worldUp[1],
    forward[2] * worldUp[0] - forward[0] * worldUp[2],
    forward[0] * worldUp[1] - forward[1] * worldUp[0],
  ];
  const rightLength = Math.hypot(...right);
  const rightUnit = right.map(
    (c) => c / rightLength,
  ) as [number, number, number];
  const up: [number, number, number] = [
    rightUnit[1] * forward[2] - rightUnit[2] * forward[1],
    rightUnit[2] * forward[0] - rightUnit[0] * forward[2],
    rightUnit[0] * forward[1] - rightUnit[1] * forward[0],
  ];
  return { dir, right: rightUnit, up };
}

/** Proyección de una esquina para la cámara en `center + dir·d`. */
function projectCorner(
  box: Aabb,
  direction: [number, number, number],
  distance: number,
  corner: [number, number, number],
) {
  const center = boxCenter(box);
  const { dir, right, up } = cameraBasis(direction);
  const v: [number, number, number] = [
    corner[0] - center[0],
    corner[1] - center[1],
    corner[2] - center[2],
  ];
  // La cámara mira hacia -dir: la profundidad positiva es
  // hacia la esquina (d - dot(v, dir)).
  const depth =
    distance - (v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]);
  const screenX =
    v[0] * right[0] + v[1] * right[1] + v[2] * right[2];
  const screenY =
    v[0] * up[0] + v[1] * up[1] + v[2] * up[2];
  return { depth, screenX, screenY };
}

function cornersOf(box: Aabb): [number, number, number][] {
  const result: [number, number, number][] = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        result.push([x, y, z]);
      }
    }
  }
  return result;
}

describe('VIEW_DIRECTIONS', () => {
  it('son vectores unitarios', () => {
    for (const direction of Object.values(VIEW_DIRECTIONS)) {
      expect(Math.hypot(...direction)).toBeCloseTo(1, 12);
    }
  });

  it('front mira desde z negativo y side desde +X', () => {
    expect(VIEW_DIRECTIONS.front).toEqual([0, 0, -1]);
    expect(VIEW_DIRECTIONS.side).toEqual([1, 0, 0]);
  });

  it('isometrica apunta al frente-derecha-arriba (1, 1, −1)', () => {
    const [x, y, z] = VIEW_DIRECTIONS.isometric;
    expect(x).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(y).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(z).toBeCloseTo(-1 / Math.sqrt(3), 12);
  });
});

describe('boxCenter', () => {
  it('calcula el centro de la caja', () => {
    expect(boxCenter(WARDROBE)).toEqual([1.2, 1.1, 0.3]);
    expect(boxCenter({ min: [0, 0, 0], max: [0, 0, 0] })).toEqual([
      0, 0, 0,
    ]);
  });
});

describe('fitDistance', () => {
  it('encuadra las 8 esquinas con el margen (cierre exacto)', () => {
    for (const direction of Object.values(VIEW_DIRECTIONS)) {
      const distance = fitDistance(
        WARDROBE,
        direction,
        VIEWER_FOV_DEG,
        1.6,
      );
      expect(distance).toBeGreaterThan(0);
      let maxYRatio = 0;
      let maxXRatio = 0;
      for (const corner of cornersOf(WARDROBE)) {
        const { depth, screenX, screenY } = projectCorner(
          WARDROBE,
          direction,
          distance,
          corner,
        );
        expect(depth).toBeGreaterThan(0);
        // Con margen 1.12 la caja ocupa ≤ 1/1.12 del hueco.
        maxYRatio = Math.max(
          maxYRatio,
          Math.abs(screenY) / (depth * TAN_HALF_FOV),
        );
        maxXRatio = Math.max(
          maxXRatio,
          Math.abs(screenX) /
            (depth * TAN_HALF_FOV * 1.6),
        );
      }
      // Cierre: al menos una restricción queda TAN justa
      // como permite el margen (no se desperdicia encuadre).
      expect(Math.max(maxYRatio, maxXRatio)).toBeCloseTo(
        1 / 1.12,
        9,
      );
      expect(Math.min(maxYRatio, maxXRatio)).toBeLessThanOrEqual(
        1 / 1.12 + 1e-9,
      );
    }
  });

  it('crece con el tamaño de la caja', () => {
    const bigger: Aabb = {
      min: [0, 0, 0],
      max: [3.6, 2.2, 0.6],
    };
    expect(
      fitDistance(bigger, VIEW_DIRECTIONS.front, 45, 1.6),
    ).toBeGreaterThan(
      fitDistance(WARDROBE, VIEW_DIRECTIONS.front, 45, 1.6),
    );
  });

  it('crece con el margen y con el ángulo de visión', () => {
    const base = fitDistance(WARDROBE, VIEW_DIRECTIONS.front, 45, 1.6, 1.12);
    expect(
      fitDistance(WARDROBE, VIEW_DIRECTIONS.front, 45, 1.6, 1.3),
    ).toBeGreaterThan(base);
    expect(
      fitDistance(WARDROBE, VIEW_DIRECTIONS.front, 60, 1.6, 1.12),
    ).toBeLessThan(base);
  });

  it('crece al estrechar el encuadre horizontal (aspecto menor)', () => {
    const wide = fitDistance(WARDROBE, VIEW_DIRECTIONS.front, 45, 2.0);
    const narrow = fitDistance(WARDROBE, VIEW_DIRECTIONS.front, 45, 0.8);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('devuelve un valor finito y en escala realista para el clóset por defecto', () => {
    for (const direction of Object.values(VIEW_DIRECTIONS)) {
      const distance = fitDistance(
        WARDROBE,
        direction,
        VIEWER_FOV_DEG,
        1.6,
      );
      expect(Number.isFinite(distance)).toBe(true);
      expect(distance).toBeGreaterThan(2);
      expect(distance).toBeLessThan(12);
    }
  });

  it('no falla con mirada vertical (usar arriba alternativo)', () => {
    const distance = fitDistance(
      WARDROBE,
      [0, 1, 0],
      VIEWER_FOV_DEG,
      1.6,
    );
    expect(Number.isFinite(distance)).toBe(true);
    expect(distance).toBeGreaterThan(0);
  });

  it('es pura: no muta la caja', () => {
    const box: Aabb = {
      min: [0, 0, 0],
      max: [2.4, 2.2, 0.6],
    };
    const snapshot = JSON.parse(JSON.stringify(box));
    fitDistance(box, VIEW_DIRECTIONS.isometric, 45, 1.6);
    expect(box).toEqual(snapshot);
  });
});

describe('viewPosition', () => {
  it('coloca la cámara en center + dirección normalizada · distancia', () => {
    expect(
      viewPosition([1.2, 1.1, 0.3], [0, 0, -5], 4),
    ).toEqual([1.2, 1.1, -3.7]);
  });

  it('normaliza direcciones no unitarias', () => {
    const position = viewPosition(
      [0, 0, 0],
      [0, 0, -2],
      3,
    );
    expect(position[2]).toBeCloseTo(-3, 12);
  });
});

describe('reframe', () => {
  const camera: [number, number, number] = [3, 2, -2.5];
  const previous: [number, number, number] = [1.2, 1.1, 0.3];

  it('traslada la cámara con el centro cuando el encuadre no cambia', () => {
    const next: [number, number, number] = [1.7, 1.1, 0.3];
    const result = reframe(camera, previous, next, 4, 4);
    // Escala 1: la offsets relativa se conserva.
    expect(result[0]).toBeCloseTo(3.5, 12);
    expect(result[1]).toBeCloseTo(2, 12);
    expect(result[2]).toBeCloseTo(-2.5, 12);
  });

  it('escala la distancia con el cociente de encuadres', () => {
    const next: [number, number, number] = [1.2, 1.1, 0.3];
    const result = reframe(camera, previous, next, 4, 6);
    // offset previo (1.8, 0.9, −2.8) × 1.5.
    expect(result[0]).toBeCloseTo(1.2 + 1.8 * 1.5, 12);
    expect(result[1]).toBeCloseTo(1.1 + 0.9 * 1.5, 12);
    expect(result[2]).toBeCloseTo(0.3 - 2.8 * 1.5, 12);
  });

  it('conserva la dirección de vista del usuario', () => {
    const next: [number, number, number] = [0.4, 2.1, 0.9];
    const result = reframe(camera, previous, next, 3, 5);
    const previousOffset: [number, number, number] = [
      camera[0] - previous[0],
      camera[1] - previous[1],
      camera[2] - previous[2],
    ];
    const resultOffset: [number, number, number] = [
      result[0] - next[0],
      result[1] - next[1],
      result[2] - next[2],
    ];
    const scale = 5 / 3;
    expect(resultOffset[0] / previousOffset[0]).toBeCloseTo(
      scale,
      12,
    );
    expect(resultOffset[2] / previousOffset[2]).toBeCloseTo(
      scale,
      12,
    );
  });

  it('con encuadre previo 0 escala 1 (sin divisiones imposibles)', () => {
    const result = reframe(camera, previous, previous, 0, 5);
    expect(result).toEqual(camera);
  });

  it('es pura: no muta las entradas', () => {
    const cameraSnapshot = [...camera];
    const previousSnapshot = [...previous];
    const next: [number, number, number] = [2, 1, 0.5];
    reframe(camera, previous, next, 4, 7);
    expect(camera).toEqual(cameraSnapshot);
    expect(previous).toEqual(previousSnapshot);
    expect(next).toEqual([2, 1, 0.5]);
  });
});
