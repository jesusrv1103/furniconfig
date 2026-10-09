import { describe, expect, it } from 'vitest';
import { calculateGeometry } from '@furniconfig/geometry-core';
import {
  DEFAULT_CONFIG,
  setDoorsEnabled,
  setModuleCount,
} from '../src/lib/config.js';
import {
  MODULE_KIND_FRIENDLY,
  moduleBoundsMm,
  moduleContext,
  resolveSelection,
} from '../src/lib/studio/selection.js';

const geometry = calculateGeometry(DEFAULT_CONFIG);

describe('MODULE_KIND_FRIENDLY', () => {
  it('traduce cada tipo a lenguaje de usuario', () => {
    expect(MODULE_KIND_FRIENDLY.shelves).toBe('Repisas');
    expect(MODULE_KIND_FRIENDLY.hanging).toBe('Espacio para colgar');
    expect(MODULE_KIND_FRIENDLY.drawers).toBe('Cajones');
  });
});

describe('resolveSelection', () => {
  it('sin selección devuelve null', () => {
    expect(resolveSelection(geometry, null)).toBe(null);
  });

  it('conserva el módulo si sigue existiendo', () => {
    expect(resolveSelection(geometry, 'module-2')).toBe('module-2');
  });

  it('limpia la selección si el módulo desaparece', () => {
    expect(resolveSelection(geometry, 'module-99')).toBe(null);
  });

  it('conserva la selección cuando no hay geometría (config inválida)', () => {
    expect(resolveSelection(null, 'module-1')).toBe('module-1');
  });

  it('la selección sobrevive a un recálculo con otras dimensiones', () => {
    const recalculated = calculateGeometry({
      ...DEFAULT_CONFIG,
      dimensions: { ...DEFAULT_CONFIG.dimensions, widthMm: 2800 },
    });
    // Los ids del motor son deterministas por índice: module-N.
    expect(recalculated.wardrobe.modules[1]?.id).toBe('module-2');
    expect(resolveSelection(recalculated, 'module-2')).toBe('module-2');
  });

  it('la selección se limpia si se reduce el número de módulos', () => {
    const smaller = calculateGeometry(setModuleCount(DEFAULT_CONFIG, 2));
    expect(smaller.wardrobe.modules).toHaveLength(2);
    expect(resolveSelection(smaller, 'module-3')).toBe(null);
  });
});

describe('moduleContext', () => {
  it('resuelve índice, número y módulo resuelto', () => {
    const context = moduleContext(geometry, 'module-2');
    expect(context).not.toBeNull();
    expect(context?.id).toBe('module-2');
    expect(context?.index).toBe(1);
    expect(context?.number).toBe(2);
    expect(context?.resolved.kind).toBe('hanging');
    // El índice corresponde al mismo módulo en config.modules.
    expect(DEFAULT_CONFIG.modules[context?.index ?? -1]?.kind).toBe('hanging');
  });

  it('devuelve null sin geometría o sin selección', () => {
    expect(moduleContext(null, 'module-1')).toBe(null);
    expect(moduleContext(geometry, null)).toBe(null);
  });

  it('devuelve null si el módulo no existe', () => {
    expect(moduleContext(geometry, 'module-42')).toBe(null);
  });
});

describe('moduleBoundsMm', () => {
  it('envuelve los paneles de un módulo de repisas', () => {
    const bounds = moduleBoundsMm(geometry, 'module-1');
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    const [minX, minY, minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    // Caja no degenerada.
    expect(maxX).toBeGreaterThan(minX);
    expect(maxY).toBeGreaterThan(minY);
    expect(maxZ).toBeGreaterThan(minZ);
    // Dentro del mueble (la barra global de colgado no se cuenta).
    expect(minX).toBeGreaterThanOrEqual(0);
    expect(minZ).toBeGreaterThanOrEqual(0);
  });

  it('un módulo de colgado usa su barra (sin paneles propios)', () => {
    const bounds = moduleBoundsMm(geometry, 'module-2');
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    // El módulo colgado solo aporta la barra: alto = diámetro (30 mm).
    const heightMm = bounds.max[1] - bounds.min[1];
    expect(Math.round(heightMm)).toBe(30);
  });

  it('incluye las hojas de puerta del módulo cuando existen', () => {
    const withDoors = calculateGeometry(setDoorsEnabled(DEFAULT_CONFIG, true));
    const closed = moduleBoundsMm(geometry, 'module-1');
    const opened = moduleBoundsMm(withDoors, 'module-1');
    expect(closed).not.toBeNull();
    expect(opened).not.toBeNull();
    if (closed === null || opened === null) return;
    // La puerta montada en el frente queda en z < 0: la caja crece.
    expect(opened.min[2]).toBeLessThan(closed.min[2]);
  });

  it('devuelve null sin selección, sin geometría o módulo inexistente', () => {
    expect(moduleBoundsMm(geometry, null)).toBe(null);
    expect(moduleBoundsMm(null, 'module-1')).toBe(null);
    expect(moduleBoundsMm(geometry, 'module-42')).toBe(null);
  });
});
