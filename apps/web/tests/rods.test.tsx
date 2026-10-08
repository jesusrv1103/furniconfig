import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  DEFAULT_ROD_DIAMETER_MM,
  calculateGeometry,
  type HangingRod,
} from '@furniconfig/geometry-core';
import {
  rodBoundingBox,
  toRenderableRod,
  toRenderableRods,
} from '../src/lib/panels-to-mesh.js';
import { deriveGeometryState } from '../src/lib/derive.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ROD_DIAMETER_MM as UI_DEFAULT_ROD_DIAMETER,
  clearHangingRod,
  setDimension,
  setHangingRodDiameter,
  setHangingRodMaterial,
  setModuleCount,
  setModuleKind,
} from '../src/lib/config.js';
import { App } from '../src/App.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

// Barra del segundo módulo de DEFAULT_CONFIG:
// módulo en x=812, ancho 776, diámetro 30,
// centro Y 2082, centro Z 300.
const rod: HangingRod = {
  id: 'rod-module-2',
  moduleId: 'module-2',
  axis: 'x',
  lengthMm: 776,
  diameterMm: 30,
  positionMm: { x: 812, y: 2067, z: 285 },
  materialId: 'material-rod',
};

describe('rodBoundingBox (orientación)', () => {
  it('eje X: envolvente (largo, diámetro, diámetro)', () => {
    expect(rodBoundingBox('x', 776, 30)).toEqual([776, 30, 30]);
  });

  it('eje Y: envolvente (diámetro, largo, diámetro)', () => {
    expect(rodBoundingBox('y', 776, 30)).toEqual([30, 776, 30]);
  });

  it('eje Z: envolvente (diámetro, diámetro, largo)', () => {
    expect(rodBoundingBox('z', 776, 30)).toEqual([30, 30, 776]);
  });
});

describe('toRenderableRod (unidades y centro)', () => {
  it('convierte longitud y diámetro de mm a metros', () => {
    const renderable = toRenderableRod(rod);
    expect(renderable.lengthM).toBeCloseTo(0.776, 10);
    expect(renderable.diameterM).toBeCloseTo(0.03, 10);
  });

  it('calcula el centro del cilindro en metros', () => {
    const renderable = toRenderableRod(rod);
    // Esquina mínima (812, 2067, 285) mm → metros,
    // más mitad del envolvente (388, 15, 15) mm.
    expect(renderable.centerM[0]).toBeCloseTo(1.2, 10);
    expect(renderable.centerM[1]).toBeCloseTo(2.082, 10);
    expect(renderable.centerM[2]).toBeCloseTo(0.3, 10);
  });

  it('conserva eje, ids y materialId', () => {
    const renderable = toRenderableRod(rod);
    expect(renderable.id).toBe('rod-module-2');
    expect(renderable.moduleId).toBe('module-2');
    expect(renderable.axis).toBe('x');
    expect(renderable.materialId).toBe('material-rod');
  });

  it('es determinista', () => {
    expect(toRenderableRod(rod)).toEqual(toRenderableRod(rod));
  });

  it('no muta la barra (congelada)', () => {
    const frozen = deepFreeze(structuredClone(rod));
    expect(() => toRenderableRod(frozen)).not.toThrow();
    expect(frozen.lengthMm).toBe(776);
    expect(frozen.diameterMm).toBe(30);
  });

  it('lista vacía de barras', () => {
    expect(toRenderableRods([])).toEqual([]);
  });
});

describe('deriveGeometryState (configuraciones válidas e inválidas)', () => {
  it('configuración por defecto genera una barra con métricas correctas', () => {
    const state = deriveGeometryState(DEFAULT_CONFIG);
    expect(state.validation.ok).toBe(true);
    expect(state.geometryError).toBeNull();
    expect(state.geometry?.rods).toHaveLength(1);
    expect(state.geometry?.rods[0]?.lengthMm).toBe(776);
    expect(state.geometry?.rods[0]?.diameterMm).toBe(
      DEFAULT_ROD_DIAMETER_MM,
    );
    expect(state.geometry?.totals.rodCount).toBe(1);
    expect(state.geometry?.totals.rodLengthMm).toBe(776);
  });

  it('sin módulos colgados: rods vacío y totales en cero', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 1, 'drawers');
    const state = deriveGeometryState(config);
    expect(state.validation.ok).toBe(true);
    expect(state.geometry?.rods).toEqual([]);
    expect(state.geometry?.totals.rodCount).toBe(0);
    expect(state.geometry?.totals.rodLengthMm).toBe(0);
  });

  it('errores de forma: validación falla, sin GeometryError', () => {
    const state = deriveGeometryState(
      setDimension(DEFAULT_CONFIG, 'widthMm', -1),
    );
    expect(state.validation.ok).toBe(false);
    expect(state.geometry).toBeNull();
    expect(state.geometryError).toBeNull();
  });

  it('diámetro de barra inválido: error de forma del contrato', () => {
    const state = deriveGeometryState({
      ...DEFAULT_CONFIG,
      hangingRod: { diameterMm: 90 },
    });
    expect(state.validation.ok).toBe(false);
    if (state.validation.ok) return;
    expect(
      state.validation.errors.some(
        (error) => error.code === 'ERR_HANGING_ROD_DIAMETER',
      ),
    ).toBe(true);
  });

  it('errores geométricos: GeometryError capturado, no lanzado', () => {
    // 800 mm no alcanzan para 4 módulos: la validación
    // de forma pasa, pero el cálculo geométrico falla.
    const narrow = setModuleCount(
      setDimension(DEFAULT_CONFIG, 'widthMm', 800),
      4,
    );
    const state = deriveGeometryState(narrow);
    expect(state.validation.ok).toBe(true);
    expect(state.geometry).toBeNull();
    expect(state.geometryError?.code).toBe(
      'ERR_MODULE_WIDTH_TOO_SMALL',
    );
  });

  it('cambios rápidos de configuración: la secuencia converge a un estado coherente', () => {
    let config = DEFAULT_CONFIG;
    // Simula edición rápida del usuario: 25 cambios
    // alternando dimensiones, módulos y barra.
    for (let step = 0; step < 25; step++) {
      config = setDimension(config, 'widthMm', 1600 + step * 40);
      config = setDimension(
        config,
        'heightMm',
        2000 + (step % 5) * 50,
      );
      config = setModuleCount(config, 1 + (step % 4));
      config = setModuleKind(
        config,
        0,
        step % 2 === 0 ? 'shelves' : 'hanging',
      );
      config = setHangingRodDiameter(config, 20 + (step % 11) * 2);
      config = setHangingRodMaterial(config, 'Acero', 'mate');
    }

    const state = deriveGeometryState(config);
    expect(state.validation.ok).toBe(true);
    if (!state.validation.ok || !state.geometry) return;
    // Variable local con tipo estrechado: el narrowing
    // de propiedades no se preserva dentro de closures.
    const geometry = state.geometry;

    // Invariantes tras la secuencia:
    const hangingCount = config.modules.filter(
      (module) => module.kind === 'hanging',
    ).length;
    expect(geometry.wardrobe.modules).toHaveLength(
      config.modules.length,
    );
    expect(geometry.rods).toHaveLength(hangingCount);
    expect(geometry.totals.rodCount).toBe(hangingCount);
    // La longitud total de barras es la suma de los
    // anchos de los módulos colgados.
    const expectedRodLengthMm = geometry.wardrobe.modules
      .filter((module) => module.kind === 'hanging')
      .reduce((sum, module) => sum + module.widthMm, 0);
    expect(geometry.totals.rodLengthMm).toBe(
      expectedRodLengthMm,
    );

    // Los anchos horizontales (laterales + divisiones)
    // más los módulos siguen sumando el ancho total.
    const horizontalPanels = geometry.panels.filter(
      (panel) => panel.role === 'side' || panel.role === 'divider',
    );
    const totalWidth =
      horizontalPanels.reduce(
        (sum, panel) => sum + panel.sizeMm.x,
        0,
      ) +
      geometry.wardrobe.modules.reduce(
        (sum, module) => sum + module.widthMm,
        0,
      );
    expect(totalWidth).toBe(config.dimensions.widthMm);
  });
});

describe('helpers de configuración de barra (no mutación)', () => {
  it('setHangingRodDiameter crea el spec sin mutar', () => {
    const updated = setHangingRodDiameter(DEFAULT_CONFIG, 28);
    expect(updated.hangingRod?.diameterMm).toBe(28);
    expect(DEFAULT_CONFIG.hangingRod).toBeUndefined();
  });

  it('setHangingRodMaterial conserva el diámetro existente', () => {
    const withDiameter = setHangingRodDiameter(DEFAULT_CONFIG, 28);
    const updated = setHangingRodMaterial(
      withDiameter,
      'Cromo',
      'brillo',
    );
    expect(updated.hangingRod).toEqual({
      diameterMm: 28,
      name: 'Cromo',
      finish: 'brillo',
    });
  });

  it('clearHangingRod elimina el spec y vuelve a los defaults', () => {
    const withSpec = setHangingRodDiameter(DEFAULT_CONFIG, 28);
    const cleared = clearHangingRod(withSpec);
    expect(cleared.hangingRod).toBeUndefined();
    const state = deriveGeometryState(cleared);
    expect(state.geometry?.rods[0]?.diameterMm).toBe(
      UI_DEFAULT_ROD_DIAMETER,
    );
  });

  it('secuencia de cambios rápidos no muta la configuración congelada', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    let config = frozen;
    for (let step = 0; step < 10; step++) {
      config = setDimension(config, 'widthMm', 2000 + step * 100);
      config = setModuleCount(config, 1 + (step % 4));
      config = setHangingRodDiameter(config, 25 + step);
    }
    // El objeto original congelado no se alteró.
    expect(frozen.dimensions.widthMm).toBe(2400);
    expect(frozen.modules).toHaveLength(3);
    expect(frozen.hangingRod).toBeUndefined();
    // Y la secuencia converge a un estado válido.
    expect(deriveGeometryState(config).validation.ok).toBe(true);
  });
});

describe('renderizado de barras', () => {
  it('la interfaz muestra la sección de barra con módulos colgados', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Barra de colgado');
    expect(html).toContain('Diámetro');
    expect(html).toContain('Material');
  });

  it('la sección de barra no aparece sin módulos colgados', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 1, 'drawers');
    const html = renderToString(<App initialConfig={config} />);
    expect(html).not.toContain('Barra de colgado');
  });

  it('el resumen muestra la longitud de las barras', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Barras de colgado');
    expect(html).toContain('776 mm');
    expect(html).toContain('Longitud total de barras');
  });

  it('muestra el error de diámetro inválido', () => {
    const config = {
      ...DEFAULT_CONFIG,
      hangingRod: { diameterMm: 90 },
    };
    const html = renderToString(<App initialConfig={config} />);
    expect(html).toContain('hangingRod.diameterMm');
  });

  it('la geometría real coincide con la que renderiza la escena', () => {
    // Verifica que lo que muestra el resumen proviene del motor.
    const state = deriveGeometryState(DEFAULT_CONFIG);
    const geometry = state.geometry;
    expect(geometry).not.toBeNull();
    if (!geometry) return;
    const html = renderToString(<App />);
    for (const rodItem of geometry.rods) {
      expect(html).toContain(rodItem.id);
      expect(html.includes(`${rodItem.lengthMm} mm`)).toBe(true);
    }
  });

  it('no muta la configuración inicial al renderizar', () => {
    const initial = structuredClone(DEFAULT_CONFIG);
    const snapshot = JSON.stringify(initial);
    renderToString(<App initialConfig={initial} />);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});

describe('compatibilidad de contratos (web)', () => {
  it('calculateGeometry de un config v1 sin barra incluye rods vacíos cuando no hay colgado', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 1, 'shelves');
    const result = calculateGeometry(config);
    expect(result.rods).toEqual([]);
    expect(result.totals.rodCount).toBe(0);
  });
});
