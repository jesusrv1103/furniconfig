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
  distributeModules,
  maxFixedWidthMm,
  type BackPanelConfig,
  type BoardThicknessMm,
  type DoorHingeSide,
  type DoorLeafCount,
  type MaterialSpec,
  type ModuleConfig,
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

/**
 * Establece una dimensión externa (mm).
 *
 * Fase 3D: al cambiar el ANCHO del mueble se conservan los
 * anchos fijados de los módulos solo si siguen encajando
 * (`withWidthsIfConsistent`); si no, la distribución vuelve
 * a ser uniforme para no dejar la configuración inválida.
 * El cambio es reversible con deshacer.
 */
export function setDimension(
  config: WardrobeConfig,
  key: DimensionKey,
  value: number,
): WardrobeConfig {
  const dimensions = { ...config.dimensions };
  dimensions[key] = value;
  const next = { ...config, dimensions };
  return key === 'widthMm' ? withWidthsIfConsistent(next) : next;
}

/**
 * Ajusta el número de módulos al rango confirmado (1–4).
 * Los módulos nuevos se añaden como "hanging"; al quitar, se
 * truncan desde la derecha.
 *
 * Fase 3D: como cambio estructural, se conservan los anchos
 * fijados solo si siguen encajando con el nuevo reparto
 * (si no, vuelve a distribución uniforme).
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
  return withWidthsIfConsistent({ ...config, modules });
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
    // El ancho declarado (Fase 3D) pertenece al módulo,
    // no a su tipo: se conserva al cambiar de tipo.
    const widthField =
      module.widthMm !== undefined ? { widthMm: module.widthMm } : {};
    if (kind === 'shelves') {
      return {
        kind,
        shelves: module.shelves ?? DEFAULT_SHELVES,
        ...widthField,
      };
    }
    return { kind, ...widthField };
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

// ── Distribución de ancho por módulo (Fase 3D) ─────────
//
// Anchos interiores libres declarados en la configuración
// (`ModuleConfig.widthMm`): los helpers son puros y no
// mutan la entrada. El motor es la única fuente de verdad
// del reparto; aquí solo se declaran/liberan anchos y se
// consulta al motor si el resultado sigue siendo válido.

function distributionInput(config: WardrobeConfig) {
  return {
    totalWidthMm: config.dimensions.widthMm,
    moduleCount: config.modules.length,
    sideThicknessMm: config.materials.structure.thicknessMm,
    dividerThicknessMm: config.materials.structure.thicknessMm,
    declaredWidthsMm: config.modules.map((module) => module.widthMm),
  };
}

/** `true` si el motor puede repartir la configuración. */
function widthsConsistent(config: WardrobeConfig): boolean {
  try {
    distributeModules(distributionInput(config));
    return true;
  } catch {
    return false;
  }
}

/** Módulo sin ancho declarado (vuelve a reparto automático). */
function withoutDeclaredWidth(module: ModuleConfig): ModuleConfig {
  if (module.widthMm === undefined) {
    return module;
  }
  const next: ModuleConfig = { kind: module.kind };
  if (module.shelves !== undefined) {
    next.shelves = module.shelves;
  }
  if (module.drawers !== undefined) {
    next.drawers = module.drawers;
  }
  return next;
}

function equalizeAllWidths(config: WardrobeConfig): WardrobeConfig {
  if (!config.modules.some((module) => module.widthMm !== undefined)) {
    return config;
  }
  return { ...config, modules: config.modules.map(withoutDeclaredWidth) };
}

/**
 * Conserva los anchos fijados de `next` solo si el motor
 * sigue pudiendo repartir el espacio; si no, libera todos
 * (vuelve a distribución uniforme). Evita que un cambio de
 * dimensión o de conteo deje la configuración inválida.
 */
function withWidthsIfConsistent(next: WardrobeConfig): WardrobeConfig {
  if (!next.modules.some((module) => module.widthMm !== undefined)) {
    return next;
  }
  return widthsConsistent(next) ? next : equalizeAllWidths(next);
}

/**
 * Fija el ancho interior libre del módulo `index` (mm).
 *
 * El valor se redondea a entero y se acota al rango
 * válido: mínimo provisional y ancho máximo disponible
 * (`maxFixedWidthMm`, que deja el mínimo a los demás).
 * Si el resultado no cambia nada, se devuelve la misma
 * configuración (sin paso de historial).
 */
export function setModuleWidth(
  config: WardrobeConfig,
  index: number,
  widthMm: number,
): WardrobeConfig {
  const target = config.modules[index];
  if (target === undefined || !Number.isFinite(widthMm)) {
    return config;
  }
  const minMm = WARDROBE_LIMITS.moduleWidthMm.min;
  const maxMm = maxFixedWidthMm({
    ...distributionInput(config),
    targetIndex: index,
  });
  const clamped = Math.min(
    Math.max(Math.round(widthMm), minMm),
    Math.max(maxMm, minMm),
  );
  if (target.widthMm === clamped) {
    return config;
  }
  const modules = config.modules.map((module, current) =>
    current === index ? { ...module, widthMm: clamped } : module,
  );
  return { ...config, modules };
}

/**
 * Libera el ancho fijado del módulo `index`: vuelve a ser
 * automático y comparte el espacio restante con los demás
 * módulos automáticos.
 */
export function releaseModuleWidth(
  config: WardrobeConfig,
  index: number,
): WardrobeConfig {
  const target = config.modules[index];
  if (target?.widthMm === undefined) {
    return config;
  }
  return {
    ...config,
    modules: config.modules.map((module, current) =>
      current === index ? withoutDeclaredWidth(module) : module,
    ),
  };
}

/**
 * "Igualar anchos": libera TODOS los anchos fijados y
 * devuelve el reparto uniforme (comportamiento histórico
 * del motor, con residuo 1 mm de izquierda a derecha).
 */
export function equalizeModuleWidths(
  config: WardrobeConfig,
): WardrobeConfig {
  return equalizeAllWidths(config);
}

/**
 * "Repartir espacio restante": conserva el ancho actual
 * del módulo `index` (fijado) y libera los demás para que
 * compartan por igual el espacio restante.
 *
 * Si el ancho actual no encaja (p. ej. supera el máximo
 * provisional al declararlo), no se aplica nada: se
 * devuelve la configuración original en lugar de producir
 * un estado inválido.
 */
export function fixSelectedRedistributeOthers(
  config: WardrobeConfig,
  index: number,
  currentWidthMm: number,
): WardrobeConfig {
  const target = config.modules[index];
  if (target === undefined || !Number.isFinite(currentWidthMm)) {
    return config;
  }
  const released = {
    ...config,
    modules: config.modules.map((module, current) =>
      current === index ? module : withoutDeclaredWidth(module),
    ),
  };
  const requestedMm = Math.round(currentWidthMm);
  const minMm = WARDROBE_LIMITS.moduleWidthMm.min;
  const maxMm = maxFixedWidthMm({
    ...distributionInput(released),
    targetIndex: index,
  });
  if (requestedMm < minMm || requestedMm > Math.max(maxMm, minMm)) {
    return config;
  }
  if (target.widthMm === requestedMm) {
    const othersReleased = released.modules.some(
      (module, current) =>
        current !== index && module !== config.modules[current],
    );
    return othersReleased ? released : config;
  }
  return {
    ...released,
    modules: released.modules.map((module, current) =>
      current === index ? { ...module, widthMm: requestedMm } : module,
    ),
  };
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
