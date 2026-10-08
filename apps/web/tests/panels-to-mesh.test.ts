import { describe, expect, it } from 'vitest';
import {
  calculateGeometry,
  type Panel,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  toRenderablePanel,
  toRenderablePanels,
} from '../src/lib/panels-to-mesh.js';
import {
  DEFAULT_CONFIG,
  setDimension,
  setMaterialThickness,
  setModuleCount,
  setModuleKind,
} from '../src/lib/config.js';

const sidePanel: Panel = {
  id: 'panel-side-left',
  role: 'side',
  moduleId: null,
  materialId: 'material-structure',
  sizeMm: { x: 18, y: 2200, z: 600 },
  positionMm: { x: 0, y: 0, z: 0 },
};

const dividerPanel: Panel = {
  id: 'panel-divider-1',
  role: 'divider',
  moduleId: null,
  materialId: 'material-structure',
  sizeMm: { x: 18, y: 2164, z: 600 },
  positionMm: { x: 994, y: 18, z: 0 },
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe('toRenderablePanel', () => {
  it('convierte tamaño y posición de mm a metros', () => {
    const panel = toRenderablePanel(sidePanel);
    expect(panel.id).toBe('panel-side-left');
    expect(panel.role).toBe('side');
    expect(panel.moduleId).toBeNull();
    expect(panel.materialId).toBe('material-structure');
    expect(panel.sizeM).toEqual([0.018, 2.2, 0.6]);
    expect(panel.positionM).toEqual([0, 0, 0]);
  });

  it('calcula el centro para posicionar la caja', () => {
    const panel = toRenderablePanel(sidePanel);
    expect(panel.centerM).toEqual([0.009, 1.1, 0.3]);
  });

  it('convierte paneles desplazados conservando la posición', () => {
    const panel = toRenderablePanel(dividerPanel);
    expect(panel.positionM).toEqual([0.994, 0.018, 0]);
    expect(panel.sizeM).toEqual([0.018, 2.164, 0.6]);
    // Centro: posición + mitad del tamaño
    expect(panel.centerM).toEqual([1.003, 1.1, 0.3]);
  });

  it('no muta el panel de entrada (congelado)', () => {
    const frozen = deepFreeze(structuredClone(sidePanel));
    expect(() => toRenderablePanel(frozen)).not.toThrow();
    expect(frozen.sizeMm).toEqual({ x: 18, y: 2200, z: 600 });
    expect(frozen.positionMm).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('es determinista', () => {
    expect(toRenderablePanel(dividerPanel)).toEqual(
      toRenderablePanel(dividerPanel),
    );
  });
});

describe('toRenderablePanels', () => {
  it('convierte una lista de paneles', () => {
    const panels = toRenderablePanels([sidePanel, dividerPanel]);
    expect(panels).toHaveLength(2);
    expect(panels[0]?.id).toBe('panel-side-left');
    expect(panels[1]?.id).toBe('panel-divider-1');
  });

  it('devuelve lista vacía sin paneles', () => {
    expect(toRenderablePanels([])).toEqual([]);
  });

  it('transforma los paneles de un GeometryResult real', () => {
    const geometry = calculateGeometry(DEFAULT_CONFIG);
    const panels = toRenderablePanels(geometry.panels);
    expect(panels).toHaveLength(geometry.panels.length);
    // Todos los tamaños en metros son positivos
    for (const panel of panels) {
      expect(panel.sizeM[0]).toBeGreaterThan(0);
      expect(panel.sizeM[1]).toBeGreaterThan(0);
      expect(panel.sizeM[2]).toBeGreaterThan(0);
    }
    // El lateral derecho está en el extremo del ancho (2400 mm)
    const right = panels.find((panel) => panel.id === 'panel-side-right');
    expect(right?.positionM[0]).toBeCloseTo(2.4 - 0.018, 10);
  });

  it('refleja cambios de configuración sin mutar datos previos', () => {
    const base = calculateGeometry(DEFAULT_CONFIG);
    const before = toRenderablePanels(base.panels);

    const changedConfig: WardrobeConfig = setDimension(
      setModuleCount(DEFAULT_CONFIG, 4),
      'widthMm',
      3200,
    );
    const after = toRenderablePanels(
      calculateGeometry(changedConfig).panels,
    );

    expect(after).toHaveLength(before.length + 1); // +1 división
    const right = after.find((panel) => panel.id === 'panel-side-right');
    expect(right?.positionM[0]).toBeCloseTo(3.2 - 0.018, 10);
    // La conversión anterior no se vio alterada
    expect(before[0]?.sizeM).toEqual([0.018, 2.2, 0.6]);
  });
});
