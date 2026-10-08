import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  calculateGeometry,
  type GeometryResult,
  type Panel,
} from '@furniconfig/geometry-core';
import { toRenderablePanel } from '../src/lib/panels-to-mesh.js';
import { deriveGeometryState } from '../src/lib/derive.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_DRAWER_COUNT,
  clearHangingRod,
  setDimension,
  setMaterialFinish,
  setMaterialName,
  setMaterialThickness,
  setModuleCount,
  setModuleDrawers,
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

describe('helpers de configuración de cajones', () => {
  it('setModuleDrawers ajusta la cantidad sin mutar', () => {
    const updated = setModuleDrawers(DEFAULT_CONFIG, 2, 5);
    expect(updated.modules[2]).toEqual({
      kind: 'drawers',
      drawers: 5,
    });
    expect(DEFAULT_CONFIG.modules[2]).toEqual({ kind: 'drawers' });
  });

  it('setModuleDrawers limita al rango provisional 1–8', () => {
    expect(
      setModuleDrawers(DEFAULT_CONFIG, 2, 20).modules[2],
    ).toEqual({ kind: 'drawers', drawers: 8 });
    expect(
      setModuleDrawers(DEFAULT_CONFIG, 2, 0).modules[2],
    ).toEqual({ kind: 'drawers', drawers: 1 });
    expect(
      setModuleDrawers(DEFAULT_CONFIG, 2, 2.6).modules[2],
    ).toEqual({ kind: 'drawers', drawers: 3 });
  });

  it('setModuleDrawers ignora índices que no son módulos de cajones', () => {
    const updated = setModuleDrawers(DEFAULT_CONFIG, 0, 5);
    expect(updated.modules[0]).toEqual({
      kind: 'shelves',
      shelves: 3,
    });
  });

  it('los helpers de material materializan el spec de cajón con defaults', () => {
    const named = setMaterialName(DEFAULT_CONFIG, 'drawer', 'Nogal');
    expect(named.materials.drawer).toEqual({
      name: 'Nogal',
      thicknessMm: 15,
      finish: 'mate',
    });
    const finished = setMaterialFinish(
      named,
      'drawer',
      'brillo',
    );
    expect(finished.materials.drawer?.finish).toBe('brillo');
    const thick = setMaterialThickness(
      finished,
      'drawer',
      18,
    );
    expect(thick.materials.drawer?.thicknessMm).toBe(18);
    // La configuración original no se alteró.
    expect(DEFAULT_CONFIG.materials.drawer).toBeUndefined();
  });
});

describe('deriveGeometryState — cajoneras', () => {
  it('la configuración por defecto genera 3 cajones de 5 piezas', () => {
    const state = deriveGeometryState(DEFAULT_CONFIG);
    expect(state.validation.ok).toBe(true);
    expect(state.geometryError).toBeNull();
    const geometry = state.geometry;
    expect(geometry).not.toBeNull();
    if (!geometry) {
      return;
    }
    expect(geometry.drawers).toHaveLength(3);
    expect(geometry.totals.drawerCount).toBe(3);
    expect(geometry.totals.drawerPartCount).toBe(15);
    // 5 piezas por cajón: frente, 2 laterales,
    // trasera, fondo.
    for (const drawer of geometry.drawers) {
      expect(drawer.partIds).toHaveLength(5);
      for (const partId of drawer.partIds) {
        expect(
          geometry.panels.some((panel) => panel.id === partId),
        ).toBe(true);
      }
    }
    expect(
      geometry.panels.filter((panel) =>
        panel.role.startsWith('drawer-'),
      ),
    ).toHaveLength(15);
  });

  it('cambiar la cantidad de cajones recalcula todo', () => {
    const config = setModuleDrawers(DEFAULT_CONFIG, 2, 5);
    const state = deriveGeometryState(config);
    const geometry = state.geometry;
    expect(geometry?.drawers).toHaveLength(5);
    expect(geometry?.totals.drawerPartCount).toBe(25);
    // Los paneles de cajón se incluyen en el total.
    if (geometry) {
      expect(geometry.totals.panelCount).toBe(
        9 + 25, // estructurales + cajones
      );
    }
  });

  it('sin módulos de cajones no hay ensamblajes ni piezas', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 2, 'shelves');
    const state = deriveGeometryState(config);
    expect(state.geometry?.drawers).toEqual([]);
    expect(state.geometry?.totals.drawerCount).toBe(0);
    expect(state.geometry?.totals.drawerPartCount).toBe(0);
  });

  it('compatibilidad: módulo "drawers" sin cantidad usa default 3', () => {
    // DEFAULT_CONFIG declara { kind: 'drawers' } sin
    // cantidad (contrato v1).
    const state = deriveGeometryState(DEFAULT_CONFIG);
    expect(state.geometry?.wardrobe.modules[2]?.drawers).toBe(
      DEFAULT_DRAWER_COUNT,
    );
  });

  it('cantidad de cajones inválida: error de forma del contrato', () => {
    const state = deriveGeometryState({
      ...DEFAULT_CONFIG,
      modules: [
        { kind: 'shelves', shelves: 3 },
        { kind: 'hanging' },
        { kind: 'drawers', drawers: 12 },
      ],
    });
    expect(state.validation.ok).toBe(false);
    if (state.validation.ok) {
      return;
    }
    expect(
      state.validation.errors.some(
        (error) => error.code === 'ERR_INVALID_DRAWER_COUNT',
      ),
    ).toBe(true);
    expect(state.geometry).toBeNull();
  });

  it('cambios rápidos de configuración: la secuencia converge a un estado coherente', () => {
    let config = DEFAULT_CONFIG;
    // Simula edición rápida: 25 cambios alternando
    // cajones, dimensiones y módulos.
    for (let step = 0; step < 25; step++) {
      config = setDimension(config, 'widthMm', 1600 + step * 40);
      config = setDimension(config, 'heightMm', 2000 + (step % 5) * 50);
      config = setModuleCount(config, 1 + (step % 4));
      config = setModuleKind(
        config,
        0,
        step % 2 === 0 ? 'shelves' : 'drawers',
      );
      config = setModuleDrawers(config, 0, 1 + (step % 8));
    }

    const state = deriveGeometryState(config);
    expect(state.validation.ok).toBe(true);
    const geometry = state.geometry;
    if (!geometry) {
      return;
    }
    // Invariantes tras la secuencia: cada módulo
    // de cajones genera ensamblajes coherentes.
    const drawerModules = geometry.wardrobe.modules.filter(
      (module) => module.kind === 'drawers',
    );
    const expectedDrawers = drawerModules.reduce(
      (sum, module) => sum + (module.drawers ?? DEFAULT_DRAWER_COUNT),
      0,
    );
    expect(geometry.drawers).toHaveLength(expectedDrawers);
    expect(geometry.totals.drawerPartCount).toBe(
      expectedDrawers * 5,
    );
    // Todo ensamblaje tiene 5 paneles reales.
    for (const drawer of geometry.drawers) {
      expect(drawer.partIds).toHaveLength(5);
    }
  });

  it('secuencia rápida no muta la configuración congelada', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    let config = frozen;
    for (let step = 0; step < 10; step++) {
      config = setModuleDrawers(config, 2, 1 + step);
      config = setDimension(config, 'widthMm', 2000 + step * 50);
    }
    expect(frozen.modules[2]).toEqual({ kind: 'drawers' });
    expect(frozen.dimensions.widthMm).toBe(2400);
    expect(deriveGeometryState(config).validation.ok).toBe(true);
  });
});

describe('conversión de unidades de paneles de cajón', () => {
  it('transforma un frente de cajón de mm a metros', () => {
    const geometry: GeometryResult | null =
      deriveGeometryState(DEFAULT_CONFIG).geometry;
    expect(geometry).not.toBeNull();
    if (!geometry) {
      return;
    }
    const front = geometry.panels.find(
      (panel) => panel.role === 'drawer-front',
    );
    expect(front).toBeDefined();
    if (!front) {
      return;
    }
    // Módulo 3: ancho interior 776 − 2×3 = 770 mm.
    expect(front.sizeMm.x).toBe(770);
    const renderable = toRenderablePanel(front as Panel);
    expect(renderable.sizeM[0]).toBeCloseTo(0.77, 10);
    expect(renderable.sizeM[1]).toBeCloseTo(0.719, 10);
    expect(renderable.sizeM[2]).toBeCloseTo(0.015, 10);
  });

  it('la posición del frente respeta el origen del motor', () => {
    const state = deriveGeometryState(DEFAULT_CONFIG);
    const geometry = state.geometry;
    if (!geometry) {
      return;
    }
    const front = geometry.panels.find(
      (panel) => panel.id === 'panel-drawer-front-m3-1',
    );
    if (!front) {
      return;
    }
    // Módulo 3 en x=1606 (18+776+18+776), holgura
    // lateral de 3 mm; base del módulo en y=18.
    expect(front.positionMm).toEqual({
      x: 1609,
      y: 18,
      z: 18,
    });
    const renderable = toRenderablePanel(front);
    expect(renderable.centerM[0]).toBeCloseTo(
      (1609 + 1609 + 770) / 2 / 1000,
      10,
    );
  });
});

describe('renderizado de cajones', () => {
  it('la interfaz muestra el control de cajones en módulos "drawers"', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Cajones');
    expect(html).toContain('cajones');
  });

  it('el control de cajones no aparece en otros módulos', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 2, 'shelves');
    const html = renderToString(<App initialConfig={config} />);
    expect(html).not.toContain('Provisional: 1–8 cajones');
  });

  it('el resumen muestra ensamblajes, piezas y material de cajón', () => {
    const html = renderToString(<App />);
    // React 19 intercala <!-- --> entre texto e
    // interpolaciones en renderToString.
    expect(html).toMatch(/Cajones \(<!-- -->3<!-- -->\)/);
    expect(html).toMatch(/Piezas de cajón/);
    expect(html).toMatch(/Frentes de cajón<!-- -->: <!-- -->3/);
    expect(html).toMatch(/Laterales de cajón<!-- -->: <!-- -->6/);
    expect(html).toMatch(/Traseras de cajón<!-- -->: <!-- -->3/);
    expect(html).toMatch(/Fondos de cajón<!-- -->: <!-- -->3/);
    expect(html).toMatch(/Módulo <!-- -->3/);
    expect(html).toContain('3 cajones');
  });

  it('el resumen no muestra cajones sin módulos de cajones', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 2, 'hanging');
    const html = renderToString(<App initialConfig={config} />);
    expect(html).not.toContain('Piezas de cajón');
  });

  it('mostrar 5 cajones tras cambiar la cantidad', () => {
    const config = setModuleDrawers(DEFAULT_CONFIG, 2, 5);
    const html = renderToString(<App initialConfig={config} />);
    expect(html).toMatch(/Cajones \(<!-- -->5<!-- -->\)/);
    expect(html).toMatch(/Frentes de cajón<!-- -->: <!-- -->5/);
  });

  it('la geometría renderizada coincide con la del motor', () => {
    const state = deriveGeometryState(DEFAULT_CONFIG);
    const geometry = state.geometry;
    expect(geometry).not.toBeNull();
    if (!geometry) {
      return;
    }
    const html = renderToString(<App />);
    for (const drawer of geometry.drawers) {
      expect(html).toContain(drawer.id);
    }
    // Los IDs de pieza son estables y visibles en
    // el modelo (presentes en la geometría del motor).
    const firstDrawerParts = geometry.drawers[0]?.partIds ?? [];
    for (const partId of firstDrawerParts) {
      expect(
        geometry.panels.some((panel) => panel.id === partId),
      ).toBe(true);
    }
  });

  it('no muta la configuración inicial al renderizar', () => {
    const initial = structuredClone(DEFAULT_CONFIG);
    const snapshot = JSON.stringify(initial);
    renderToString(<App initialConfig={initial} />);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});

describe('compatibilidad con diseños anteriores', () => {
  it('una configuración v1 sin drawer ni drawers calcula geometría válida', () => {
    const legacy = calculateGeometry(DEFAULT_CONFIG);
    expect(legacy.totals.drawerCount).toBe(3);
    // El volumen incluye las piezas de cajón.
    const drawerVolume = legacy.panels
      .filter((panel) => panel.role.startsWith('drawer-'))
      .reduce(
        (sum, panel) =>
          sum + panel.sizeMm.x * panel.sizeMm.y * panel.sizeMm.z,
        0,
      );
    expect(legacy.totals.panelVolumeMm3).toBeGreaterThan(
      drawerVolume,
    );
  });

  it('clearHangingRod sigue funcionando junto a los cajones', () => {
    const config = setModuleDrawers(
      setMaterialName(DEFAULT_CONFIG, 'drawer', 'Nogal'),
      2,
      4,
    );
    const cleared = clearHangingRod(config);
    expect(cleared.hangingRod).toBeUndefined();
    expect(cleared.modules[2]).toEqual({
      kind: 'drawers',
      drawers: 4,
    });
    expect(cleared.materials.drawer?.name).toBe('Nogal');
    const state = deriveGeometryState(cleared);
    expect(state.geometry?.drawers).toHaveLength(4);
  });
});
