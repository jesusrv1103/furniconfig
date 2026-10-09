import { describe, expect, it } from 'vitest';
import type { WardrobeConfig } from '../src/contract/wardrobe-config.js';
import { validateWardrobeConfig } from '../src/contract/validate.js';
import { isBoardThicknessMm } from '../src/types/material.js';
import { isModuleKind } from '../src/types/module.js';

const validConfig = {
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
} satisfies WardrobeConfig;

describe('validateWardrobeConfig', () => {
  it('acepta una configuración válida y la devuelve tipada', () => {
    const result = validateWardrobeConfig(validConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.dimensions.widthMm).toBe(3000);
    expect(result.config.modules).toHaveLength(3);
    expect(result.config.materials.structure.thicknessMm).toBe(18);
  });

  it('acepta el mínimo de 1 módulo y el máximo de 4', () => {
    for (const modules of [
      [{ kind: 'hanging' }],
      [
        { kind: 'hanging' },
        { kind: 'hanging' },
        { kind: 'hanging' },
        { kind: 'hanging' },
      ],
    ]) {
      const result = validateWardrobeConfig({ ...validConfig, modules });
      expect(result.ok).toBe(true);
    }
  });

  it('rechaza entradas que no son objetos', () => {
    for (const input of [null, undefined, 'config', 42, [], true]) {
      const result = validateWardrobeConfig(input);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]?.code).toBe('ERR_INVALID_CONFIG');
    }
  });

  it('rechaza versiones de contrato no soportadas', () => {
    for (const schemaVersion of [0, 2, '1', null, undefined]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        schemaVersion,
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_SCHEMA_VERSION',
        ),
      ).toBe(true);
    }
  });

  it('rechaza dimensiones ausentes, no enteras, no positivas o fuera de rango', () => {
    const cases: unknown[] = [
      undefined,
      '3000',
      {},
      { widthMm: 0, heightMm: 2200, depthMm: 600 },
      { widthMm: -100, heightMm: 2200, depthMm: 600 },
      { widthMm: 3000.5, heightMm: 2200, depthMm: 600 },
      { widthMm: 100, heightMm: 2200, depthMm: 600 }, // < 400 (mín. prov.)
      { widthMm: 5000, heightMm: 2200, depthMm: 600 }, // > 4000 (máx. prov.)
      { widthMm: 3000, heightMm: 500, depthMm: 600 }, // altura < 1000
      { widthMm: 3000, heightMm: 2200, depthMm: 900 }, // profundidad > 700
      { widthMm: 3000, heightMm: 2200 }, // falta depthMm
    ];
    for (const dimensions of cases) {
      const result = validateWardrobeConfig({ ...validConfig, dimensions });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some((error) => error.code === 'ERR_INVALID_DIMENSION'),
      ).toBe(true);
    }
  });

  it('rechaza módulos ausentes, vacíos o en exceso', () => {
    for (const modules of [undefined, [], 'módulos', [1, 2, 3, 4, 5]]) {
      const result = validateWardrobeConfig({ ...validConfig, modules });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_MODULE_COUNT',
        ),
      ).toBe(true);
    }
  });

  it('rechaza 5 módulos (el máximo confirmado es 4)', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      modules: Array.from({ length: 5 }, () => ({ kind: 'hanging' })),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some((error) => error.code === 'ERR_INVALID_MODULE_COUNT'),
    ).toBe(true);
  });

  it('rechaza tipos de módulo desconocidos', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      modules: [{ kind: 'corner' }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (error) => error.code === 'ERR_INVALID_MODULE_KIND',
      ),
    ).toBe(true);
  });

  it('rechaza módulos de entrepaños sin cantidad de estantes válida', () => {
    for (const shelves of [undefined, 0, -1, 9, 2.5, '3']) {
      const result = validateWardrobeConfig({
        ...validConfig,
        modules: [{ kind: 'shelves', shelves }],
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_SHELF_COUNT',
        ),
      ).toBe(true);
    }
  });

  it('rechaza "shelves" en módulos que no son de entrepaños', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      modules: [{ kind: 'hanging', shelves: 2 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (error) => error.code === 'ERR_INVALID_SHELF_COUNT',
      ),
    ).toBe(true);
  });

  it('rechaza materiales ausentes, con espesor inválido o campos vacíos', () => {
    const cases: unknown[] = [
      undefined,
      {},
      { structure: null, interior: validConfig.materials.interior },
      {
        structure: { name: '', thicknessMm: 18, finish: 'mate' },
        interior: validConfig.materials.interior,
      },
      {
        structure: { name: 'Roble', thicknessMm: 18, finish: '' },
        interior: validConfig.materials.interior,
      },
      {
        structure: { name: 'Roble', thicknessMm: 12, finish: 'mate' },
        interior: validConfig.materials.interior,
      },
      {
        structure: { name: 'Roble', thicknessMm: 16.5, finish: 'mate' },
        interior: validConfig.materials.interior,
      },
      {
        structure: validConfig.materials.structure,
        interior: { name: 'Blanco', thicknessMm: 20, finish: 'brillo' },
      },
    ];
    for (const materials of cases) {
      const result = validateWardrobeConfig({ ...validConfig, materials });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) =>
            error.code === 'ERR_INVALID_MATERIAL' ||
            error.code === 'ERR_INVALID_THICKNESS',
        ),
      ).toBe(true);
    }
  });

  it('acepta ambos espesores soportados (15 y 18 mm)', () => {
    for (const thicknessMm of [15, 18]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        materials: {
          structure: { name: 'Roble', thicknessMm, finish: 'mate' },
          interior: { name: 'Blanco', thicknessMm, finish: 'mate' },
        },
      });
      expect(result.ok).toBe(true);
    }
  });

  it('recopila varios errores en una sola validación', () => {
    const result = validateWardrobeConfig({
      schemaVersion: 99,
      dimensions: { widthMm: -1, heightMm: 2200, depthMm: 600 },
      modules: [],
      materials: {
        structure: { name: 'Roble', thicknessMm: 12, finish: 'mate' },
        interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain('ERR_INVALID_SCHEMA_VERSION');
    expect(codes).toContain('ERR_INVALID_DIMENSION');
    expect(codes).toContain('ERR_INVALID_MODULE_COUNT');
    expect(codes).toContain('ERR_INVALID_THICKNESS');
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('reporta el campo afectado en cada error', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      dimensions: { ...validConfig.dimensions, widthMm: 0 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const widthError = result.errors.find(
      (error) => error.field === 'dimensions.widthMm',
    );
    expect(widthError).toBeDefined();
    expect(widthError?.message).not.toBe('');
  });

  it('ausencia de doors/backPanel es válida (sin puertas ni trasero)', () => {
    const result = validateWardrobeConfig(validConfig);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.doors).toBeUndefined();
    expect(result.config.backPanel).toBeUndefined();
  });

  it('acepta y preserva la configuración de puertas válida', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      doors: { leaves: 2, hingeSide: 'right', clearanceMm: 5 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.doors).toEqual({
      leaves: 2,
      hingeSide: 'right',
      clearanceMm: 5,
    });
  });

  it('rechaza hojas de puerta que no sean 1 o 2', () => {
    for (const leaves of [undefined, 0, 3, 1.5, '2', null]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        doors: { leaves: leaves as 1 },
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_DOOR_LEAVES',
        ),
      ).toBe(true);
    }
  });

  it('rechaza "doors" que no sea un objeto', () => {
    for (const doors of ['dos', 42, true, []]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        doors,
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_DOOR_LEAVES',
        ),
      ).toBe(true);
    }
  });

  it('rechaza lados de bisagra inválidos', () => {
    for (const hingeSide of ['center', 'LEFT', 0, null]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        doors: { leaves: 1, hingeSide: hingeSide as 'left' },
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_HINGE_SIDE',
        ),
      ).toBe(true);
    }
  });

  it('rechaza holguras de puerta fuera de [0, 10] o no enteras', () => {
    for (const clearanceMm of [-1, 11, 2.5, '3', null]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        doors: { leaves: 1, clearanceMm: clearanceMm as number },
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_DOOR_CLEARANCE',
        ),
      ).toBe(true);
    }
  });

  it('acepta los límites de holgura de puerta (0 y 10 mm)', () => {
    for (const clearanceMm of [0, 10]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        doors: { leaves: 1, clearanceMm },
      });
      expect(result.ok).toBe(true);
    }
  });

  it('rechaza materiales de puerta inválidos (materials.door)', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      materials: {
        ...validConfig.materials,
        door: { name: 'Roble', thicknessMm: 12, finish: 'mate' },
      },
      doors: { leaves: 1 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (error) =>
          error.code === 'ERR_INVALID_MATERIAL' ||
          error.code === 'ERR_INVALID_THICKNESS',
      ),
    ).toBe(true);
  });

  it('acepta y preserva el panel trasero válido', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      backPanel: { enabled: true, thicknessMm: 15 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.backPanel).toEqual({
      enabled: true,
      thicknessMm: 15,
    });
  });

  it('rechaza "backPanel" que no sea un objeto o "enabled" no booleano', () => {
    for (const backPanel of [
      'si',
      42,
      true,
      { enabled: 'si', thicknessMm: 18 },
    ]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        backPanel,
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some((error) => error.field.startsWith('backPanel')),
      ).toBe(true);
    }
  });

  it('rechaza espesores de panel trasero distintos de 15/18', () => {
    for (const thicknessMm of [12, 16, 16.5, '18', null]) {
      const result = validateWardrobeConfig({
        ...validConfig,
        backPanel: { enabled: true, thicknessMm },
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_INVALID_THICKNESS',
        ),
      ).toBe(true);
    }
  });

  it('rechaza materiales de panel trasero inválidos (materials.back)', () => {
    const result = validateWardrobeConfig({
      ...validConfig,
      materials: {
        ...validConfig.materials,
        back: { name: '', thicknessMm: 18, finish: 'mate' },
      },
      backPanel: { enabled: true, thicknessMm: 18 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (error) => error.code === 'ERR_INVALID_MATERIAL',
      ),
    ).toBe(true);
  });
});

describe('type guards', () => {
  it('isBoardThicknessMm solo acepta 15 y 18', () => {
    expect(isBoardThicknessMm(15)).toBe(true);
    expect(isBoardThicknessMm(18)).toBe(true);
    expect(isBoardThicknessMm(12)).toBe(false);
    expect(isBoardThicknessMm(16.5)).toBe(false);
    expect(isBoardThicknessMm('18')).toBe(false);
    expect(isBoardThicknessMm(null)).toBe(false);
  });

  it('isModuleKind solo acepta los tipos del producto', () => {
    expect(isModuleKind('shelves')).toBe(true);
    expect(isModuleKind('hanging')).toBe(true);
    expect(isModuleKind('drawers')).toBe(true);
    expect(isModuleKind('corner')).toBe(false);
    expect(isModuleKind(42)).toBe(false);
  });
});
