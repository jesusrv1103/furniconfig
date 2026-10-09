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
  /**
   * Anchos interiores libres declarados por módulo (Fase
   * 3D), de izquierda a derecha. `undefined` en una
   * posición = módulo automático: reparte por igual el
   * sobrante (residuo 1 mm izq→der). Si todos declaran,
   * la suma debe coincidir exactamente con
   * `availableWidthMm`. Campo opcional: ausencia total =
   * distribución uniforme (comportamiento histórico).
   */
  declaredWidthsMm?: readonly (number | undefined)[];
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
  const declaredWidthsMm = input.declaredWidthsMm;

  // Sin declaraciones: distribución uniforme histórica
  // (residuo entero de izquierda a derecha, 1 mm por
  // módulo). Comportamiento idéntico a la Fase 0.
  if (declaredWidthsMm === undefined) {
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

  // Con anchos declarados (Fase 3D): los declarados se
  // respetan; los automáticos reparten el sobrante.
  if (declaredWidthsMm.length !== moduleCount) {
    throw new GeometryError(
      'ERR_MODULE_WIDTH_INVALID',
      'La lista de anchos declarados debe tener un valor por módulo.',
      { declaredCount: declaredWidthsMm.length, moduleCount },
    );
  }

  const maxDeclaredWidthMm = WARDROBE_LIMITS.moduleWidthMm.max;
  declaredWidthsMm.forEach((width, index) => {
    if (width === undefined) {
      return;
    }
    if (
      !Number.isInteger(width) ||
      width < minModuleWidthMm ||
      width > maxDeclaredWidthMm
    ) {
      throw new GeometryError(
        'ERR_MODULE_WIDTH_INVALID',
        `El ancho declarado del módulo ${index + 1} debe ser un entero entre ${minModuleWidthMm} y ${maxDeclaredWidthMm} mm (máximo provisional).`,
        { index: index + 1, widthMm: width, minModuleWidthMm, maxDeclaredWidthMm },
      );
    }
  });

  const autoIndexes = declaredWidthsMm
    .map((width, index) => (width === undefined ? index : -1))
    .filter((index) => index >= 0);
  const fixedSumMm = declaredWidthsMm.reduce<number>(
    (sum, width) => sum + (width ?? 0),
    0,
  );

  // Todos declarados: la suma debe coincidir exactamente
  // (conservación del ancho interior útil).
  if (autoIndexes.length === 0) {
    if (fixedSumMm !== availableWidthMm) {
      throw new GeometryError(
        'ERR_MODULE_WIDTH_SUM',
        `Los anchos declarados suman ${fixedSumMm} mm pero el espacio disponible es de ${availableWidthMm} mm (diferencia de ${fixedSumMm - availableWidthMm} mm).`,
        {
          declaredSumMm: fixedSumMm,
          availableWidthMm,
          differenceMm: fixedSumMm - availableWidthMm,
        },
      );
    }
    return {
      totalWidthMm,
      usableWidthMm,
      dividerTotalMm,
      availableWidthMm,
      moduleCount,
      moduleWidthsMm: [...declaredWidthsMm] as number[],
    };
  }

  // Automáticos: reparten por igual el sobrante, con el
  // mismo residuo determinista (1 mm de izquierda a
  // derecha).
  const leftoverWidthMm = availableWidthMm - fixedSumMm;
  const autoCount = autoIndexes.length;
  const autoRequiredWidthMm = autoCount * minModuleWidthMm;
  if (leftoverWidthMm < autoRequiredWidthMm) {
    throw new GeometryError(
      'ERR_MODULE_WIDTH_TOO_SMALL',
      `El espacio restante (${leftoverWidthMm} mm tras los anchos fijados) no alcanza para ${autoCount} módulos automáticos de al menos ${minModuleWidthMm} mm.`,
      {
        leftoverWidthMm,
        autoRequiredWidthMm,
        autoCount,
        minModuleWidthMm,
        fixedSumMm,
        availableWidthMm,
      },
    );
  }

  const autoBaseWidthMm = Math.floor(leftoverWidthMm / autoCount);
  const autoRemainderMm = leftoverWidthMm - autoBaseWidthMm * autoCount;
  const moduleWidthsMm = declaredWidthsMm.map((width, index) => {
    if (width !== undefined) {
      return width;
    }
    const autoRank = autoIndexes.indexOf(index);
    return autoRank < autoRemainderMm
      ? autoBaseWidthMm + 1
      : autoBaseWidthMm;
  });

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
 * Ancho máximo que puede declarar el módulo `targetIndex`
 * sin dejar sin espacio a los demás (Fase 3D).
 *
 * Es el espacio disponible menos lo declarado por los
 * demás módulos y el mínimo que necesitan los automáticos
 * (incluido el propio objetivo si es automático), acotado
 * además por el máximo provisional del contrato. Función
 * pura para que la UI ofrezca el límite sin duplicar el
 * cálculo del motor.
 */
export function maxFixedWidthMm(
  input: DistributeModulesInput & { targetIndex: number },
): number {
  const { targetIndex } = input;
  const moduleCount = input.moduleCount;
  const minModuleWidthMm =
    input.minModuleWidthMm ?? WARDROBE_LIMITS.moduleWidthMm.min;
  const declaredWidthsMm = input.declaredWidthsMm;

  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= moduleCount
  ) {
    return 0;
  }

  const usableWidthMm =
    input.totalWidthMm - 2 * input.sideThicknessMm;
  const dividerTotalMm = (moduleCount - 1) * input.dividerThicknessMm;
  const availableWidthMm = usableWidthMm - dividerTotalMm;
  if (availableWidthMm <= 0) {
    return 0;
  }

  const declared = declaredWidthsMm ?? [];
  let fixedOthersMm = 0;
  let autoOthersCount = 0;
  for (let index = 0; index < moduleCount; index += 1) {
    if (index === targetIndex) {
      continue;
    }
    const width = declared[index];
    if (width === undefined) {
      autoOthersCount += 1;
    } else {
      fixedOthersMm += width;
    }
  }

  const spaceMaxMm =
    availableWidthMm - fixedOthersMm - autoOthersCount * minModuleWidthMm;
  return Math.max(
    0,
    Math.min(spaceMaxMm, WARDROBE_LIMITS.moduleWidthMm.max),
  );
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
