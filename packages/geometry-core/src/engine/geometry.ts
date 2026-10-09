/**
 * Punto de entrada del motor geométrico.
 *
 * `calculateGeometry` es una función pura: valida la configuración, resuelve el
 * clóset (anchos útiles por módulo, altura interior, materiales) y genera los
 * paneles con dimensiones y posiciones en milímetros.
 */

import type { WardrobeConfig } from '../contract/wardrobe-config.js';
import { validateWardrobeConfig } from '../contract/validate.js';
import { GeometryError } from '../errors.js';
import { buildPanels } from './panels.js';
import { buildRods } from './rods.js';
import { buildDrawers } from './drawers.js';
import { buildDoors } from './doors.js';
import { distributeModules } from './distribute.js';
import type { Material } from '../types/material.js';
import type { Module } from '../types/module.js';
import type { RodMaterial } from '../types/rod.js';
import {
  DEFAULT_ROD_DIAMETER_MM,
  DEFAULT_ROD_FINISH,
  DEFAULT_ROD_NAME,
} from '../types/rod.js';
import {
  DEFAULT_DRAWER_COUNT,
  DEFAULT_DRAWER_MATERIAL_SPEC,
} from '../types/drawer.js';
import {
  DEFAULT_DOOR_CLEARANCE_MM,
  DEFAULT_HANDLE_FINISH,
  DEFAULT_HANDLE_NAME,
  DEFAULT_HINGE_SIDE,
} from '../types/door.js';
import type { GeometryResult } from '../types/geometry-result.js';
import type { Wardrobe } from '../types/wardrobe.js';

export class ConfigValidationError extends GeometryError {
  readonly issues: ReadonlyArray<{
    code: string;
    field: string;
    message: string;
  }>;

  constructor(
    issues: ReadonlyArray<{ code: string; field: string; message: string }>,
  ) {
    super(
      'ERR_INVALID_CONFIG',
      `La configuración no es válida: ${issues
        .map((issue) => `${issue.field}: ${issue.message}`)
        .join(' | ')}`,
      { issueCount: issues.length },
    );
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

/** Resuelve un clóset a partir de una configuración ya validada. */
export function resolveWardrobe(config: WardrobeConfig): Wardrobe {
  const structure: Material = {
    id: 'material-structure',
    ...config.materials.structure,
  };
  const interior: Material = {
    id: 'material-interior',
    ...config.materials.interior,
  };

  const distribution = distributeModules({
    totalWidthMm: config.dimensions.widthMm,
    moduleCount: config.modules.length,
    sideThicknessMm: structure.thicknessMm,
    dividerThicknessMm: structure.thicknessMm,
  });

  const innerHeightMm = config.dimensions.heightMm - 2 * structure.thicknessMm;

  const modules: Module[] = config.modules.map((moduleConfig, index) => {
    const widthMm = distribution.moduleWidthsMm[index];
    if (widthMm === undefined) {
      // Inalcanzable por construcción: moduleCount coincide con la distribución.
      throw new GeometryError(
        'ERR_INVALID_MODULE_COUNT',
        'Falta el ancho resuelto de un módulo.',
        { index },
      );
    }
    return {
      id: `module-${index + 1}`,
      kind: moduleConfig.kind,
      widthMm,
      heightMm: innerHeightMm,
      depthMm: config.dimensions.depthMm,
      ...(moduleConfig.kind === 'shelves'
        ? { shelves: moduleConfig.shelves }
        : {}),
      ...(moduleConfig.kind === 'drawers'
        ? {
            drawers:
              moduleConfig.drawers ?? DEFAULT_DRAWER_COUNT,
          }
        : {}),
    } satisfies Module;
  });

  // Barras de colgado: un material metálico resuelto y un
  // diámetro resuelto solo cuando hay módulos "hanging".
  const hasHangingModules = modules.some(
    (module) => module.kind === 'hanging',
  );
  const rodSpec = config.hangingRod;
  const rodMaterial: RodMaterial | undefined = hasHangingModules
    ? {
        id: 'material-rod',
        name: rodSpec?.name ?? DEFAULT_ROD_NAME,
        finish: rodSpec?.finish ?? DEFAULT_ROD_FINISH,
      }
    : undefined;
  const hangingRodDiameterMm = hasHangingModules
    ? (rodSpec?.diameterMm ?? DEFAULT_ROD_DIAMETER_MM)
    : undefined;

  // Cajones: material de piezas resuelto solo
  // cuando hay módulos "drawers".
  const hasDrawerModules = modules.some(
    (module) => module.kind === 'drawers',
  );
  const drawerSpec = config.materials.drawer;
  const drawerMaterial: Material | undefined = hasDrawerModules
    ? {
        id: 'material-drawer',
        ...(drawerSpec ?? DEFAULT_DRAWER_MATERIAL_SPEC),
      }
    : undefined;

  // Puertas (Fase 2C): la presencia del
  // objeto `doors` las activa. El
  // material de hoja admite un default
  // de estructura; el tirador usa un
  // material metálico fijo (Acero/brillo).
  const doorsSpec = config.doors;
  const doorMaterial: Material | undefined = doorsSpec
    ? {
        id: 'material-door',
        ...(doorsSpec.material ??
          config.materials.door ??
          config.materials.structure),
      }
    : undefined;
  const handleMaterial: RodMaterial | undefined = doorsSpec
    ? {
        id: 'material-handle',
        name: DEFAULT_HANDLE_NAME,
        finish: DEFAULT_HANDLE_FINISH,
      }
    : undefined;
  const resolvedDoorsConfig = doorsSpec
    ? {
        leaves: doorsSpec.leaves,
        hingeSide: doorsSpec.hingeSide ?? DEFAULT_HINGE_SIDE,
        clearanceMm:
          doorsSpec.clearanceMm ?? DEFAULT_DOOR_CLEARANCE_MM,
      }
    : undefined;

  // Panel trasero (Fase 2C): activado
  // por `backPanel.enabled`; material
  // con default de estructura.
  const backPanelSpec = config.backPanel;
  const backEnabled = backPanelSpec?.enabled ?? false;
  const backMaterial: Material | undefined = backEnabled
    ? {
        id: 'material-back',
        ...(backPanelSpec?.material ??
          config.materials.back ??
          config.materials.structure),
      }
    : undefined;
  const resolvedBackPanel =
    backEnabled && backPanelSpec
      ? { thicknessMm: backPanelSpec.thicknessMm }
      : undefined;

  return {
    widthMm: config.dimensions.widthMm,
    heightMm: config.dimensions.heightMm,
    depthMm: config.dimensions.depthMm,
    modules,
    materials: {
      structure,
      interior,
      ...(rodMaterial ? { rod: rodMaterial } : {}),
      ...(drawerMaterial ? { drawer: drawerMaterial } : {}),
      ...(doorMaterial ? { door: doorMaterial } : {}),
      ...(handleMaterial ? { handle: handleMaterial } : {}),
      ...(backMaterial ? { back: backMaterial } : {}),
    },
    ...(hangingRodDiameterMm !== undefined
      ? { hangingRodDiameterMm }
      : {}),
    ...(resolvedDoorsConfig
      ? { doorsConfig: resolvedDoorsConfig }
      : {}),
    ...(resolvedBackPanel ? { backPanel: resolvedBackPanel } : {}),
  };
}

/** Calcula la geometría completa de un clóset a partir de su configuración. */
export function calculateGeometry(config: WardrobeConfig): GeometryResult {
  const validation = validateWardrobeConfig(config);
  if (!validation.ok) {
    throw new ConfigValidationError(validation.errors);
  }

  const wardrobe = resolveWardrobe(validation.config);
  const structuralPanels = buildPanels(wardrobe);
  const rods = buildRods(wardrobe);
  const { panels: drawerPanels, assemblies: drawers } =
    buildDrawers(wardrobe);
  const { doors, handles } = buildDoors(wardrobe);
  // Los paneles de cajón son tableros reales:
  // se incluyen en el conjunto de paneles.
  const panels = [...structuralPanels, ...drawerPanels];
  const panelVolumeMm3 = panels.reduce(
    (sum, panel) =>
      sum + panel.sizeMm.x * panel.sizeMm.y * panel.sizeMm.z,
    0,
  );
  const rodLengthMm = rods.reduce(
    (sum, rod) => sum + rod.lengthMm,
    0,
  );

  return {
    wardrobe,
    panels,
    rods,
    drawers,
    doors,
    handles,
    totals: {
      panelCount: panels.length,
      panelVolumeMm3,
      rodCount: rods.length,
      rodLengthMm,
      drawerCount: drawers.length,
      drawerPartCount: drawerPanels.length,
      doorCount: doors.length,
      handleCount: handles.length,
    },
  };
}
