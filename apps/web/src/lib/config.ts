/**
 * Estado de configuración de la interfaz.
 *
 * `DEFAULT_CONFIG` y los helpers son puros e inmutables: cada
 * operación devuelve una nueva WardrobeConfig y nunca muta la
 * entrada (la UI trabaja con actualizaciones funcionales de
 * React). Los límites de la interfaz provienen del motor
 * (`WARDROBE_LIMITS`); la validación real sigue siendo del motor.
 */

import {
  WARDROBE_CONFIG_SCHEMA_VERSION,
  WARDROBE_LIMITS,
  type BoardThicknessMm,
  type ModuleKind,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';

/** Cantidad de entrepaños al crear un módulo de tipo "shelves". */
export const DEFAULT_SHELVES = 3;

export const DEFAULT_CONFIG: WardrobeConfig = {
  schemaVersion: WARDROBE_CONFIG_SCHEMA_VERSION,
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

export const MODULE_KIND_LABELS: Readonly<Record<ModuleKind, string>> = {
  shelves: 'Entrepaños',
  hanging: 'Colgado',
  drawers: 'Cajones',
};

export const FINISH_OPTIONS = ['mate', 'brillo', 'texturado'] as const;

export type DimensionKey = 'widthMm' | 'heightMm' | 'depthMm';
export type MaterialRole = 'structure' | 'interior';

/** Establece una dimensión externa (mm). */
export function setDimension(
  config: WardrobeConfig,
  key: DimensionKey,
  value: number,
): WardrobeConfig {
  const dimensions = { ...config.dimensions };
  dimensions[key] = value;
  return { ...config, dimensions };
}

/**
 * Ajusta el número de módulos al rango confirmado (1–4).
 * Los módulos nuevos se añaden como "hanging"; al quitar, se
 * truncan desde la derecha.
 */
export function setModuleCount(
  config: WardrobeConfig,
  count: number,
): WardrobeConfig {
  const { min, max } = WARDROBE_LIMITS.moduleCount;
  const clamped = Math.min(Math.max(Math.round(count), min), max);
  const modules = [...config.modules];
  while (modules.length < clamped) {
    modules.push({ kind: 'hanging' });
  }
  modules.length = clamped;
  return { ...config, modules };
}

/** Cambia el tipo de un módulo. "shelves" conserva o añade estantes. */
export function setModuleKind(
  config: WardrobeConfig,
  index: number,
  kind: ModuleKind,
): WardrobeConfig {
  const modules = config.modules.map((module, current) => {
    if (current !== index) {
      return module;
    }
    if (kind === 'shelves') {
      return { kind, shelves: module.shelves ?? DEFAULT_SHELVES };
    }
    return { kind };
  });
  return { ...config, modules };
}

/** Establece la cantidad de entrepaños de un módulo "shelves". */
export function setModuleShelves(
  config: WardrobeConfig,
  index: number,
  shelves: number,
): WardrobeConfig {
  const modules = config.modules.map((module, current) =>
    current === index && module.kind === 'shelves'
      ? { ...module, shelves }
      : module,
  );
  return { ...config, modules };
}

/** Establece el espesor (15 | 18 mm) de un rol de material. */
export function setMaterialThickness(
  config: WardrobeConfig,
  role: MaterialRole,
  thicknessMm: BoardThicknessMm,
): WardrobeConfig {
  const materials = { ...config.materials };
  materials[role] = { ...materials[role], thicknessMm };
  return { ...config, materials };
}

/** Establece el nombre de un rol de material. */
export function setMaterialName(
  config: WardrobeConfig,
  role: MaterialRole,
  name: string,
): WardrobeConfig {
  const materials = { ...config.materials };
  materials[role] = { ...materials[role], name };
  return { ...config, materials };
}

/** Establece el acabado de un rol de material. */
export function setMaterialFinish(
  config: WardrobeConfig,
  role: MaterialRole,
  finish: string,
): WardrobeConfig {
  const materials = { ...config.materials };
  materials[role] = { ...materials[role], finish };
  return { ...config, materials };
}

/** Devuelve una copia independiente de la configuración por defecto. */
export function resetConfig(): WardrobeConfig {
  return structuredClone(DEFAULT_CONFIG);
}
