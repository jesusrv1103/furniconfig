import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROD_DIAMETER_MM,
  calculateGeometry,
  validateWardrobeConfig,
  type Wardrobe,
  type WardrobeConfig,
} from '../src/index.js';
import { buildRods } from '../src/engine/rods.js';
import { GeometryError } from '../src/errors.js';

const config: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'hanging' },
    { kind: 'drawers' },
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

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('buildRods y calculateGeometry — barras de colgado', () => {
  // 2400 mm, 3 módulos, 18 mm: útil 2364 − 36 (divisiones)
  // = 2328 → 776 mm por módulo.
  const result = calculateGeometry(config);

  it('genera una barra por módulo "hanging"', () => {
    expect(result.rods).toHaveLength(1);
    const rod = result.rods[0];
    expect(rod).toBeDefined();
    expect(rod?.moduleId).toBe('module-2');
    expect(rod?.id).toBe('rod-module-2');
  });

  it('longitud = ancho interior útil del módulo', () => {
    expect(result.rods[0]?.lengthMm).toBe(776);
    expect(result.wardrobe.modules[1]?.widthMm).toBe(776);
  });

  it('diámetro por defecto provisional (30 mm)', () => {
    expect(result.rods[0]?.diameterMm).toBe(DEFAULT_ROD_DIAMETER_MM);
    expect(result.wardrobe.hangingRodDiameterMm).toBe(30);
  });

  it('orientación en el eje X (horizontal)', () => {
    expect(result.rods[0]?.axis).toBe('x');
  });

  it('posición: esquina mínima del bbox, centrada en Z y a 100 mm del superior', () => {
    const rod = result.rods[0];
    expect(rod).toBeDefined();
    // Módulo 2 comienza en 18 + 776 + 18 = 812
    expect(rod?.positionMm.x).toBe(812);
    // Centro Y = 2200 − 18 − 100 = 2082; bbox Y = 2082 − 15
    expect(rod?.positionMm.y).toBe(2067);
    // Centro Z = 600 / 2 = 300; bbox Z = 300 − 15
    expect(rod?.positionMm.z).toBe(285);
  });

  it('material metálico resuelto con id estable', () => {
    expect(result.rods[0]?.materialId).toBe('material-rod');
    expect(result.wardrobe.materials.rod).toEqual({
      id: 'material-rod',
      name: 'Acero',
      finish: 'brillo',
    });
  });

  it('reporta totales de barras', () => {
    expect(result.totals.rodCount).toBe(1);
    expect(result.totals.rodLengthMm).toBe(776);
  });

  it('sin módulos "hanging" no hay barras ni material de barra', () => {
    const noHanging = calculateGeometry({
      ...config,
      modules: [
        { kind: 'shelves', shelves: 2 },
        { kind: 'drawers' },
      ],
    });
    expect(noHanging.rods).toEqual([]);
    expect(noHanging.wardrobe.materials.rod).toBeUndefined();
    expect(noHanging.wardrobe.hangingRodDiameterMm).toBeUndefined();
    expect(noHanging.totals.rodCount).toBe(0);
    expect(noHanging.totals.rodLengthMm).toBe(0);
  });

  it('dos módulos "hanging" generan dos barras con posiciones distintas', () => {
    const two = calculateGeometry({
      ...config,
      modules: [
        { kind: 'hanging' },
        { kind: 'hanging' },
        { kind: 'drawers' },
      ],
    });
    expect(two.rods).toHaveLength(2);
    expect(two.totals.rodLengthMm).toBe(2 * 776);
    const [first, second] = two.rods;
    expect(first?.positionMm.x).toBe(18);
    expect(second?.positionMm.x).toBe(18 + 776 + 18); // 812
    expect(first?.id).toBe('rod-module-1');
    expect(second?.id).toBe('rod-module-2');
  });
});

describe('configuración de barras', () => {
  it('diámetro y material configurables', () => {
    const result = calculateGeometry({
      ...config,
      hangingRod: { diameterMm: 25, name: 'Aluminio', finish: 'mate' },
    });
    expect(result.rods[0]?.diameterMm).toBe(25);
    expect(result.wardrobe.materials.rod?.name).toBe('Aluminio');
    expect(result.wardrobe.materials.rod?.finish).toBe('mate');
    // Centro Y = 2082; bbox Y = 2082 − 12.5
    expect(result.rods[0]?.positionMm.y).toBe(2069.5);
  });

  it('objeto de configuración vacío usa todos los defaults', () => {
    const result = calculateGeometry({ ...config, hangingRod: {} });
    expect(result.rods[0]?.diameterMm).toBe(DEFAULT_ROD_DIAMETER_MM);
    expect(result.wardrobe.materials.rod?.name).toBe('Acero');
  });

  it('configuración v1 sin "hangingRod" sigue siendo válida (compatibilidad)', () => {
    const result = validateWardrobeConfig(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Sin spec: el motor aplica defaults al resolver.
    const geometry = calculateGeometry(result.config);
    expect(geometry.rods[0]?.diameterMm).toBe(DEFAULT_ROD_DIAMETER_MM);
    expect(geometry.wardrobe.materials.rod?.name).toBe('Acero');
  });
});

describe('validaciones de barras', () => {
  it('rechaza diámetros fuera del rango provisional 18–60 mm', () => {
    for (const diameterMm of [17, 61, 0, -30, 2.5, '30', null]) {
      const result = validateWardrobeConfig({
        ...config,
        hangingRod: { diameterMm: diameterMm as number },
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) => error.code === 'ERR_HANGING_ROD_DIAMETER',
        ),
      ).toBe(true);
    }
  });

  it('rechaza "hangingRod" que no es objeto', () => {
    const result = validateWardrobeConfig({
      ...config,
      hangingRod: 'grueso',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(
      result.errors.some(
        (error) =>
          error.code === 'ERR_HANGING_ROD_DIAMETER' &&
          error.field === 'hangingRod',
      ),
    ).toBe(true);
  });

  it('rechaza nombre o acabado vacíos en la barra', () => {
    for (const hangingRod of [{ name: '' }, { finish: '  ' }]) {
      const result = validateWardrobeConfig({
        ...config,
        hangingRod,
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) =>
            error.code === 'ERR_INVALID_MATERIAL' &&
            error.field.startsWith('hangingRod.'),
        ),
      ).toBe(true);
    }
  });

  it('calculateGeometry lanza ConfigValidationError ante diámetro inválido', () => {
    const error = errorOf(() =>
      calculateGeometry({
        ...config,
        hangingRod: { diameterMm: 90 },
      }),
    );
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_INVALID_CONFIG');
  });

  it('rechaza barras que no caben en la altura del módulo (compatibilidad)', () => {
    const tinyWardrobe: Wardrobe = {
      widthMm: 1000,
      heightMm: 100,
      depthMm: 500,
      modules: [
        {
          id: 'module-1',
          kind: 'hanging',
          widthMm: 964,
          heightMm: 64,
          depthMm: 500,
        },
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
        rod: { id: 'material-rod', name: 'Acero', finish: 'brillo' },
      },
      hangingRodDiameterMm: 30,
    };
    const error = errorOf(() => buildRods(tinyWardrobe));
    expect(error).toBeInstanceOf(GeometryError);
    const geometryError = error as GeometryError;
    expect(geometryError.code).toBe('ERR_HANGING_ROD_HEIGHT');
    expect(geometryError.details.innerHeightMm).toBe(64);
    expect(geometryError.details.diameterMm).toBe(30);
  });
});

describe('determinismo, inmutabilidad y regresiones', () => {
  it('es determinista: dos ejecuciones producen el mismo resultado', () => {
    expect(JSON.stringify(calculateGeometry(config))).toBe(
      JSON.stringify(calculateGeometry(config)),
    );
  });

  it('no muta la configuración (congelada)', () => {
    const frozen = deepFreeze(structuredClone(config));
    expect(() => calculateGeometry(frozen)).not.toThrow();
    expect(frozen.modules).toHaveLength(3);
    expect(frozen.hangingRod).toBeUndefined();
  });

  it('no muta la configuración con spec de barra (congelada)', () => {
    const frozen = deepFreeze(
      structuredClone({
        ...config,
        hangingRod: { diameterMm: 28, name: 'Cromo', finish: 'brillo' },
      }),
    );
    expect(() => calculateGeometry(frozen)).not.toThrow();
    expect(frozen.hangingRod?.diameterMm).toBe(28);
    expect(frozen.hangingRod?.name).toBe('Cromo');
  });

  it('regresión: los paneles no cambian con la adición de barras', () => {
    const withoutRodSpec = calculateGeometry(config);
    const withRodSpec = calculateGeometry({
      ...config,
      hangingRod: { diameterMm: 40, name: 'Latón', finish: 'mate' },
    });
    expect(withRodSpec.panels).toEqual(withoutRodSpec.panels);
    expect(withRodSpec.totals.panelCount).toBe(
      withoutRodSpec.totals.panelCount,
    );
    expect(withRodSpec.totals.panelVolumeMm3).toBe(
      withoutRodSpec.totals.panelVolumeMm3,
    );
  });

  it('regresión: la barra no es un panel (sin paneles interiores en colgado)', () => {
    const result = calculateGeometry(config);
    const hangingPanels = result.panels.filter(
      (panel) => panel.moduleId === 'module-2',
    );
    expect(hangingPanels).toHaveLength(0);
    // La barra vive en rods, no en panels.
    expect(
      result.panels.some((panel) => panel.id.startsWith('rod-')),
    ).toBe(false);
  });
});
