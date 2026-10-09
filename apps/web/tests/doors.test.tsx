import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  doorOpeningTransform,
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  toRenderableDoor,
  toRenderableHandle,
} from '../src/lib/panels-to-mesh.js';
import { deriveGeometryState } from '../src/lib/derive.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_DOOR_CLEARANCE_MM,
  DEFAULT_DOOR_LEAVES,
  DEFAULT_HINGE_SIDE,
  clearDoors,
  setBackPanelEnabled,
  setBackPanelThickness,
  setDoorClearance,
  setDoorHingeSide,
  setDoorLeaves,
  setDoorsEnabled,
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

/** DEFAULT_CONFIG con puertas activadas (1 hoja). */
const doorsConfig: WardrobeConfig = {
  ...DEFAULT_CONFIG,
  doors: { leaves: 1 },
};

/** DEFAULT_CONFIG con panel trasero activado (18 mm). */
const backPanelConfig: WardrobeConfig = {
  ...DEFAULT_CONFIG,
  backPanel: { enabled: true, thicknessMm: 18 },
};

describe('helpers de configuración de puertas', () => {
  it('setDoorsEnabled activa con defaults del motor', () => {
    const updated = setDoorsEnabled(DEFAULT_CONFIG, true);
    expect(updated.doors).toEqual({ leaves: 1 });
    // La configuración original no se altera.
    expect(DEFAULT_CONFIG.doors).toBeUndefined();
  });

  it('setDoorsEnabled(false) elimina el campo (sin puertas)', () => {
    const updated = setDoorsEnabled(doorsConfig, false);
    expect(updated.doors).toBeUndefined();
  });

  it('clearDoors elimina la configuración de puertas', () => {
    const updated = clearDoors(doorsConfig);
    expect(updated.doors).toBeUndefined();
    expect(updated).not.toBe(doorsConfig);
  });

  it('setDoorLeaves establece 1 o 2 hojas', () => {
    expect(setDoorLeaves(DEFAULT_CONFIG, 2).doors).toEqual({
      leaves: 2,
    });
    expect(
      setDoorLeaves(setDoorsEnabled(DEFAULT_CONFIG, true), 1)
        .doors,
    ).toEqual({ leaves: 1 });
  });

  it('setDoorHingeSide conserva hojas y holgura previas', () => {
    const base: WardrobeConfig = {
      ...doorsConfig,
      doors: { leaves: 1, clearanceMm: 5 },
    };
    const updated = setDoorHingeSide(base, 'right');
    expect(updated.doors).toEqual({
      leaves: 1,
      clearanceMm: 5,
      hingeSide: 'right',
    });
  });

  it('setDoorClearance acota al rango provisional 0–10', () => {
    expect(
      setDoorClearance(DEFAULT_CONFIG, 25).doors?.clearanceMm,
    ).toBe(10);
    expect(
      setDoorClearance(DEFAULT_CONFIG, -3).doors?.clearanceMm,
    ).toBe(0);
    expect(
      setDoorClearance(DEFAULT_CONFIG, 2.6).doors?.clearanceMm,
    ).toBe(3);
  });

  it('los helpers de puertas son puros (configuración congelada)', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    let config = frozen;
    config = setDoorsEnabled(config, true);
    config = setDoorLeaves(config, 2);
    config = setDoorHingeSide(config, 'right');
    config = setDoorClearance(config, 7);
    expect(frozen.doors).toBeUndefined();
    expect(config.doors).toEqual({
      leaves: 2,
      hingeSide: 'right',
      clearanceMm: 7,
    });
    // Toda la secuencia produce configuraciones válidas.
    expect(validateWardrobeConfig(config).ok).toBe(true);
  });
});

describe('helpers de configuración de panel trasero', () => {
  it('setBackPanelEnabled activa con espesor por defecto (18)', () => {
    const updated = setBackPanelEnabled(DEFAULT_CONFIG, true);
    expect(updated.backPanel).toEqual({
      enabled: true,
      thicknessMm: 18,
    });
    expect(DEFAULT_CONFIG.backPanel).toBeUndefined();
  });

  it('setBackPanelEnabled conserva el espesor al reactivar', () => {
    const withThickness = setBackPanelThickness(
      DEFAULT_CONFIG,
      15,
    );
    const updated = setBackPanelEnabled(withThickness, true);
    expect(updated.backPanel).toEqual({
      enabled: true,
      thicknessMm: 15,
    });
  });

  it('setBackPanelEnabled(false) desactiva sin eliminar el espesor', () => {
    const updated = setBackPanelEnabled(backPanelConfig, false);
    expect(updated.backPanel).toEqual({
      enabled: false,
      thicknessMm: 18,
    });
  });

  it('setBackPanelThickness establece 15 | 18 mm', () => {
    expect(
      setBackPanelThickness(backPanelConfig, 15).backPanel,
    ).toEqual({ enabled: true, thicknessMm: 15 });
    expect(
      setBackPanelThickness(DEFAULT_CONFIG, 15).backPanel,
    ).toEqual({ enabled: false, thicknessMm: 15 });
  });

  it('los helpers de panel trasero son puros y válidos', () => {
    const frozen = deepFreeze(structuredClone(DEFAULT_CONFIG));
    let config = frozen;
    config = setBackPanelEnabled(config, true);
    config = setBackPanelThickness(config, 15);
    expect(frozen.backPanel).toBeUndefined();
    expect(config.backPanel).toEqual({
      enabled: true,
      thicknessMm: 15,
    });
    expect(validateWardrobeConfig(config).ok).toBe(true);
  });
});

describe('deriveGeometryState — puertas', () => {
  it('una hoja por módulo: 3 puertas y 3 tiradores', () => {
    const state = deriveGeometryState(doorsConfig);
    expect(state.validation.ok).toBe(true);
    expect(state.geometryError).toBeNull();
    const geometry = state.geometry;
    if (!geometry) {
      return;
    }
    expect(geometry.doors).toHaveLength(3);
    expect(geometry.handles).toHaveLength(3);
    expect(geometry.totals.doorCount).toBe(3);
    expect(geometry.totals.handleCount).toBe(3);
  });

  it('geometría de la hoja: abertura menos holgura, z en [-espesor, 0]', () => {
    const geometry = deriveGeometryState(doorsConfig).geometry;
    if (!geometry) {
      return;
    }
    const door = geometry.doors[0];
    expect(door).toBeDefined();
    expect(door?.id).toBe('door-module-1-1');
    expect(door?.moduleId).toBe('module-1');
    expect(door?.leafIndex).toBe(1);
    expect(door?.leafCount).toBe(1);
    expect(door?.hingeSide).toBe(DEFAULT_HINGE_SIDE);
    // Módulo 1: ancho interior 776, alto 2164.
    expect(door?.widthMm).toBe(776 - 2 * DEFAULT_DOOR_CLEARANCE_MM);
    expect(door?.heightMm).toBe(2164 - 2 * DEFAULT_DOOR_CLEARANCE_MM);
    expect(door?.thicknessMm).toBe(18);
    expect(door?.positionMm).toEqual({ x: 21, y: 21, z: -18 });
    expect(door?.materialId).toBe('material-door');
  });

  it('tirador: cilindro horizontal a 30 mm del borde libre', () => {
    const geometry = deriveGeometryState(doorsConfig).geometry;
    if (!geometry) {
      return;
    }
    const handle = geometry.handles[0];
    expect(handle).toBeDefined();
    expect(handle?.id).toBe('handle-door-module-1-1');
    expect(handle?.doorId).toBe('door-module-1-1');
    expect(handle?.axis).toBe('x');
    // 770 × 0.4 = 308 → acotado a 120 mm.
    expect(handle?.lengthMm).toBe(120);
    expect(handle?.diameterMm).toBe(18);
    expect(handle?.materialId).toBe('material-handle');
    // Borde libre 791; centro 701; bbox (641, 1091, −36).
    expect(handle?.positionMm).toEqual({
      x: 641,
      y: 1091,
      z: -36,
    });
  });

  it('dos hojas: bisagras en los extremos exteriores', () => {
    const config: WardrobeConfig = {
      ...doorsConfig,
      doors: { leaves: 2 },
    };
    const geometry = deriveGeometryState(config).geometry;
    if (!geometry) {
      return;
    }
    expect(geometry.doors).toHaveLength(6);
    const leaf1 = geometry.doors[0];
    const leaf2 = geometry.doors[1];
    expect(leaf1?.hingeSide).toBe('left');
    expect(leaf1?.positionMm.x).toBe(21);
    expect(leaf1?.widthMm).toBe(383);
    expect(leaf2?.hingeSide).toBe('right');
    expect(leaf2?.positionMm.x).toBe(407);
    expect(leaf2?.widthMm).toBe(383);
  });

  it('bisagra derecha: tirador junto al borde libre izquierdo', () => {
    const config: WardrobeConfig = {
      ...doorsConfig,
      doors: { leaves: 1, hingeSide: 'right' },
    };
    const geometry = deriveGeometryState(config).geometry;
    if (!geometry) {
      return;
    }
    expect(geometry.doors[0]?.hingeSide).toBe('right');
    // Borde libre 21; centro 111; bbox x = 51.
    expect(geometry.handles[0]?.positionMm.x).toBe(51);
  });

  it('holgura configurable', () => {
    const config: WardrobeConfig = {
      ...doorsConfig,
      doors: { leaves: 1, clearanceMm: 5 },
    };
    const geometry = deriveGeometryState(config).geometry;
    if (!geometry) {
      return;
    }
    expect(geometry.doors[0]?.widthMm).toBe(766);
    expect(geometry.doors[0]?.positionMm.x).toBe(23);
  });

  it('sin campo doors: el motor no genera puertas ni tiradores', () => {
    const state = deriveGeometryState(DEFAULT_CONFIG);
    expect(state.geometry?.doors).toHaveLength(0);
    expect(state.geometry?.handles).toHaveLength(0);
    expect(state.geometry?.totals.doorCount).toBe(0);
  });

  it('la apertura firma el ángulo según el lado de la bisagra', () => {
    const geometry = deriveGeometryState(doorsConfig).geometry;
    if (!geometry) {
      return;
    }
    const door = geometry.doors[0];
    if (!door) {
      return;
    }
    const left = doorOpeningTransform(door, 90);
    expect(left.hingeXmm).toBe(21);
    expect(left.hingeZmm).toBe(0);
    expect(left.centerOffsetMm).toEqual({ x: 385, z: -9 });
    expect(left.signedAngleRad).toBeCloseTo(Math.PI / 2);

    const rightConfig: WardrobeConfig = {
      ...doorsConfig,
      doors: { leaves: 1, hingeSide: 'right' },
    };
    const rightGeometry = deriveGeometryState(rightConfig).geometry;
    const rightDoor = rightGeometry?.doors[0];
    if (!rightDoor) {
      return;
    }
    const right = doorOpeningTransform(rightDoor, 90);
    expect(right.hingeXmm).toBe(791);
    expect(right.centerOffsetMm).toEqual({ x: -385, z: -9 });
    expect(right.signedAngleRad).toBeCloseTo(-Math.PI / 2);
  });
});

describe('deriveGeometryState — panel trasero', () => {
  it('genera panel-back por encaje y acorta los interiores', () => {
    const state = deriveGeometryState(backPanelConfig);
    expect(state.validation.ok).toBe(true);
    const geometry = state.geometry;
    if (!geometry) {
      return;
    }
    const back = geometry.panels.find(
      (panel) => panel.id === 'panel-back',
    );
    expect(back).toBeDefined();
    expect(back?.role).toBe('back');
    expect(back?.sizeMm).toEqual({ x: 2364, y: 2164, z: 18 });
    expect(back?.positionMm).toEqual({ x: 18, y: 18, z: 582 });
    expect(back?.materialId).toBe('material-back');
    // Estante: profundidad útil 582.
    const shelf = geometry.panels.find(
      (panel) => panel.id === 'panel-shelf-m1-1',
    );
    expect(shelf?.sizeMm.z).toBe(582);
    // Barra centrada en la profundidad útil.
    expect(geometry.rods[0]?.positionMm.z).toBe(276);
    // Caja del cajón: 516 mm de profundidad.
    const bottom = geometry.panels.find(
      (panel) => panel.id === 'panel-drawer-bottom-m3-1',
    );
    expect(bottom?.sizeMm.z).toBe(516);
  });

  it('el panel trasero suma un tablero al total', () => {
    const withBack = deriveGeometryState(backPanelConfig).geometry;
    const withoutBack = deriveGeometryState(DEFAULT_CONFIG).geometry;
    if (!withBack || !withoutBack) {
      return;
    }
    expect(withBack.totals.panelCount).toBe(
      withoutBack.totals.panelCount + 1,
    );
  });

  it('espesor de 15 mm', () => {
    const config: WardrobeConfig = {
      ...DEFAULT_CONFIG,
      backPanel: { enabled: true, thicknessMm: 15 },
    };
    const geometry = deriveGeometryState(config).geometry;
    if (!geometry) {
      return;
    }
    const back = geometry.panels.find(
      (panel) => panel.id === 'panel-back',
    );
    expect(back?.sizeMm.z).toBe(15);
    expect(back?.positionMm.z).toBe(585);
  });
});

describe('conversión de puertas a datos de renderizado', () => {
  it('toRenderableDoor convierte a metros y conserva la bisagra', () => {
    const geometry = deriveGeometryState(doorsConfig).geometry;
    const door = geometry?.doors[0];
    if (!door) {
      return;
    }
    const renderable = toRenderableDoor(door);
    expect(renderable.id).toBe('door-module-1-1');
    expect(renderable.moduleId).toBe('module-1');
    expect(renderable.leafIndex).toBe(1);
    expect(renderable.leafCount).toBe(1);
    expect(renderable.hingeSide).toBe('left');
    expect(renderable.sizeM).toEqual([0.77, 2.158, 0.018]);
    // Centro: (21 + 385, 21 + 1079, −18 + 9) mm.
    expect(renderable.centerM[0]).toBeCloseTo(0.406, 10);
    expect(renderable.centerM[1]).toBeCloseTo(1.1, 10);
    expect(renderable.centerM[2]).toBeCloseTo(-0.009, 10);
    expect(renderable.positionM[0]).toBeCloseTo(0.021, 10);
    expect(renderable.positionM[1]).toBeCloseTo(0.021, 10);
    expect(renderable.positionM[2]).toBeCloseTo(-0.018, 10);
    expect(renderable.materialId).toBe('material-door');
  });

  it('toRenderableHandle calcula el centro del cilindro', () => {
    const geometry = deriveGeometryState(doorsConfig).geometry;
    const handle = geometry?.handles[0];
    if (!handle) {
      return;
    }
    const renderable = toRenderableHandle(handle);
    expect(renderable.id).toBe('handle-door-module-1-1');
    expect(renderable.doorId).toBe('door-module-1-1');
    expect(renderable.axis).toBe('x');
    expect(renderable.lengthM).toBeCloseTo(0.12, 10);
    expect(renderable.diameterM).toBeCloseTo(0.018, 10);
    // Centro: (701, 1100, −27) mm.
    expect(renderable.centerM).toEqual([0.701, 1.1, -0.027]);
    expect(renderable.materialId).toBe('material-handle');
  });
});

describe('secuencia rápida de configuración (Fase 2C)', () => {
  it('alternar puertas y panel trasero converge a un estado coherente', () => {
    let config = DEFAULT_CONFIG;
    for (let step = 0; step < 20; step++) {
      config = setDoorsEnabled(config, step % 2 === 0);
      config = setDoorLeaves(config, step % 3 === 0 ? 2 : 1);
      config = setDoorClearance(config, step % 12);
      config = setBackPanelEnabled(config, step % 4 === 0);
      config = setBackPanelThickness(config, step % 2 === 0 ? 15 : 18);
    }

    const state = deriveGeometryState(config);
    expect(state.validation.ok).toBe(true);
    const geometry = state.geometry;
    if (!geometry) {
      return;
    }
    // Invariantes: puertas activadas ⇒ una hoja
    // (o dos) por módulo, con su tirador.
    const leaves = config.doors?.leaves ?? 1;
    if (config.doors) {
      expect(geometry.doors).toHaveLength(
        geometry.wardrobe.modules.length * leaves,
      );
      expect(geometry.handles).toHaveLength(geometry.doors.length);
      for (const door of geometry.doors) {
        expect(door.leafCount).toBe(leaves);
      }
    } else {
      expect(geometry.doors).toHaveLength(0);
    }
    // Panel trasero activado ⇒ exactamente un
    // panel "back".
    if (config.backPanel?.enabled) {
      expect(
        geometry.panels.filter((panel) => panel.role === 'back'),
      ).toHaveLength(1);
    } else {
      expect(
        geometry.panels.filter((panel) => panel.role === 'back'),
      ).toHaveLength(0);
    }
  });
});

describe('renderizado de puertas y panel trasero', () => {
  it('la interfaz muestra el fieldset de puertas con botones de activación', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Puertas abatibles');
    expect(html).toContain('Sin puertas');
    expect(html).toContain('Con puertas');
    // Sin puertas activadas: no hay controles de hojas.
    expect(html).not.toContain('Hojas por módulo');
  });

  it('con puertas activadas muestra hojas, bisagra y holgura', () => {
    const html = renderToString(<App initialConfig={doorsConfig} />);
    expect(html).toContain('Hojas por módulo');
    expect(html).toContain('Bisagra');
    expect(html).toContain('Izquierda');
    expect(html).toContain('Derecha');
    expect(html).toContain('Holgura');
  });

  it('el resumen muestra puertas, tiradores y materiales', () => {
    const html = renderToString(<App initialConfig={doorsConfig} />);
    // React 19 intercala <!-- --> entre texto e
    // interpolaciones en renderToString.
    expect(html).toMatch(/Puertas \(<!-- -->3<!-- -->\)/);
    // Los tiradores se resumen por cantidad (no
    // se listan por id en el resumen).
    expect(html).toMatch(/Tiradores<\/dt><dd>3<\/dd>/);
    expect(html).toContain('door-module-1-1');
    expect(html).toMatch(/bisagra<!-- --> <!-- -->izquierda/);
    expect(html).toMatch(/Puertas: <!-- -->Roble/);
    expect(html).toMatch(/Tiradores: <!-- -->Acero/);
  });

  it('dos hojas: el resumen lista las hojas de cada módulo', () => {
    const config: WardrobeConfig = {
      ...doorsConfig,
      doors: { leaves: 2 },
    };
    const html = renderToString(<App initialConfig={config} />);
    expect(html).toMatch(/Puertas \(<!-- -->6<!-- -->\)/);
    expect(html).toContain('door-module-1-1');
    expect(html).toContain('door-module-1-2');
    expect(html).toMatch(/bisagra<!-- --> <!-- -->derecha/);
  });

  it('la interfaz muestra el fieldset de panel trasero', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Panel trasero');
    expect(html).toContain('Sin panel');
    expect(html).toContain('Con panel');
    // Sin panel activado: solo los selectores de
    // espesor de los 3 materiales base
    // (estructura, interior, cajones).
    expect(html.split('Espesor').length - 1).toBe(3);
  });

  it('con panel trasero activado muestra espesor y lo resume', () => {
    const html = renderToString(
      <App initialConfig={backPanelConfig} />,
    );
    expect(html).toContain('Espesor');
    // Selectores de espesor: 3 materiales base
    // + material del panel trasero + selector
    // del fieldset del panel trasero.
    expect(html.split('Espesor').length - 1).toBe(5);
    // Lista "Paneles por tipo": Panel trasero: 1.
    expect(html).toMatch(/Panel trasero<!-- -->: <!-- -->1/);
    // Materiales: Panel trasero: Roble · 18 mm · mate.
    expect(html).toMatch(/Panel trasero: <!-- -->Roble/);
  });

  it('materiales de puerta y panel trasero editables solo con la función activada', () => {
    const withDoorMaterial = {
      ...doorsConfig,
      materials: {
        ...doorsConfig.materials,
        door: { name: 'Nogal', thicknessMm: 15, finish: 'mate' },
      },
    } satisfies WardrobeConfig;
    const html = renderToString(
      <App initialConfig={withDoorMaterial} />,
    );
    expect(html).toMatch(/Puertas \(hojas\)/);
    expect(html).toMatch(/Puertas: <!-- -->Nogal/);
  });
});
