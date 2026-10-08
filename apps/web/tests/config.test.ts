import { describe, expect, it } from 'vitest';
import {
  BOARD_THICKNESSES_MM,
  validateWardrobeConfig,
  type ModuleKind,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  DEFAULT_CONFIG,
  DEFAULT_SHELVES,
  MODULE_KIND_LABELS,
  resetConfig,
  setDimension,
  setMaterialFinish,
  setMaterialName,
  setMaterialThickness,
  setModuleCount,
  setModuleKind,
  setModuleShelves,
} from '../src/lib/config.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('DEFAULT_CONFIG', () => {
  it('es una configuración válida según el motor', () => {
    const result = validateWardrobeConfig(DEFAULT_CONFIG);
    expect(result.ok).toBe(true);
  });

  it('usa el contrato versionado y espesores soportados', () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBe(1);
    for (const role of ['structure', 'interior'] as const) {
      expect(BOARD_THICKNESSES_MM).toContain(
        DEFAULT_CONFIG.materials[role].thicknessMm,
      );
    }
  });

  it('tiene entre 1 y 4 módulos', () => {
    expect(DEFAULT_CONFIG.modules.length).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_CONFIG.modules.length).toBeLessThanOrEqual(4);
  });
});

describe('setDimension', () => {
  it('cambia una dimensión y devuelve un objeto nuevo', () => {
    const updated = setDimension(DEFAULT_CONFIG, 'widthMm', 2800);
    expect(updated.dimensions.widthMm).toBe(2800);
    expect(updated.dimensions.heightMm).toBe(2200);
    expect(updated).not.toBe(DEFAULT_CONFIG);
  });

  it('no muta la configuración original (congelada)', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    expect(() => setDimension(frozen, 'heightMm', 2000)).not.toThrow();
    expect(frozen.dimensions.heightMm).toBe(2200);
  });

  it('acepta los tres ejes', () => {
    const widths = [
      setDimension(DEFAULT_CONFIG, 'widthMm', 1200).dimensions.widthMm,
      setDimension(DEFAULT_CONFIG, 'heightMm', 2400).dimensions.heightMm,
      setDimension(DEFAULT_CONFIG, 'depthMm', 500).dimensions.depthMm,
    ];
    expect(widths).toEqual([1200, 2400, 500]);
  });
});

describe('setModuleCount', () => {
  it('añade módulos como "hanging" hasta 4', () => {
    const updated = setModuleCount(DEFAULT_CONFIG, 4);
    expect(updated.modules).toHaveLength(4);
    expect(updated.modules[3]?.kind).toBe('hanging');
    // Los módulos originales se conservan
    expect(updated.modules[0]).toEqual(DEFAULT_CONFIG.modules[0]);
  });

  it('trunca módulos desde la derecha', () => {
    const updated = setModuleCount(DEFAULT_CONFIG, 1);
    expect(updated.modules).toHaveLength(1);
    expect(updated.modules[0]?.kind).toBe('shelves');
  });

  it('ajusta al rango confirmado 1–4', () => {
    expect(setModuleCount(DEFAULT_CONFIG, 0).modules).toHaveLength(1);
    expect(setModuleCount(DEFAULT_CONFIG, 9).modules).toHaveLength(4);
    expect(setModuleCount(DEFAULT_CONFIG, 2.6).modules).toHaveLength(3);
  });

  it('mantiene la validez de la configuración', () => {
    for (const count of [1, 2, 3, 4]) {
      const result = validateWardrobeConfig(
        setModuleCount(DEFAULT_CONFIG, count),
      );
      expect(result.ok).toBe(true);
    }
  });
});

describe('setModuleKind', () => {
  it('convierte a "shelves" añadiendo estantes por defecto', () => {
    const updated = setModuleKind(DEFAULT_CONFIG, 1, 'shelves');
    expect(updated.modules[1]).toEqual({
      kind: 'shelves',
      shelves: DEFAULT_SHELVES,
    });
  });

  it('convierte desde "shelves" quitando los estantes', () => {
    const updated = setModuleKind(DEFAULT_CONFIG, 0, 'hanging');
    expect(updated.modules[0]).toEqual({ kind: 'hanging' });
  });

  it('reinicia los estantes al volver a "shelves" (el contrato los elimina al cambiar de tipo)', () => {
    const withShelves = setModuleShelves(DEFAULT_CONFIG, 0, 5);
    const updated = setModuleKind(withShelves, 0, 'hanging');
    expect(updated.modules[0]).toEqual({ kind: 'hanging' });
    const back = setModuleKind(updated, 0, 'shelves');
    expect(back.modules[0]?.shelves).toBe(DEFAULT_SHELVES);
  });

  it('acepta todos los tipos de módulo', () => {
    const kinds: ModuleKind[] = ['shelves', 'hanging', 'drawers'];
    for (const kind of kinds) {
      const updated = setModuleKind(DEFAULT_CONFIG, 2, kind);
      expect(updated.modules[2]?.kind).toBe(kind);
      const result = validateWardrobeConfig(updated);
      expect(result.ok).toBe(true);
    }
  });

  it('no muta la configuración original (congelada)', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    expect(() => setModuleKind(frozen, 0, 'drawers')).not.toThrow();
    expect(frozen.modules[0]?.kind).toBe('shelves');
  });
});

describe('setModuleShelves', () => {
  it('cambia la cantidad de entrepaños', () => {
    const updated = setModuleShelves(DEFAULT_CONFIG, 0, 6);
    expect(updated.modules[0]?.shelves).toBe(6);
  });

  it('ignora módulos que no son de entrepaños', () => {
    const updated = setModuleShelves(DEFAULT_CONFIG, 1, 4);
    expect(updated.modules[1]).toEqual({ kind: 'hanging' });
  });
});

describe('materiales', () => {
  it('cambia el espesor a un valor soportado', () => {
    for (const thickness of BOARD_THICKNESSES_MM) {
      const updated = setMaterialThickness(
        DEFAULT_CONFIG,
        'structure',
        thickness,
      );
      expect(updated.materials.structure.thicknessMm).toBe(thickness);
      expect(updated.materials.interior.thicknessMm).toBe(
        DEFAULT_CONFIG.materials.interior.thicknessMm,
      );
      expect(validateWardrobeConfig(updated).ok).toBe(true);
    }
  });

  it('cambia nombre y acabado', () => {
    const named = setMaterialName(DEFAULT_CONFIG, 'interior', 'Nogal');
    expect(named.materials.interior.name).toBe('Nogal');
    const finished = setMaterialFinish(named, 'interior', 'brillo');
    expect(finished.materials.interior.finish).toBe('brillo');
    expect(validateWardrobeConfig(finished).ok).toBe(true);
  });

  it('no muta la configuración original (congelada)', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    expect(() =>
      setMaterialThickness(frozen, 'interior', 15),
    ).not.toThrow();
    expect(frozen.materials.interior.thicknessMm).toBe(15);
  });
});

describe('resetConfig', () => {
  it('devuelve una copia equivalente a la configuración por defecto', () => {
    expect(resetConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('devuelve una instancia nueva (no comparte referencia)', () => {
    expect(resetConfig()).not.toBe(DEFAULT_CONFIG);
    expect(resetConfig()).not.toBe(resetConfig());
  });
});

describe('etiquetas de interfaz', () => {
  it('etiqueta todos los tipos de módulo', () => {
    expect(MODULE_KIND_LABELS.shelves).toBe('Entrepaños');
    expect(MODULE_KIND_LABELS.hanging).toBe('Colgado');
    expect(MODULE_KIND_LABELS.drawers).toBe('Cajones');
  });
});

describe('combinaciones de cambios', () => {
  it('una secuencia completa de edición sigue siendo válida', () => {
    let config: WardrobeConfig = DEFAULT_CONFIG;
    config = setDimension(config, 'widthMm', 3000);
    config = setDimension(config, 'heightMm', 2400);
    config = setDimension(config, 'depthMm', 550);
    config = setModuleCount(config, 4);
    config = setModuleKind(config, 1, 'shelves');
    config = setModuleShelves(config, 1, 4);
    config = setModuleKind(config, 3, 'drawers');
    config = setMaterialThickness(config, 'structure', 15);
    config = setMaterialName(config, 'structure', 'Haya');
    config = setMaterialFinish(config, 'structure', 'brillo');

    const result = validateWardrobeConfig(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.modules).toHaveLength(4);
    expect(result.config.dimensions.widthMm).toBe(3000);
  });

  it('cada paso intermedio produce configuraciones válidas', () => {
    const steps: WardrobeConfig[] = [
      setDimension(DEFAULT_CONFIG, 'widthMm', 1000),
      setModuleCount(DEFAULT_CONFIG, 2),
      setModuleKind(DEFAULT_CONFIG, 0, 'hanging'),
      setMaterialThickness(DEFAULT_CONFIG, 'structure', 15),
    ];
    for (const step of steps) {
      expect(validateWardrobeConfig(step).ok).toBe(true);
    }
  });
});
