import { describe, expect, it } from 'vitest';
import {
  WARDROBE_LIMITS,
  calculateGeometry,
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  DEFAULT_CONFIG,
  equalizeModuleWidths,
  fixSelectedRedistributeOthers,
  releaseModuleWidth,
  setDimension,
  setModuleCount,
  setModuleKind,
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

function widthsOf(config: WardrobeConfig): number[] {
  return calculateGeometry(config).wardrobe.modules.map((m) => m.widthMm);
}

/** Configuración con un ancho fijado en el módulo 1. */
const FIXED_900 = setModuleWidth(DEFAULT_CONFIG, 0, 900);

describe('setModuleWidth (helpers web, Fase 3D)', () => {
  it('fija el ancho del módulo y el resto reparte el sobrante', () => {
    expect(FIXED_900.modules[0]?.widthMm).toBe(900);
    // 2.328 − 900 = 1.428 entre 2 automáticos: 714 mm.
    expect(widthsOf(FIXED_900)).toEqual([900, 714, 714]);
  });

  it('acota al máximo disponible (deja el mínimo a los demás)', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 5000);
    // 2.328 − 2·300 = 1.728 mm.
    expect(config.modules[0]?.widthMm).toBe(1728);
    expect(widthsOf(config)).toEqual([1728, 300, 300]);
  });

  it('acota al mínimo provisional', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 1, 100);
    expect(config.modules[1]?.widthMm).toBe(
      WARDROBE_LIMITS.moduleWidthMm.min,
    );
  });

  it('sin cambios devuelve la MISMA referencia (sin paso de historial)', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 900);
    expect(setModuleWidth(config, 0, 900)).toBe(config);
  });

  it('devuelve la entrada sin tocar si el índice no existe', () => {
    expect(setModuleWidth(DEFAULT_CONFIG, 9, 900)).toBe(DEFAULT_CONFIG);
  });

  it('no muta la entrada', () => {
    const frozen = deepFreeze({
      ...DEFAULT_CONFIG,
      modules: DEFAULT_CONFIG.modules.map((m) => ({ ...m })),
    });
    const config = setModuleWidth(frozen, 0, 1200);
    expect(config.modules[0]?.widthMm).toBe(1200);
    expect(frozen.modules[0]?.widthMm).toBeUndefined();
  });
});

describe('releaseModuleWidth / equalizeModuleWidths', () => {
  it('liberar devuelve el módulo a reparto automático', () => {
    const released = releaseModuleWidth(FIXED_900, 0);
    expect(released.modules[0]?.widthMm).toBeUndefined();
    expect(widthsOf(released)).toEqual([776, 776, 776]);
  });

  it('igualar libera todos los anchos fijados', () => {
    const config = setModuleWidth(FIXED_900, 2, 500);
    const equalized = equalizeModuleWidths(config);
    expect(
      equalized.modules.every((m) => m.widthMm === undefined),
    ).toBe(true);
    expect(widthsOf(equalized)).toEqual([776, 776, 776]);
  });

  it('igualar sin fijados es un no-op (misma referencia)', () => {
    expect(equalizeModuleWidths(DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG);
    expect(releaseModuleWidth(DEFAULT_CONFIG, 0)).toBe(DEFAULT_CONFIG);
  });
});

describe('fixSelectedRedistributeOthers ("Repartir espacio restante")', () => {
  it('conserva el seleccionado y reparte el resto por igual', () => {
    // Fija el 1 en su ancho actual (776) y libera los demás.
    const config = fixSelectedRedistributeOthers(DEFAULT_CONFIG, 0, 776);
    expect(config.modules[0]?.widthMm).toBe(776);
    expect(widthsOf(config)).toEqual([776, 776, 776]);
  });

  it('libera fijados de otros módulos', () => {
    const twoFixed = setModuleWidth(FIXED_900, 2, 500);
    const config = fixSelectedRedistributeOthers(twoFixed, 2, 500);
    // El módulo 2 conserva 500 mm; los demás (incluido el 1,
    // que estaba fijado a 900) quedan automáticos:
    // 2.328 − 500 = 1.828 entre 2: 914 mm.
    expect(config.modules[0]?.widthMm).toBeUndefined();
    expect(config.modules[1]?.widthMm).toBeUndefined();
    expect(config.modules[2]?.widthMm).toBe(500);
    expect(widthsOf(config)).toEqual([914, 914, 500]);
  });

  it('sin cambios devuelve la misma referencia', () => {
    const config = fixSelectedRedistributeOthers(DEFAULT_CONFIG, 0, 776);
    expect(fixSelectedRedistributeOthers(config, 0, 776)).toBe(config);
  });

  it('rechaza fijar un ancho que supera el máximo provisional', () => {
    // Clóset de un solo módulo de 4.000 mm: ancho interior
    // 3.964 mm > máximo provisional 2.000 mm.
    const wide: WardrobeConfig = {
      ...DEFAULT_CONFIG,
      dimensions: { ...DEFAULT_CONFIG.dimensions, widthMm: 4000 },
      modules: [{ kind: 'hanging' }],
    };
    expect(fixSelectedRedistributeOthers(wide, 0, 3964)).toBe(wide);
  });
});

describe('conservación de anchos ante otros cambios', () => {
  it('ensanchar el mueble mantiene los fijados y absorbe el resto', () => {
    const wider = setDimension(FIXED_900, 'widthMm', 3000);
    // 3.000 − 72 = 2.928; 2.928 − 900 = 2.028 entre 2: 1.014.
    expect(wider.modules[0]?.widthMm).toBe(900);
    expect(widthsOf(wider)).toEqual([900, 1014, 1014]);
  });

  it('estrechar sin quepa los fijados vuelve a reparto uniforme', () => {
    // Con los 3 módulos fijados, estrechar rompe la suma:
    // la configuración no debe quedar inválida.
    const allFixed = setModuleWidth(
      setModuleWidth(FIXED_900, 1, 800),
      2,
      628,
    );
    expect(widthsOf(allFixed)).toEqual([900, 800, 628]);
    const narrower = setDimension(allFixed, 'widthMm', 2000);
    expect(narrower.modules.some((m) => m.widthMm !== undefined)).toBe(
      false,
    );
    // 2.000 − 72 = 1.928; residuo 1 mm izq→der: [643, 643, 642].
    expect(widthsOf(narrower)).toEqual([643, 643, 642]);
  });

  it('cambiar el conteo de módulos conserva lo que encaja', () => {
    // 2 módulos: 2.400 − 36 − 18 = 2.346; con el 1 fijado
    // a 900, el automático toma 1.446.
    const two = setModuleCount(DEFAULT_CONFIG, 2);
    const fixed = setModuleWidth(two, 0, 900);
    expect(widthsOf(fixed)).toEqual([900, 1446]);
    // Volver a 3 módulos: el fijado sigue encajando.
    const three = setModuleCount(fixed, 3);
    expect(three.modules[0]?.widthMm).toBe(900);
    expect(widthsOf(three)).toEqual([900, 714, 714]);
  });

  it('cambiar el conteo libera si ya no encaja', () => {
    const four = setModuleCount(
      setModuleWidth(setModuleCount(DEFAULT_CONFIG, 2), 0, 1600),
      4,
    );
    expect(four.modules.some((m) => m.widthMm !== undefined)).toBe(false);
    // 2.400 − 36 − 54 = 2.310; residuo 1 mm izq→der.
    expect(widthsOf(four)).toEqual([578, 578, 577, 577]);
  });

  it('cambiar el tipo de módulo conserva el ancho fijado', () => {
    const changed = setModuleKind(FIXED_900, 0, 'hanging');
    expect(changed.modules[0]?.widthMm).toBe(900);
    expect(widthsOf(changed)).toEqual([900, 714, 714]);
  });

  it('todo helper produce una configuración válida para el validador', () => {
    for (const config of [
      FIXED_900,
      equalizeModuleWidths(FIXED_900),
      releaseModuleWidth(FIXED_900, 0),
      setDimension(FIXED_900, 'widthMm', 3000),
      setModuleCount(FIXED_900, 4),
    ]) {
      expect(validateWardrobeConfig(config).ok).toBe(true);
    }
  });
});
