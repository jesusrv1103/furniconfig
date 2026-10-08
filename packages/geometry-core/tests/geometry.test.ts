import { describe, expect, it } from 'vitest';
import type { WardrobeConfig } from '../src/contract/wardrobe-config.js';
import {
  calculateGeometry,
  ConfigValidationError,
  resolveWardrobe,
} from '../src/engine/geometry.js';
import { buildPanels } from '../src/engine/panels.js';
import { GeometryError } from '../src/errors.js';

const config: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 3000, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'hanging' },
    { kind: 'drawers' },
  ],
  materials: {
    structure: { name: 'Melamina roble', thicknessMm: 18, finish: 'mate' },
    interior: { name: 'Melamina blanco', thicknessMm: 15, finish: 'mate' },
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

describe('calculateGeometry', () => {
  const result = calculateGeometry(config);

  it('resuelve el clóset con dimensiones externas y materiales', () => {
    expect(result.wardrobe.widthMm).toBe(3000);
    expect(result.wardrobe.heightMm).toBe(2200);
    expect(result.wardrobe.depthMm).toBe(600);
    expect(result.wardrobe.materials.structure.id).toBe(
      'material-structure',
    );
    expect(result.wardrobe.materials.interior.id).toBe('material-interior');
  });

  it('resuelve módulos con ids deterministas y anchos útiles', () => {
    expect(result.wardrobe.modules.map((m) => m.id)).toEqual([
      'module-1',
      'module-2',
      'module-3',
    ]);
    // 3000 − 36 (laterales) − 36 (divisiones) = 2928 → 976 por módulo
    for (const module of result.wardrobe.modules) {
      expect(module.widthMm).toBe(976);
      expect(module.heightMm).toBe(2200 - 2 * 18); // 2164
      expect(module.depthMm).toBe(600);
    }
    expect(result.wardrobe.modules[0]?.kind).toBe('shelves');
    expect(result.wardrobe.modules[0]?.shelves).toBe(3);
    expect(result.wardrobe.modules[1]?.shelves).toBeUndefined();
  });

  it('genera paneles globales: 2 laterales, superior e inferior', () => {
    const sides = result.panels.filter((panel) => panel.role === 'side');
    expect(sides).toHaveLength(2);

    const left = result.panels.find((p) => p.id === 'panel-side-left');
    const right = result.panels.find((p) => p.id === 'panel-side-right');
    expect(left?.sizeMm).toEqual({ x: 18, y: 2200, z: 600 });
    expect(left?.positionMm).toEqual({ x: 0, y: 0, z: 0 });
    expect(right?.positionMm).toEqual({ x: 3000 - 18, y: 0, z: 0 });

    const bottom = result.panels.find((p) => p.id === 'panel-bottom');
    const top = result.panels.find((p) => p.id === 'panel-top');
    expect(bottom?.sizeMm).toEqual({ x: 3000 - 36, y: 18, z: 600 });
    expect(bottom?.positionMm).toEqual({ x: 18, y: 0, z: 0 });
    expect(top?.positionMm).toEqual({ x: 18, y: 2200 - 18, z: 0 });
  });

  it('genera divisiones interiores entre módulos consecutivos', () => {
    const dividers = result.panels.filter(
      (panel) => panel.role === 'divider',
    );
    expect(dividers).toHaveLength(2); // 3 módulos → 2 divisiones

    const first = result.panels.find((p) => p.id === 'panel-divider-1');
    const second = result.panels.find((p) => p.id === 'panel-divider-2');
    expect(first?.sizeMm).toEqual({ x: 18, y: 2164, z: 600 });
    // Módulo 1: x ∈ [18, 994) → división en x=994, y entre tableros
    expect(first?.positionMm).toEqual({ x: 18 + 976, y: 18, z: 0 });
    expect(second?.positionMm).toEqual({ x: 994 + 18 + 976, y: 18, z: 0 });
  });

  it('genera entrepaños solo en módulos "shelves", distribuidos uniformemente', () => {
    const shelves = result.panels.filter((panel) => panel.role === 'shelf');
    expect(shelves).toHaveLength(3); // solo el módulo 1

    // Altura interior 2164, 3 estantes → 4 huecos de 541 mm
    const shelfYs = shelves.map((panel) => panel.positionMm.y);
    expect(shelfYs).toEqual([552, 1093, 1634]);
    for (const shelf of shelves) {
      expect(shelf.moduleId).toBe('module-1');
      expect(shelf.materialId).toBe('material-interior');
      expect(shelf.sizeMm).toEqual({ x: 976, y: 15, z: 600 });
      expect(shelf.positionMm.x).toBe(18);
      expect(shelf.positionMm.z).toBe(0);
    }
  });

  it('módulos de colgado y cajones no generan paneles interiores en Fase 0', () => {
    const module2Panels = result.panels.filter(
      (panel) => panel.moduleId === 'module-2',
    );
    const module3Panels = result.panels.filter(
      (panel) => panel.moduleId === 'module-3',
    );
    expect(module2Panels).toHaveLength(0);
    expect(module3Panels).toHaveLength(0);
  });

  it('todo panel referencia un material existente', () => {
    const materialIds = new Set([
      result.wardrobe.materials.structure.id,
      result.wardrobe.materials.interior.id,
    ]);
    for (const panel of result.panels) {
      expect(materialIds.has(panel.materialId)).toBe(true);
    }
  });

  it('los anchos horizontales suman el ancho total del clóset', () => {
    const horizontalPanels = result.panels.filter(
      (panel) => panel.role === 'side' || panel.role === 'divider',
    );
    const panelsWidth = horizontalPanels.reduce(
      (sum, panel) => sum + panel.sizeMm.x,
      0,
    );
    const modulesWidth = result.wardrobe.modules.reduce(
      (sum, module) => sum + module.widthMm,
      0,
    );
    expect(panelsWidth + modulesWidth).toBe(3000);
  });

  it('reporta totales coherentes (conteo y volumen de paneles)', () => {
    // 2 laterales + superior + inferior + 2 divisiones + 3 entrepaños = 9
    expect(result.totals.panelCount).toBe(9);
    const expectedVolume =
      2 * (18 * 2200 * 600) + // laterales
      2 * (2964 * 18 * 600) + // superior e inferior
      2 * (18 * 2164 * 600) + // divisiones
      3 * (976 * 15 * 600); // entrepaños
    expect(result.totals.panelVolumeMm3).toBe(expectedVolume);
    expect(result.totals.panelVolumeMm3).toBe(184_636_800);
  });

  it('es determinista: dos ejecuciones producen resultados idénticos', () => {
    expect(JSON.stringify(calculateGeometry(config))).toBe(
      JSON.stringify(result),
    );
  });

  it('no muta la configuración de entrada', () => {
    const snapshot = JSON.stringify(config);
    calculateGeometry(config);
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});

describe('calculateGeometry — límites y entradas inválidas', () => {
  it('lanza ConfigValidationError con los errores de validación', () => {
    const error = errorOf(() =>
      calculateGeometry({ ...config, dimensions: { ...config.dimensions, widthMm: -1 } }),
    );
    expect(error).toBeInstanceOf(ConfigValidationError);
    expect(error).toBeInstanceOf(GeometryError);
    const validationError = error as ConfigValidationError;
    expect(validationError.code).toBe('ERR_INVALID_CONFIG');
    expect(validationError.issues.length).toBeGreaterThan(0);
    expect(validationError.issues[0]?.field).toBe('dimensions.widthMm');
  });

  it('lanza GeometryError cuando el ancho no alcanza para 4 módulos', () => {
    const error = errorOf(() =>
      calculateGeometry({
        ...config,
        dimensions: { widthMm: 800, heightMm: 2200, depthMm: 600 },
        modules: [
          { kind: 'hanging' },
          { kind: 'hanging' },
          { kind: 'hanging' },
          { kind: 'hanging' },
        ],
      }),
    );
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_MODULE_WIDTH_TOO_SMALL');
  });

  it('lanza GeometryError ante versión de contrato inválida', () => {
    const error = errorOf(() =>
      calculateGeometry({
        ...config,
        schemaVersion: 7,
      } as unknown as WardrobeConfig),
    );
    expect(error).toBeInstanceOf(ConfigValidationError);
    const validationError = error as ConfigValidationError;
    expect(
      validationError.issues.some((issue) => issue.field === 'schemaVersion'),
    ).toBe(true);
  });

  it('clóset de un solo módulo: 4 paneles estructurales y sin divisiones', () => {
    const single: WardrobeConfig = {
      schemaVersion: 1,
      dimensions: { widthMm: 2000, heightMm: 2400, depthMm: 500 },
      modules: [{ kind: 'drawers' }],
      materials: {
        structure: { name: 'Roble', thicknessMm: 15, finish: 'mate' },
        interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
      },
    };
    const singleResult = calculateGeometry(single);
    expect(singleResult.wardrobe.modules).toHaveLength(1);
    expect(singleResult.wardrobe.modules[0]?.widthMm).toBe(2000 - 30);
    expect(singleResult.wardrobe.modules[0]?.heightMm).toBe(2400 - 30);
    expect(singleResult.totals.panelCount).toBe(4); // laterales, superior, inferior
    expect(
      singleResult.panels.filter((p) => p.role === 'divider'),
    ).toHaveLength(0);
  });

  it('entrepaños con altura interior no divisible: redondeo determinista', () => {
    // Altura interior = 2201 − 30 = 2171; 2 estantes → 3 huecos de 723.66…
    const uneven: WardrobeConfig = {
      schemaVersion: 1,
      dimensions: { widthMm: 1000, heightMm: 2201, depthMm: 500 },
      modules: [{ kind: 'shelves', shelves: 2 }],
      materials: {
        structure: { name: 'Roble', thicknessMm: 15, finish: 'mate' },
        interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
      },
    };
    const unevenResult = calculateGeometry(uneven);
    const shelves = unevenResult.panels.filter(
      (panel) => panel.role === 'shelf',
    );
    expect(shelves).toHaveLength(2);
    // hueco = 2171/3 ≈ 723.67; centros en 15+723.67=738.67 y 1462.33
    // y = round(centro − 7.5) → 731 y 1455
    expect(shelves.map((s) => s.positionMm.y)).toEqual([731, 1455]);
  });
});

describe('buildPanels y resolveWardrobe (unidades expuestas)', () => {
  it('buildPanels acepta un clóset resuelto directamente', () => {
    const wardrobe = resolveWardrobe(config);
    const panels = buildPanels(wardrobe);
    expect(panels).toHaveLength(9);
    expect(buildPanels(wardrobe)).toEqual(panels); // determinismo
  });

  it('resolveWardrobe es determinista y no muta la configuración', () => {
    const snapshot = JSON.stringify(config);
    const first = resolveWardrobe(config);
    const second = resolveWardrobe(config);
    expect(first).toEqual(second);
    expect(JSON.stringify(config)).toBe(snapshot);
  });
});
