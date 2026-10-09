import { describe, expect, it } from 'vitest';
import type { WardrobeConfig } from '../src/contract/wardrobe-config.js';
import { calculateGeometry } from '../src/engine/geometry.js';
import { buildPanels } from '../src/engine/panels.js';
import { GeometryError } from '../src/errors.js';
import type { Module } from '../src/types/module.js';
import type { Wardrobe } from '../src/types/wardrobe.js';

/**
 * 2400 mm, 3 módulos (estantería, colgado, cajones),
 * estructura 18: útil 2364 − 36 = 2328 → 776 mm por
 * módulo; alto interior 2164 mm.
 */
const baseConfig: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'hanging' },
    { kind: 'drawers', drawers: 2 },
  ],
  materials: {
    structure: { name: 'Roble', thicknessMm: 18, finish: 'mate' },
    interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
  },
};

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la función lanzara');
}

/** Wardrobe mínima para probar buildPanels directamente. */
function makeWardrobe(
  overrides: Partial<Wardrobe> = {},
): Wardrobe {
  return {
    widthMm: 2400,
    heightMm: 2200,
    depthMm: 600,
    modules: [
      {
        id: 'module-1',
        kind: 'shelves',
        widthMm: 776,
        heightMm: 2164,
        depthMm: 600,
        shelves: 3,
      } satisfies Module,
    ],
    materials: {
      structure: {
        id: 'material-structure',
        name: 'Roble',
        thicknessMm: 18,
        finish: 'mate',
      },
      interior: {
        id: 'material-interior',
        name: 'Blanco',
        thicknessMm: 15,
        finish: 'mate',
      },
      back: {
        id: 'material-back',
        name: 'Roble',
        thicknessMm: 18,
        finish: 'mate',
      },
    },
    ...overrides,
  };
}

describe('panel trasero (montaje por encaje, PROVISIONAL)', () => {
  it('ausente por defecto: sin panel "back" y sin acortar interiores', () => {
    const result = calculateGeometry(baseConfig);
    expect(
      result.panels.some((panel) => panel.role === 'back'),
    ).toBe(false);
    expect(result.wardrobe.backPanel).toBeUndefined();
    expect(result.wardrobe.materials.back).toBeUndefined();
    // Estantes a toda la profundidad (600 mm).
    const shelf = result.panels.find(
      (panel) => panel.id === 'panel-shelf-m1-1',
    );
    expect(shelf?.sizeMm.z).toBe(600);
    // Barra centrada en 600/2 = 300; bbox Z = 300 − 15.
    expect(result.rods[0]?.positionMm.z).toBe(285);
    // Caja del cajón: 600 − 36 − 30 = 534.
    const bottom = result.panels.find(
      (panel) => panel.id === 'panel-drawer-bottom-m3-1',
    );
    expect(bottom?.sizeMm.z).toBe(534);
  });

  it('backPanel.enabled = false: igual que ausente', () => {
    const result = calculateGeometry({
      ...baseConfig,
      backPanel: { enabled: false, thicknessMm: 18 },
    });
    expect(
      result.panels.some((panel) => panel.role === 'back'),
    ).toBe(false);
    expect(result.wardrobe.backPanel).toBeUndefined();
  });

  it('genera panel-back por encaje y acorta los interiores', () => {
    const result = calculateGeometry({
      ...baseConfig,
      backPanel: { enabled: true, thicknessMm: 18 },
    });

    const back = result.panels.find(
      (panel) => panel.id === 'panel-back',
    );
    expect(back).toBeDefined();
    expect(back?.role).toBe('back');
    expect(back?.moduleId).toBeNull();
    // 2400 − 36 = 2364; 2200 − 36 = 2164.
    expect(back?.sizeMm).toEqual({ x: 2364, y: 2164, z: 18 });
    expect(back?.positionMm).toEqual({
      x: 18,
      y: 18,
      z: 600 - 18,
    });
    expect(back?.materialId).toBe('material-back');
    // Default: material de estructura.
    expect(result.wardrobe.materials.back).toEqual({
      id: 'material-back',
      name: 'Roble',
      thicknessMm: 18,
      finish: 'mate',
    });

    // Estantes y divisiones: profundidad 600 − 18 = 582.
    const shelf = result.panels.find(
      (panel) => panel.id === 'panel-shelf-m1-1',
    );
    expect(shelf?.sizeMm.z).toBe(582);
    const divider = result.panels.find(
      (panel) => panel.id === 'panel-divider-1',
    );
    expect(divider?.sizeMm.z).toBe(582);

    // Barra centrada en la profundidad útil: (600−18)/2 = 291.
    expect(result.rods[0]?.positionMm.z).toBe(291 - 15); // 276

    // Caja del cajón: 600 − 36 − 18 − 30 = 516.
    const bottom = result.panels.find(
      (panel) => panel.id === 'panel-drawer-bottom-m3-1',
    );
    expect(bottom?.sizeMm.z).toBe(516);
    // Trasera del cajón, contra la cara frontal del panel
    // trasero: z = 18 + 15 + 516 = 549.
    const drawerBack = result.panels.find(
      (panel) => panel.id === 'panel-drawer-back-m3-1',
    );
    expect(drawerBack?.positionMm.z).toBe(549);

    // El panel trasero suma un tablero al total.
    const withoutBack = calculateGeometry(baseConfig);
    expect(result.totals.panelCount).toBe(
      withoutBack.totals.panelCount + 1,
    );
  });

  it('admite espesor de 15 mm', () => {
    const result = calculateGeometry({
      ...baseConfig,
      backPanel: { enabled: true, thicknessMm: 15 },
    });
    const back = result.panels.find(
      (panel) => panel.id === 'panel-back',
    );
    expect(back?.sizeMm.z).toBe(15);
    expect(back?.positionMm.z).toBe(600 - 15); // 585
    const shelf = result.panels.find(
      (panel) => panel.id === 'panel-shelf-m1-1',
    );
    expect(shelf?.sizeMm.z).toBe(585);
  });

  it('materials.back se usa como default; backPanel.material tiene prioridad', () => {
    const withMapMaterial = calculateGeometry({
      ...baseConfig,
      materials: {
        ...baseConfig.materials,
        back: {
          name: 'Fresno',
          thicknessMm: 15,
          finish: 'natural',
        },
      },
      backPanel: { enabled: true, thicknessMm: 15 },
    });
    expect(withMapMaterial.wardrobe.materials.back?.name).toBe(
      'Fresno',
    );

    const withInlineMaterial = calculateGeometry({
      ...baseConfig,
      backPanel: {
        enabled: true,
        thicknessMm: 18,
        material: {
          name: 'Nogal',
          thicknessMm: 18,
          finish: 'mate',
        },
      },
    });
    expect(
      withInlineMaterial.wardrobe.materials.back?.name,
    ).toBe('Nogal');
  });
});

describe('buildPanels — validación defensiva del trasero', () => {
  it('lanza ERR_BACK_PANEL_DEPTH si el encaje no cabe', () => {
    const tooShallow = makeWardrobe({
      depthMm: 50,
      backPanel: { thicknessMm: 18 },
    });
    const error = errorOf(() => buildPanels(tooShallow));
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe(
      'ERR_BACK_PANEL_DEPTH',
    );
  });
});
