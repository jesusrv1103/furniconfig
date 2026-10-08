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
import { distributeModules } from './distribute.js';
import type { Material } from '../types/material.js';
import type { Module } from '../types/module.js';
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
    } satisfies Module;
  });

  return {
    widthMm: config.dimensions.widthMm,
    heightMm: config.dimensions.heightMm,
    depthMm: config.dimensions.depthMm,
    modules,
    materials: { structure, interior },
  };
}

/** Calcula la geometría completa de un clóset a partir de su configuración. */
export function calculateGeometry(config: WardrobeConfig): GeometryResult {
  const validation = validateWardrobeConfig(config);
  if (!validation.ok) {
    throw new ConfigValidationError(validation.errors);
  }

  const wardrobe = resolveWardrobe(validation.config);
  const panels = buildPanels(wardrobe);
  const panelVolumeMm3 = panels.reduce(
    (sum, panel) =>
      sum + panel.sizeMm.x * panel.sizeMm.y * panel.sizeMm.z,
    0,
  );

  return {
    wardrobe,
    panels,
    totals: {
      panelCount: panels.length,
      panelVolumeMm3,
    },
  };
}
