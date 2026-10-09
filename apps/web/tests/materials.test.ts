import { describe, expect, it } from 'vitest';
import type { Material, RodMaterial } from '@furniconfig/geometry-core';
import {
  toRenderMaterial,
  toRenderRodMaterial,
} from '../src/lib/materials.js';

/**
 * Pruebas del mapeo materiales → apariencia 3D (capa de
 * presentación; cosmético, no toca geometría). Cubren los
 * ajustes de la Fase 3A: metalness 0 para tableros
 * (dieléctricos) y rugosidades por acabado con IBL.
 */

function board(
  overrides: Partial<Material> = {},
): Material {
  return {
    id: 'material-structure',
    name: 'Roble',
    thicknessMm: 18,
    finish: 'mate',
    ...overrides,
  };
}

function rod(
  overrides: Partial<RodMaterial> = {},
): RodMaterial {
  return {
    id: 'material-rod',
    name: 'Acero',
    finish: 'brillo',
    ...overrides,
  };
}

describe('toRenderMaterial — tableros', () => {
  it('resuelve los nombres catalogados a su color fijo', () => {
    expect(toRenderMaterial(board({ name: 'Roble' })).color).toBe(
      '#b08968',
    );
    expect(
      toRenderMaterial(board({ name: 'Blanco' })).color,
    ).toBe('#f2f2f0');
    expect(toRenderMaterial(board({ name: 'Nogal' })).color).toBe(
      '#6f4e37',
    );
  });

  it('ignora mayúsculas y espesor al buscar el preset', () => {
    expect(
      toRenderMaterial(board({ name: '  ROBLE ' })).color,
    ).toBe('#b08968');
  });

  it('nombres no catalogados: color determinista (mismo nombre, mismo color)', () => {
    const first = toRenderMaterial(
      board({ name: 'Roble Avellana' }),
    );
    const second = toRenderMaterial(
      board({ name: 'Roble Avellana' }),
    );
    expect(first.color).toMatch(/^hsl\(\d+, 32%, 60%\)$/);
    expect(second.color).toBe(first.color);
    expect(
      toRenderMaterial(board({ name: 'Cerezo' })).color,
    ).not.toBe(first.color);
  });

  it('asigna rugosidad por acabado y la por defecto si no existe', () => {
    expect(toRenderMaterial(board({ finish: 'mate' })).roughness).toBe(0.78);
    expect(toRenderMaterial(board({ finish: 'brillo' })).roughness).toBe(0.2);
    expect(
      toRenderMaterial(board({ finish: 'texturado' })).roughness,
    ).toBe(0.9);
    expect(
      toRenderMaterial(board({ finish: 'desconocido' })).roughness,
    ).toBe(0.7);
  });

  it('los tableros son dieléctricos: metalness 0 (Fase 3A)', () => {
    expect(toRenderMaterial(board()).metalness).toBe(0);
    expect(
      toRenderMaterial(board({ finish: 'brillo' })).metalness,
    ).toBe(0);
  });

  it('es pura: no muta el material de entrada', () => {
    const source = board();
    const snapshot = { ...source };
    toRenderMaterial(source);
    expect(source).toEqual(snapshot);
  });
});

describe('toRenderRodMaterial — barras y metales', () => {
  it('resuelve metales catalogados y conserva metalness alto', () => {
    const acero = toRenderRodMaterial(rod({ name: 'Acero' }));
    expect(acero.color).toBe('#b8bec4');
    expect(acero.metalness).toBe(0.9);
    expect(
      toRenderRodMaterial(rod({ name: 'Latón' })).color,
    ).toBe('#c9a227');
  });

  it('aplica la rugosidad del acabado y la por defecto en metal', () => {
    expect(toRenderRodMaterial(rod({ finish: 'brillo' })).roughness).toBe(0.2);
    expect(
      toRenderRodMaterial(rod({ finish: 'desconocido' })).roughness,
    ).toBe(0.35);
  });

  it('metal no catalogado: color determinista por hash', () => {
    expect(
      toRenderRodMaterial(rod({ name: 'Bronce' })).color,
    ).toMatch(/^hsl\(\d+, 32%, 60%\)$/);
    expect(
      toRenderRodMaterial(rod({ name: 'Bronce' })).color,
    ).toBe(toRenderRodMaterial(rod({ name: 'Bronce' })).color);
  });
});
