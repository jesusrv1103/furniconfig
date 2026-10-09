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
  DEFAULT_DOOR_CLEARANCE_MM,
  DEFAULT_DOOR_LEAVES,
  DEFAULT_DRAWER_COUNT,
  DEFAULT_DRAWER_MATERIAL_SPEC,
  DEFAULT_HINGE_SIDE,
  DEFAULT_ROD_DIAMETER_MM,
  DEFAULT_ROD_FINISH,
  DEFAULT_ROD_NAME,
  WARDROBE_CONFIG_SCHEMA_VERSION,
  WARDROBE_LIMITS,
  type BackPanelConfig,
  type BoardThicknessMm,
  type DoorHingeSide,
  type DoorLeafCount,
  type MaterialSpec,
  type ModuleKind,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';

// Valores por defecto provisionales para barras de colgado
// (el motor los aplica cuando no hay spec explícito).
export {
  DEFAULT_ROD_DIAMETER_MM,
  DEFAULT_ROD_FINISH,
  DEFAULT_ROD_NAME,
};

// Valor por defecto provisional para cajones
// (el motor lo aplica cuando no hay cantidad explícita).
export { DEFAULT_DRAWER_COUNT };

// Valores por defecto provisionales para puertas
// (el motor los aplica cuando no hay spec explícito).
export {
  DEFAULT_DOOR_CLEARANCE_MM,
  DEFAULT_DOOR_LEAVES,
  DEFAULT_HINGE_SIDE,
};

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
export type MaterialRole = 'structure' | 'interior' | 'drawer' | 'door' | 'back';

/**
 * Especificación de material base para un rol.
 * Los roles "drawer", "door" y "back" son opcionales
 * en el contrato: parten del default provisional del
 * motor (drawer: su spec; door y back: estructura).
 */
export function materialSpec(
  config: WardrobeConfig,
  role: MaterialRole,
): MaterialSpec {
  if (role === 'drawer') {
    return {
      ...DEFAULT_DRAWER_MATERIAL_SPEC,
      ...config.materials.drawer,
    };
  }
  if (role === 'door' || role === 'back') {
    // Default de puertas y panel trasero: estructura.
    return {
      ...config.materials.structure,
      ...config.materials[role],
    };
  }
  return config.materials[role];
}

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

/**
 * Establece la cantidad de cajones de un módulo
 * "drawers" (rango provisional 1–8 del motor).
 */
export function setModuleDrawers(
  config: WardrobeConfig,
  index: number,
  drawers: number,
): WardrobeConfig {
  const { min, max } = WARDROBE_LIMITS.drawerCount;
  const clamped = Math.min(Math.max(Math.round(drawers), min), max);
  const modules = config.modules.map((module, current) =>
    current === index && module.kind === 'drawers'
      ? { ...module, drawers: clamped }
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
  materials[role] = {
    ...materialSpec(config, role),
    thicknessMm,
  };
  return { ...config, materials };
}

/** Establece el nombre de un rol de material. */
export function setMaterialName(
  config: WardrobeConfig,
  role: MaterialRole,
  name: string,
): WardrobeConfig {
  const materials = { ...config.materials };
  materials[role] = { ...materialSpec(config, role), name };
  return { ...config, materials };
}

/** Establece el acabado de un rol de material. */
export function setMaterialFinish(
  config: WardrobeConfig,
  role: MaterialRole,
  finish: string,
): WardrobeConfig {
  const materials = { ...config.materials };
  materials[role] = { ...materialSpec(config, role), finish };
  return { ...config, materials };
}

/** Devuelve una copia independiente de la configuración por defecto. */
export function resetConfig(): WardrobeConfig {
  return structuredClone(DEFAULT_CONFIG);
}

/**
 * Establece el diámetro de la barra de colgado.
 * Crea el spec si no existe (los demás campos usan defaults).
 */
export function setHangingRodDiameter(
  config: WardrobeConfig,
  diameterMm: number,
): WardrobeConfig {
  return {
    ...config,
    hangingRod: { ...config.hangingRod, diameterMm },
  };
}

/** Establece nombre y acabado del material metálico de la barra. */
export function setHangingRodMaterial(
  config: WardrobeConfig,
  name: string,
  finish: string,
): WardrobeConfig {
  return {
    ...config,
    hangingRod: { ...config.hangingRod, name, finish },
  };
}

/**
 * Elimina la configuración de barra: el motor vuelve a
 * aplicar sus valores por defecto provisionales.
 */
export function clearHangingRod(config: WardrobeConfig): WardrobeConfig {
  const { hangingRod, ...rest } = config;
  return rest;
}

/**
 * Activa o desactiva las puertas abatibles.
 *
 * La presencia del campo `doors` en la configuración
 * activa las puertas (el motor las genera); su ausencia
 * las desactiva. Al activar sin configuración previa,
 * usa los defaults del motor (1 hoja, bisagra
 * izquierda, holgura 3 mm).
 */
export function setDoorsEnabled(
  config: WardrobeConfig,
  enabled: boolean,
): WardrobeConfig {
  if (!enabled) {
    return clearDoors(config);
  }
  return {
    ...config,
    doors: config.doors ?? { leaves: DEFAULT_DOOR_LEAVES },
  };
}

/**
 * Elimina la configuración de puertas: el motor deja
 * de generarlas.
 */
export function clearDoors(config: WardrobeConfig): WardrobeConfig {
  const { doors, ...rest } = config;
  return rest;
}

/**
 * Establece la cantidad de hojas por módulo (1 o 2).
 * Requiere puertas activadas; si no lo están, las
 * activa con el valor indicado.
 */
export function setDoorLeaves(
  config: WardrobeConfig,
  leaves: DoorLeafCount,
): WardrobeConfig {
  return {
    ...config,
    doors: { ...config.doors, leaves },
  };
}

/**
 * Establece el lado de la bisagra (una hoja). Con dos
 * hojas el motor la ignora (bisagras en los extremos
 * exteriores).
 */
export function setDoorHingeSide(
  config: WardrobeConfig,
  hingeSide: DoorHingeSide,
): WardrobeConfig {
  return {
    ...config,
    doors: {
      ...config.doors,
      leaves: config.doors?.leaves ?? DEFAULT_DOOR_LEAVES,
      hingeSide,
    },
  };
}

/**
 * Establece la holgura de puertas (mm), acotada al
 * rango provisional del motor (0–10).
 */
export function setDoorClearance(
  config: WardrobeConfig,
  clearanceMm: number,
): WardrobeConfig {
  const { min, max } = WARDROBE_LIMITS.doors.clearanceMm;
  const clamped = Math.min(
    Math.max(Math.round(clearanceMm), min),
    max,
  );
  return {
    ...config,
    doors: {
      ...config.doors,
      leaves: config.doors?.leaves ?? DEFAULT_DOOR_LEAVES,
      clearanceMm: clamped,
    },
  };
}

/**
 * Activa o desactiva el panel trasero (montaje por
 * encaje). El espesor se conserva al reactivar;
 * por defecto 18 mm.
 */
export function setBackPanelEnabled(
  config: WardrobeConfig,
  enabled: boolean,
): WardrobeConfig {
  const backPanel: BackPanelConfig = {
    enabled,
    thicknessMm: config.backPanel?.thicknessMm ?? 18,
  };
  return { ...config, backPanel };
}

/**
 * Establece el espesor del panel trasero (15 | 18 mm).
 * El panel sigue activado/desactivado según su estado
 * previo.
 */
export function setBackPanelThickness(
  config: WardrobeConfig,
  thicknessMm: BoardThicknessMm,
): WardrobeConfig {
  const backPanel: BackPanelConfig = {
    enabled: config.backPanel?.enabled ?? false,
    thicknessMm,
  };
  return { ...config, backPanel };
}
