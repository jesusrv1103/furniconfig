import { describe, expect, it } from 'vitest';
import {
  calculateGeometry,
  distributeModules,
  maxFixedWidthMm,
  validateWardrobeConfig,
  WARDROBE_LIMITS,
  type WardrobeConfig,
} from '../src/index.js';
import { ConfigValidationError } from '../src/engine/geometry.js';
import { GeometryError } from '../src/errors.js';

const T18 = 18;

function errorOf(fn: () => unknown): GeometryError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GeometryError);
    return error as GeometryError;
  }
  throw new Error('Se esperaba que la función lanzara un GeometryError');
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

/** Configuración válida de referencia: 3 módulos, 2.400 mm. */
const BASE_CONFIG: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'hanging' },
    { kind: 'drawers', drawers: 3 },
  ],
  materials: {
    structure: { name: 'Melamina', thicknessMm: 18, finish: 'blanco' },
    interior: { name: 'Melamina', thicknessMm: 18, finish: 'natural' },
  },
};

// 2400 − 2·18 (laterales) − 2·18 (divisiones) = 2328 mm
// disponibles; en uniforme: 776 mm por módulo.
const BASE_AVAILABLE_MM = 2328;

describe('distributeModules con anchos declarados (Fase 3D)', () => {
  describe('compatibilidad con la distribución uniforme', () => {
    it('sin declaraciones conserva el reparto histórico exacto', () => {
      const d = distributeModules({
        totalWidthMm: 3000,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
      });
      expect(d.moduleWidthsMm).toEqual([976, 976, 976]);
    });

    it('con la lista completa de undefined es idéntico al uniforme', () => {
      const uniform = distributeModules({
        totalWidthMm: 3001,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
      });
      const explicit = distributeModules({
        totalWidthMm: 3001,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
        declaredWidthsMm: [undefined, undefined, undefined],
      });
      expect(explicit.moduleWidthsMm).toEqual(uniform.moduleWidthsMm);
    });
  });

  describe('anchos declarados', () => {
    it('respeta los anchos declarados cuando la suma es exacta', () => {
      const d = distributeModules({
        totalWidthMm: 3000,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
        declaredWidthsMm: [1000, 900, 1028],
      });
      expect(d.moduleWidthsMm).toEqual([1000, 900, 1028]);
    });

    it('rechaza la suma incorrecta con ERR_MODULE_WIDTH_SUM', () => {
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 3000,
          moduleCount: 3,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          declaredWidthsMm: [1000, 900, 1000],
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_SUM');
      expect(error.details.declaredSumMm).toBe(2900);
      expect(error.details.availableWidthMm).toBe(2928);
      expect(error.details.differenceMm).toBe(-28);
    });

    it('los módulos automáticos reparten el sobrante por igual', () => {
      const d = distributeModules({
        totalWidthMm: 3000,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
        declaredWidthsMm: [1000, undefined, undefined],
      });
      expect(d.moduleWidthsMm).toEqual([1000, 964, 964]);
    });

    it('el sobrante reparte el residuo de izquierda a derecha', () => {
      // 3001 → disponibles 2929; 2929 − 1000 = 1929
      // entre 2 automáticos: 965 y 964.
      const d = distributeModules({
        totalWidthMm: 3001,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
        declaredWidthsMm: [1000, undefined, undefined],
      });
      expect(d.moduleWidthsMm).toEqual([1000, 965, 964]);
    });

    it('mantiene varios anchos fijados y reparte el resto', () => {
      const d = distributeModules({
        totalWidthMm: 3000,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
        declaredWidthsMm: [800, undefined, 900],
      });
      expect(d.moduleWidthsMm).toEqual([800, 1228, 900]);
    });
  });

  describe('validación de anchos declarados', () => {
    it('rechaza un ancho no entero', () => {
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 3000,
          moduleCount: 2,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          declaredWidthsMm: [1450.5, undefined],
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_INVALID');
    });

    it('rechaza un ancho por debajo del mínimo provisional', () => {
      const min = WARDROBE_LIMITS.moduleWidthMm.min;
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 3000,
          moduleCount: 2,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          declaredWidthsMm: [min - 1, undefined],
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_INVALID');
    });

    it('rechaza un ancho por encima del máximo provisional', () => {
      const max = WARDROBE_LIMITS.moduleWidthMm.max;
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 4000,
          moduleCount: 1,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          declaredWidthsMm: [max + 1],
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_INVALID');
    });

    it('rechaza una lista de anchos con longitud distinta al conteo', () => {
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 3000,
          moduleCount: 3,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          declaredWidthsMm: [1000, 1000],
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_INVALID');
    });

    it('rechaza un sobrante insuficiente para los automáticos', () => {
      // 1000 − 2·18 − 2·18 = 928 disponibles; con 800
      // fijados quedan 128 mm para 2 automáticos (600 mm).
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 1000,
          moduleCount: 3,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          declaredWidthsMm: [800, undefined, undefined],
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_TOO_SMALL');
      expect(error.details.leftoverWidthMm).toBe(128);
    });
  });

  describe('propiedades del algoritmo', () => {
    const inputs = [
      {
        totalWidthMm: 2400,
        moduleCount: 3,
        sideThicknessMm: 18,
        dividerThicknessMm: 18,
      },
      {
        totalWidthMm: 2400,
        moduleCount: 3,
        sideThicknessMm: 18,
        dividerThicknessMm: 18,
        declaredWidthsMm: [900, undefined, undefined] as (
          | number
          | undefined
        )[],
      },
      {
        totalWidthMm: 2401,
        moduleCount: 4,
        sideThicknessMm: 15,
        dividerThicknessMm: 15,
        declaredWidthsMm: [600, undefined, 700, undefined] as (
          | number
          | undefined
        )[],
      },
    ];

    it('conserva exactamente el ancho exterior en todos los caminos', () => {
      for (const input of inputs) {
        const d = distributeModules(input);
        const sum =
          d.moduleWidthsMm.reduce((total, width) => total + width, 0) +
          d.dividerTotalMm +
          2 * input.sideThicknessMm;
        expect(sum).toBe(input.totalWidthMm);
      }
    });

    it('es determinista: la misma entrada produce la misma salida', () => {
      for (const input of inputs) {
        const first = distributeModules(input);
        const second = distributeModules(input);
        expect(second.moduleWidthsMm).toEqual(first.moduleWidthsMm);
      }
    });

    it('no muta la entrada (lista de anchos congelada)', () => {
      const declared = deepFreeze([900, undefined, undefined]);
      const d = distributeModules({
        totalWidthMm: 2400,
        moduleCount: 3,
        sideThicknessMm: 18,
        dividerThicknessMm: 18,
        declaredWidthsMm: declared,
      });
      expect(d.moduleWidthsMm[0]).toBe(900);
      expect(d.moduleWidthsMm).not.toBe(declared);
    });
  });
});

describe('maxFixedWidthMm (Fase 3D)', () => {
  it('sin declaraciones deja el mínimo a los demás módulos', () => {
    const min = WARDROBE_LIMITS.moduleWidthMm.min;
    const max = maxFixedWidthMm({
      totalWidthMm: 2400,
      moduleCount: 3,
      sideThicknessMm: 18,
      dividerThicknessMm: 18,
      targetIndex: 0,
    });
    // 2328 − 2·300 = 1728 (< máximo provisional 2000).
    expect(max).toBe(BASE_AVAILABLE_MM - 2 * min);
  });

  it('acota por el máximo provisional cuando el espacio lo permite', () => {
    const max = maxFixedWidthMm({
      totalWidthMm: 4000,
      moduleCount: 1,
      sideThicknessMm: 18,
      dividerThicknessMm: 18,
      targetIndex: 0,
    });
    expect(max).toBe(WARDROBE_LIMITS.moduleWidthMm.max);
  });

  it('descuenta lo declarado por los demás módulos', () => {
    const max = maxFixedWidthMm({
      totalWidthMm: 3000,
      moduleCount: 3,
      sideThicknessMm: 18,
      dividerThicknessMm: 18,
      declaredWidthsMm: [800, 900, undefined],
      targetIndex: 2,
    });
    // 2928 − 800 − 900 = 1228.
    expect(max).toBe(1228);
  });

  it('devuelve 0 para un índice fuera de rango', () => {
    const max = maxFixedWidthMm({
      totalWidthMm: 2400,
      moduleCount: 3,
      sideThicknessMm: 18,
      dividerThicknessMm: 18,
      targetIndex: 3,
    });
    expect(max).toBe(0);
  });
});

describe('calculateGeometry con anchos individuales', () => {
  it('los anchos declarados llegan a los módulos resueltos', () => {
    const geometry = calculateGeometry({
      ...BASE_CONFIG,
      modules: [
        { kind: 'shelves', shelves: 3, widthMm: 1000 },
        { kind: 'hanging' },
        { kind: 'drawers', drawers: 3 },
      ],
    });
    const widths = geometry.wardrobe.modules.map((m) => m.widthMm);
    expect(widths).toEqual([1000, 664, 664]);
    // Conservación exacta: 1000 + 664 + 664 + 2·18 + 2·18 = 2400.
    const sum =
      widths.reduce((total, width) => total + width, 0) + 2 * T18 + 2 * T18;
    expect(sum).toBe(2400);
  });

  it('conserva los identificadores deterministas de los módulos', () => {
    const geometry = calculateGeometry({
      ...BASE_CONFIG,
      modules: [
        { kind: 'shelves', shelves: 3, widthMm: 900 },
        { kind: 'hanging' },
        { kind: 'drawers', drawers: 3, widthMm: 800 },
      ],
    });
    expect(geometry.wardrobe.modules.map((m) => m.id)).toEqual([
      'module-1',
      'module-2',
      'module-3',
    ]);
  });

  it('recalcula barras, cajones y puertas con anchos desiguales', () => {
    const declared = calculateGeometry({
      ...BASE_CONFIG,
      doors: { leaves: 1 },
      modules: [
        { kind: 'shelves', shelves: 3, widthMm: 1000 },
        { kind: 'hanging' },
        { kind: 'drawers', drawers: 3 },
      ],
    });
    const uniform = calculateGeometry({
      ...BASE_CONFIG,
      doors: { leaves: 1 },
    });

    // La barra del módulo 2 (automático: 664 mm) es más
    // corta que en el reparto uniforme (776 mm).
    const rod = declared.rods.find((r) => r.moduleId === 'module-2');
    const uniformRod = uniform.rods.find((r) => r.moduleId === 'module-2');
    expect(rod?.lengthMm).toBe(664);
    expect(uniformRod?.lengthMm).toBe(776);

    // La hoja del módulo 1 se ensancha con su módulo.
    const door = declared.doors.find((d) => d.moduleId === 'module-1');
    const uniformDoor = uniform.doors.find((d) => d.moduleId === 'module-1');
    expect(door?.widthMm).toBeGreaterThan(uniformDoor?.widthMm ?? 0);

    // Los cajones del módulo 3 (automático: 664 mm) son
    // más estrechos que en uniforme.
    const drawerParts = declared.panels.filter(
      (p) => p.role.startsWith('drawer-') && p.moduleId === 'module-3',
    );
    const uniformDrawerParts = uniform.panels.filter(
      (p) => p.role.startsWith('drawer-') && p.moduleId === 'module-3',
    );
    expect(drawerParts.length).toBeGreaterThan(0);
    expect(drawerParts.length).toBe(uniformDrawerParts.length);

    // El frente del cajón del módulo 3 se estrecha (664 < 776).
    const drawerFront = drawerParts.find((p) => p.role === 'drawer-front');
    const uniformDrawerFront = uniformDrawerParts.find(
      (p) => p.role === 'drawer-front',
    );
    expect(drawerFront?.sizeMm.x ?? 0).toBeLessThan(
      uniformDrawerFront?.sizeMm.x ?? Number.MAX_SAFE_INTEGER,
    );
  });

  it('lanza ConfigValidationError cuando los anchos declarados no suman', () => {
    try {
      calculateGeometry({
        ...BASE_CONFIG,
        modules: [
          { kind: 'shelves', shelves: 3, widthMm: 1000 },
          { kind: 'hanging', widthMm: 1000 },
          { kind: 'drawers', drawers: 3, widthMm: 1000 },
        ],
      });
      expect.unreachable('Debía lanzar por suma incorrecta');
    } catch (error) {
      expect(error).toBeInstanceOf(GeometryError);
      expect((error as GeometryError).code).toBe('ERR_MODULE_WIDTH_SUM');
    }
  });

  it('una configuración antigua sin anchos produce el reparto uniforme', () => {
    const geometry = calculateGeometry(BASE_CONFIG);
    expect(geometry.wardrobe.modules.map((m) => m.widthMm)).toEqual([
      776, 776, 776,
    ]);
  });

  it('es determinista y no muta la configuración', () => {
    const config = deepFreeze({
      ...BASE_CONFIG,
      modules: [
        { kind: 'shelves' as const, shelves: 3, widthMm: 1000 },
        { kind: 'hanging' as const },
        { kind: 'drawers' as const, drawers: 3 },
      ],
    });
    const first = calculateGeometry(config);
    const second = calculateGeometry(config);
    expect(second).toEqual(first);
  });
});

describe('validateWardrobeConfig con anchos individuales', () => {
  it('conserva el ancho declarado en la configuración validada', () => {
    const result = validateWardrobeConfig({
      ...BASE_CONFIG,
      modules: [
        { kind: 'shelves', shelves: 3, widthMm: 1000 },
        { kind: 'hanging' },
        { kind: 'drawers', drawers: 3 },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.modules[0]?.widthMm).toBe(1000);
    expect(result.config.modules[1]?.widthMm).toBeUndefined();
  });

  it('rechaza anchos no enteros o fuera de rango con ERR_MODULE_WIDTH_INVALID', () => {
    for (const widthMm of [100.5, 200, WARDROBE_LIMITS.moduleWidthMm.max + 1, '800']) {
      const result = validateWardrobeConfig({
        ...BASE_CONFIG,
        modules: [{ kind: 'shelves', shelves: 3, widthMm }],
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.errors[0]?.code).toBe('ERR_MODULE_WIDTH_INVALID');
    }
  });
});
