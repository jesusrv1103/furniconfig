import { describe, expect, it } from 'vitest';
import { calculateGeometry } from '@furniconfig/geometry-core';
import {
  computeDimensionSpecs,
  computeGlobalDimensions,
  computeModuleDimensions,
  formatMeasure,
  type DimensionSpec,
} from '../src/lib/studio/dimensions.js';
import {
  DEFAULT_CONFIG,
  setDimension,
  setDoorsEnabled,
  setModuleWidth,
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

const geometry = deepFreeze(calculateGeometry(DEFAULT_CONFIG));
const withDoors = deepFreeze(
  calculateGeometry(setDoorsEnabled(structuredClone(DEFAULT_CONFIG), true)),
);

describe('formatMeasure (unidades de presentación)', () => {
  it('milímetros: entero con separador de miles', () => {
    expect(formatMeasure(2400, 'mm')).toBe('2.400 mm');
    expect(formatMeasure(776, 'mm')).toBe('776 mm');
    expect(formatMeasure(600, 'mm')).toBe('600 mm');
  });

  it('centímetros: mm/10 con un decimal solo si lo hay', () => {
    expect(formatMeasure(2400, 'cm')).toBe('240 cm');
    expect(formatMeasure(776, 'cm')).toBe('77,6 cm');
    expect(formatMeasure(537, 'cm')).toBe('53,7 cm');
    expect(formatMeasure(600, 'cm')).toBe('60 cm');
  });

  it('no redondea el valor interno (solo presentación)', () => {
    // 333 mm → 33,3 cm exacto; no 33 cm.
    expect(formatMeasure(333, 'cm')).toBe('33,3 cm');
  });
});

describe('computeGlobalDimensions (cotas generales)', () => {
  const specs = computeGlobalDimensions(geometry, 'mm');

  it('expone ancho, alto y profundidad del mueble', () => {
    expect(specs.map((spec) => spec.id)).toEqual([
      'global-width',
      'global-height',
      'global-depth',
    ]);
    expect(specs[0]?.label).toBe('2.400 mm');
    expect(specs[1]?.label).toBe('2.200 mm');
    expect(specs[2]?.label).toBe('600 mm');
  });

  it('la línea de ancho es horizontal, bajo el mueble', () => {
    const width = specs[0];
    expect(width?.from).toEqual({ x: 0, y: -0.06, z: 0 });
    expect(width?.to).toEqual({ x: 2.4, y: -0.06, z: 0 });
    expect(width?.axis).toBe('x');
  });

  it('la línea de altura es vertical, a la izquierda del mueble', () => {
    const height = specs[1];
    expect(height?.from).toEqual({ x: -0.06, y: 0, z: 0 });
    expect(height?.to).toEqual({ x: -0.06, y: 2.2, z: 0 });
    expect(height?.axis).toBe('y');
  });

  it('la línea de profundidad es longitudinal, a la derecha', () => {
    const depth = specs[2];
    expect(depth?.from).toEqual({ x: 2.46, y: 0, z: 0 });
    expect(depth?.to).toEqual({ x: 2.46, y: 0, z: 0.6 });
    expect(depth?.axis).toBe('z');
  });

  it('las extensiones salen del borde medido hasta la línea', () => {
    const width = specs[0];
    expect(width?.extensionFrom[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(width?.extensionFrom[1]).toEqual({ x: 2.4, y: 0, z: 0 });
  });

  it('las etiquetas se colocan junto al punto medio', () => {
    const width = specs[0];
    expect(width?.labelAt.x).toBeCloseTo(1.2, 5);
    expect(width?.labelAt.y).toBeLessThan(-0.06);
    const height = specs[1];
    expect(height?.labelAt.y).toBeCloseTo(1.1, 5);
    expect(height?.labelAt.x).toBeLessThan(-0.06);
  });

  it('no cambian con puertas visibles u ocultas', () => {
    const withDoorsSpecs = computeGlobalDimensions(withDoors, 'mm');
    expect(withDoorsSpecs).toEqual(specs);
  });

  it('reflejan cambios de dimensiones del mueble', () => {
    const wider = calculateGeometry(
      setDimension(structuredClone(DEFAULT_CONFIG), 'widthMm', 3000),
    );
    const specs = computeGlobalDimensions(wider, 'mm');
    expect(specs[0]?.label).toBe('3.000 mm');
    expect(specs[0]?.to.x).toBe(3);
  });

  it('respetan la unidad de presentación', () => {
    const specs = computeGlobalDimensions(geometry, 'cm');
    expect(specs.map((spec) => spec.label)).toEqual([
      '240 cm',
      '220 cm',
      '60 cm',
    ]);
  });
});

describe('computeModuleDimensions (cotas contextuales)', () => {
  const module = geometry.wardrobe.modules[1];
  const specs = computeModuleDimensions(geometry, module!, 'mm');

  it('expone ancho y alto del módulo, sin profundidad', () => {
    expect(specs.map((spec) => spec.id)).toEqual([
      'module-width',
      'module-height',
    ]);
  });

  it('el ancho del módulo es su apertura (776 mm)', () => {
    expect(specs[0]?.label).toBe('776 mm');
    const width = specs[0]!;
    expect(width.to.x - width.from.x).toBeCloseTo(0.776, 5);
  });

  it('el alto del módulo es el alto interior (2.164 mm)', () => {
    expect(specs[1]?.label).toBe('2.164 mm');
    const height = specs[1]!;
    expect(height.to.y - height.from.y).toBeCloseTo(2.164, 5);
  });

  it('las líneas se colocan alrededor del módulo, no del mueble', () => {
    const width = specs[0];
    // El módulo 2 empieza tras el módulo 1 (776 mm) y una
    // división (18 mm): x ≈ 0,812 m.
    expect(width?.from.x).toBeGreaterThan(0.7);
    expect(width?.from.x).toBeLessThan(0.9);
    // La línea de ancho va bajo el suelo (y < 0).
    expect(width?.from.y).toBe(-0.06);
    expect(width?.to.y).toBe(-0.06);
  });

  it('una cajonera mide su apertura, no su caja (776 mm)', () => {
    const drawers = geometry.wardrobe.modules[2]!;
    const specs = computeModuleDimensions(geometry, drawers, 'mm');
    expect(specs[0]?.label).toBe('776 mm');
    expect(specs[1]?.label).toBe('2.164 mm');
  });

  it('las hojas de puerta no inflan ni alteran la cota', () => {
    // Con puertas, la hoja es más ancha que la apertura
    // (monta sobre el frente): la cota debe medir lo mismo
    // con o sin puertas configuradas.
    const dry = computeModuleDimensions(
      geometry,
      geometry.wardrobe.modules[1]!,
      'mm',
    );
    const wet = computeModuleDimensions(
      withDoors,
      withDoors.wardrobe.modules[1]!,
      'mm',
    );
    expect(wet[0]?.label).toBe('776 mm');
    expect(wet).toEqual(dry);
  });
  it('un módulo con ancho fijado mide su apertura fijada', () => {
    const config = setModuleWidth(structuredClone(DEFAULT_CONFIG), 0, 900);
    const custom = calculateGeometry(config);
    const specs = computeModuleDimensions(
      custom,
      custom.wardrobe.modules[0]!,
      'mm',
    );
    expect(specs[0]?.label).toBe('900 mm');
    const width = specs[0]!;
    expect(width.to.x - width.from.x).toBeCloseTo(0.9, 5);
  });
});

describe('computeDimensionSpecs (selección y casos límite)', () => {
  it('sin selección muestra las cotas generales', () => {
    const specs = computeDimensionSpecs(geometry, null, 'mm');
    expect(specs.map((spec) => spec.id)).toEqual([
      'global-width',
      'global-height',
      'global-depth',
    ]);
  });

  it('con selección muestra las cotas contextuales', () => {
    const specs = computeDimensionSpecs(geometry, 'module-2', 'mm');
    expect(specs.map((spec) => spec.id)).toEqual([
      'module-width',
      'module-height',
    ]);
  });

  it('sin geometría (configuración inválida) no hay cotas', () => {
    expect(computeDimensionSpecs(null, null, 'mm')).toEqual([]);
    expect(computeDimensionSpecs(null, 'module-2', 'mm')).toEqual([]);
  });

  it('un id desconocido vuelve a las cotas generales', () => {
    const specs = computeDimensionSpecs(geometry, 'module-9', 'mm');
    expect(specs[0]?.id).toBe('global-width');
  });

  it('no muta la geometría de entrada', () => {
    const frozen = deepFreeze(calculateGeometry(DEFAULT_CONFIG));
    computeGlobalDimensions(frozen, 'mm');
    computeModuleDimensions(frozen, frozen.wardrobe.modules[0]!, 'cm');
    computeDimensionSpecs(frozen, 'module-1', 'mm');
    // Si algo se hubiera mutado, el deepFreeze lo habría
    // lanzado; además el objeto sigue intacto:
    expect(frozen.wardrobe.widthMm).toBe(2400);
  });

  it('es determinista: misma entrada, misma salida', () => {
    const a: DimensionSpec[] = computeDimensionSpecs(geometry, 'module-2', 'cm');
    const b: DimensionSpec[] = computeDimensionSpecs(geometry, 'module-2', 'cm');
    expect(a).toEqual(b);
  });
});
