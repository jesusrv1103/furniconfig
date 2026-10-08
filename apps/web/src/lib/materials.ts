/**
 * Mapeo de materiales del motor a apariencia 3D.
 *
 * El color y el acabado son cosméticos: no afectan la geometría.
 * Los nombres conocidos tienen color fijo; los desconocidos obtienen
 * un color determinista por hash del nombre (mismo nombre → mismo
 * color, siempre).
 */

import type { Material, RodMaterial } from '@furniconfig/geometry-core';

export interface RenderMaterial {
  /** Color CSS (hex o hsl). */
  color: string;
  /** Rugosidad Three.js (0 = brillo, 1 = mate). */
  roughness: number;
  metalness: number;
}

const PRESET_COLORS: Readonly<Record<string, string>> = {
  roble: '#b08968',
  nogal: '#6f4e37',
  haya: '#d9b382',
  pino: '#e3c89b',
  blanco: '#f2f2f0',
  gris: '#9aa0a6',
  negro: '#2b2b2b',
};

const PRESET_ROUGHNESS: Readonly<Record<string, number>> = {
  mate: 0.85,
  brillo: 0.25,
  texturado: 0.95,
};

const DEFAULT_ROUGHNESS = 0.7;
const DEFAULT_METALNESS = 0.05;

function colorFromName(name: string): string {
  const preset = PRESET_COLORS[name.trim().toLowerCase()];
  if (preset) {
    return preset;
  }
  // Hash determinista → tono HSL estable para nombres no catalogados.
  let hash = 0;
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 32%, 60%)`;
}

/** Convierte un Material del motor en apariencia de renderizado. */
export function toRenderMaterial(material: Material): RenderMaterial {
  return {
    color: colorFromName(material.name),
    roughness:
      PRESET_ROUGHNESS[material.finish.trim().toLowerCase()] ??
      DEFAULT_ROUGHNESS,
    metalness: DEFAULT_METALNESS,
  };
}

const PRESET_METAL_COLORS: Readonly<Record<string, string>> = {
  acero: '#b8bec4',
  aluminio: '#d0d4d8',
  cromo: '#e8ecef',
  latón: '#c9a227',
  negro: '#2b2b2b',
};

const DEFAULT_ROD_ROUGHNESS = 0.35;
/** Las barras de colgado son metálicas por naturaleza. */
const ROD_METALNESS = 0.9;

export interface RenderRodMaterial {
  color: string;
  roughness: number;
  metalness: number;
}

/**
 * Convierte un RodMaterial del motor en apariencia de
 * renderizado metálico.
 */
export function toRenderRodMaterial(
  material: RodMaterial,
): RenderRodMaterial {
  const preset = PRESET_METAL_COLORS[material.name.trim().toLowerCase()];
  return {
    color: preset ?? colorFromName(material.name),
    roughness:
      PRESET_ROUGHNESS[material.finish.trim().toLowerCase()] ??
      DEFAULT_ROD_ROUGHNESS,
    metalness: ROD_METALNESS,
  };
}
