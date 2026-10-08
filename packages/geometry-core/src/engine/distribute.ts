/**
 * Distribución determinista de módulos (ADR-006).
 *
 * Dado el ancho total del clóset, calcula el ancho útil interior (restando los
 * laterales) y lo reparte entre los módulos, descontando las divisiones
 * interiores. El residuo de la división entera se asigna de izquierda a
 * derecha, 1 mm por módulo: misma entrada → misma salida, siempre.
 *
 * Función pura: no muta entradas, no tiene efectos secundarios.
 */

import { GeometryError } from '../errors.js';
import { WARDROBE_LIMITS } from '../contract/limits.js';
import { isBoardThicknessMm } from '../types/material.js';

export interface DistributeModulesInput {
  /** Ancho exterior total del clóset (mm). */
  totalWidthMm: number;
  /** Cantidad de módulos verticales (1–4 en Fase 0). */
  moduleCount: number;
  /** Espesor de los paneles laterales (mm). */
  sideThicknessMm: number;
  /** Espesor de las divisiones interiores (mm). */
  dividerThicknessMm: number;
  /** Ancho mínimo admisible por módulo. Por defecto, límite provisional. */
  minModuleWidthMm?: number;
}

export interface ModuleDistribution {
  readonly totalWidthMm: number;
  /** Ancho interior total: totalWidthMm − 2 · sideThicknessMm. */
  readonly usableWidthMm: number;
  /** Espesor total consumido por divisiones: (moduleCount − 1) · dividerThicknessMm. */
  readonly dividerTotalMm: number;
  /** Ancho disponible para módulos: usableWidthMm − dividerTotalMm. */
  readonly availableWidthMm: number;
  readonly moduleCount: number;
  /** Ancho interno útil por módulo, de izquierda a derecha. */
  readonly moduleWidthsMm: readonly number[];
}

export function distributeModules(
  input: DistributeModulesInput,
): ModuleDistribution {
  const { totalWidthMm, moduleCount, sideThicknessMm, dividerThicknessMm } =
    input;
  const minModuleWidthMm =
    input.minModuleWidthMm ?? WARDROBE_LIMITS.moduleWidthMm.min;

  if (!Number.isInteger(totalWidthMm) || totalWidthMm <= 0) {
    throw new GeometryError(
      'ERR_INVALID_DIMENSION',
      'El ancho total debe ser un entero positivo (mm).',
      { totalWidthMm },
    );
  }

  const { min: moduleMin, max: moduleMax } = WARDROBE_LIMITS.moduleCount;
  if (
    !Number.isInteger(moduleCount) ||
    moduleCount < moduleMin ||
    moduleCount > moduleMax
  ) {
    throw new GeometryError(
      'ERR_INVALID_MODULE_COUNT',
      `El número de módulos debe estar entre ${moduleMin} y ${moduleMax}.`,
      { moduleCount },
    );
  }

  if (!isBoardThicknessMm(sideThicknessMm)) {
    throw new GeometryError(
      'ERR_INVALID_THICKNESS',
      'Espesor de laterales no soportado. En Fase 0 solo se admiten 15 y 18 mm.',
      { sideThicknessMm },
    );
  }
  if (!isBoardThicknessMm(dividerThicknessMm)) {
    throw new GeometryError(
      'ERR_INVALID_THICKNESS',
      'Espesor de divisiones no soportado. En Fase 0 solo se admiten 15 y 18 mm.',
      { dividerThicknessMm },
    );
  }

  const usableWidthMm = totalWidthMm - 2 * sideThicknessMm;
  const dividerTotalMm = (moduleCount - 1) * dividerThicknessMm;
  const availableWidthMm = usableWidthMm - dividerTotalMm;

  if (availableWidthMm <= 0) {
    throw new GeometryError(
      'ERR_WIDTH_INSUFFICIENT',
      'El ancho total no deja hueco para módulos tras laterales y divisiones.',
      { totalWidthMm, usableWidthMm, dividerTotalMm, availableWidthMm },
    );
  }

  const requiredWidthMm = moduleCount * minModuleWidthMm;
  if (availableWidthMm < requiredWidthMm) {
    throw new GeometryError(
      'ERR_MODULE_WIDTH_TOO_SMALL',
      `El ancho disponible (${availableWidthMm} mm) no alcanza para ${moduleCount} módulos de al menos ${minModuleWidthMm} mm.`,
      {
        availableWidthMm,
        requiredWidthMm,
        moduleCount,
        minModuleWidthMm,
      },
    );
  }

  const baseWidthMm = Math.floor(availableWidthMm / moduleCount);
  const remainderMm = availableWidthMm - baseWidthMm * moduleCount;
  const moduleWidthsMm = Array.from(
    { length: moduleCount },
    (_, index) => (index < remainderMm ? baseWidthMm + 1 : baseWidthMm),
  );

  return {
    totalWidthMm,
    usableWidthMm,
    dividerTotalMm,
    availableWidthMm,
    moduleCount,
    moduleWidthsMm,
  };
}

/**
 * Distribución determinista de bandas de altura para
 * cajones (Fase 2B).
 *
 * Reparte el alto interior útil en `drawerCount`
 * bandas enteras; el residuo de la división se
 * asigna de abajo hacia arriba, 1 mm por banda
 * (la banda inferior lleva el primero). Misma
 * entrada → misma salida, siempre.
 *
 * Función pura: no muta entradas, no tiene efectos.
 */
export function distributeDrawerBands(
  innerHeightMm: number,
  drawerCount: number,
): readonly number[] {
  if (!Number.isInteger(innerHeightMm) || innerHeightMm <= 0) {
    throw new GeometryError(
      'ERR_INVALID_DIMENSION',
      'El alto interior debe ser un entero positivo (mm).',
      { innerHeightMm },
    );
  }

  const { min, max } = WARDROBE_LIMITS.drawerCount;
  if (
    !Number.isInteger(drawerCount) ||
    drawerCount < min ||
    drawerCount > max
  ) {
    throw new GeometryError(
      'ERR_INVALID_DRAWER_COUNT',
      `El número de cajones debe estar entre ${min} y ${max}.`,
      { drawerCount },
    );
  }

  const baseBandMm = Math.floor(innerHeightMm / drawerCount);
  const remainderMm = innerHeightMm - baseBandMm * drawerCount;
  return Array.from(
    { length: drawerCount },
    (_, index) => (index < remainderMm ? baseBandMm + 1 : baseBandMm),
  );
}
