import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { DEFAULT_CONFIG } from '../src/lib/config.js';
import {
  createOrbitGuard,
  dragPlaneNormal,
  extractDividers,
  isDragDegenerate,
} from '../src/components/DividerDragHandle.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const geometry = deepFreeze(calculateGeometry(DEFAULT_CONFIG));

describe('extractDividers', () => {
  it('extrae una división por cada par de módulos vecinos', () => {
    const dividers = extractDividers(geometry);
    expect(dividers.length).toBe(geometry.wardrobe.modules.length - 1);
    expect(dividers.map((d) => d.index)).toEqual([0, 1]);
  });

  it('los centros caen dentro del ancho del mueble y ordenados', () => {
    const dividers = extractDividers(geometry);
    const widthM = geometry.wardrobe.widthMm / 1000;
    for (const divider of dividers) {
      expect(divider.centerXM).toBeGreaterThan(0);
      expect(divider.centerXM).toBeLessThan(widthM);
      expect(divider.minY).toBeLessThan(divider.maxY);
      expect(divider.minZ).toBeLessThan(divider.maxZ);
    }
  });
});

describe('isDragDegenerate (vista lateral)', () => {
  it('frontal e isométrica no son degeneradas', () => {
    expect(isDragDegenerate(0)).toBe(false);
    expect(isDragDegenerate(0.5)).toBe(false);
    expect(isDragDegenerate(-0.7)).toBe(false);
  });

  it('cámara sobre el eje X sí es degenerada', () => {
    expect(isDragDegenerate(1)).toBe(true);
    expect(isDragDegenerate(-1)).toBe(true);
    expect(isDragDegenerate(0.95)).toBe(true);
    expect(isDragDegenerate(-0.91)).toBe(true);
  });

  it('valores no finitos se tratan como degenerados (sin saltos)', () => {
    expect(isDragDegenerate(Number.NaN)).toBe(true);
    expect(isDragDegenerate(Number.POSITIVE_INFINITY)).toBe(true);
  });
});

describe('dragPlaneNormal (plano de interacción)', () => {
  const planePoint = { x: 1.2, y: 1.1, z: 0.3 };

  it('el plano contiene el eje X (normal perpendicular a X)', () => {
    const normal = dragPlaneNormal(
      { x: 1.2, y: 3, z: -4 },
      planePoint,
      0.2,
    );
    expect(normal).not.toBe(null);
    expect(Math.abs(normal!.x)).toBeLessThan(1e-9);
    expect(normal!.length()).toBeCloseTo(1, 9);
  });

  it('devuelve null en vista lateral degenerada', () => {
    expect(dragPlaneNormal({ x: 8, y: 1.1, z: 0.3 }, planePoint, 1)).toBe(null);
    expect(dragPlaneNormal({ x: 8, y: 1.1, z: 0.3 }, planePoint, -0.99)).toBe(null);
  });

  it('devuelve null si la cámara está sobre el divisor (sin dirección YZ)', () => {
    expect(
      dragPlaneNormal({ x: 5, y: planePoint.y, z: planePoint.z }, planePoint, 0.1),
    ).toBe(null);
  });
});

describe('createOrbitGuard (restauración de OrbitControls)', () => {
  it('desactiva al empezar y restaura al terminar', () => {
    const controls = { enabled: true };
    const guard = createOrbitGuard({ current: controls });
    guard.disable();
    expect(controls.enabled).toBe(false);
    expect(guard.isHolding).toBe(true);
    guard.restore();
    expect(controls.enabled).toBe(true);
    expect(guard.isHolding).toBe(false);
  });

  it('restore es idempotente y no toca controles ajenos', () => {
    const controls = { enabled: true };
    const guard = createOrbitGuard({ current: controls });
    guard.restore();
    expect(controls.enabled).toBe(true);
    guard.disable();
    guard.restore();
    guard.restore();
    expect(controls.enabled).toBe(true);
  });

  it('disable repetido no bloquea dos veces', () => {
    const controls = { enabled: true };
    const guard = createOrbitGuard({ current: controls });
    guard.disable();
    guard.disable();
    guard.restore();
    expect(controls.enabled).toBe(true);
    expect(guard.isHolding).toBe(false);
  });

  it('con current null no lanza y restaura el flag', () => {
    const guard = createOrbitGuard({ current: null });
    guard.disable();
    expect(guard.isHolding).toBe(true);
    expect(() => guard.restore()).not.toThrow();
    expect(guard.isHolding).toBe(false);
  });

  it('si los controles se desmontan a mitad de gesto, restore no lanza', () => {
    const ref: { current: { enabled: boolean } | null } = {
      current: { enabled: true },
    };
    const guard = createOrbitGuard(ref);
    guard.disable();
    ref.current = null;
    expect(() => guard.restore()).not.toThrow();
  });

  it('nunca deja la cámara bloqueada tras restore aunque falle la escritura', () => {
    const broken = {
      set enabled(_value: boolean) {
        throw new Error('desmontado');
      },
      get enabled(): boolean {
        return false;
      },
    };
    const ref: { current: { enabled: boolean } | null } = { current: broken };
    const guard = createOrbitGuard(ref);
    guard.disable();
    expect(guard.isHolding).toBe(true);
    expect(() => guard.restore()).not.toThrow();
    expect(guard.isHolding).toBe(false);
  });
});

describe('proyección estable ante zoom y dimensiones', () => {
  it('el plano no depende del zoom (solo de la dirección relativa)', () => {
    const planePoint = { x: 1.2, y: 1.1, z: 0.3 };
    const near = dragPlaneNormal({ x: 1.2, y: 2, z: -2 }, planePoint, 0.1);
    // Misma dirección YZ, triple de distancia (zoom out puro).
    const far = dragPlaneNormal({ x: 1.2, y: 1.1 + 2.7, z: 0.3 - 6.9 }, planePoint, 0.1);
    expect(near).not.toBe(null);
    expect(far).not.toBe(null);
    // Misma dirección YZ → misma normal (el zoom no la cambia).
    expect(near!.y).toBeCloseTo(far!.y, 6);
    expect(near!.z).toBeCloseTo(far!.z, 6);
  });

  it('todas las normales devueltas son finitas y unitarias', () => {
    const planePoint = { x: 0.8, y: 1.1, z: 0.3 };
    const cameras = [
      { x: 0.8, y: 2.5, z: -3 },
      { x: 0.8, y: 0.2, z: 4 },
      { x: -2, y: 3, z: -3 },
    ];
    for (const cam of cameras) {
      const dir = new THREE.Vector3(
        cam.x - planePoint.x,
        cam.y - planePoint.y,
        cam.z - planePoint.z,
      ).normalize();
      const normal = dragPlaneNormal(cam, planePoint, dir.x);
      expect(normal).not.toBe(null);
      expect(Number.isFinite(normal!.y)).toBe(true);
      expect(Number.isFinite(normal!.z)).toBe(true);
      expect(normal!.length()).toBeCloseTo(1, 9);
    }
  });
});
