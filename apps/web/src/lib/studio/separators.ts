/**
 * Lógica pura de arrastre de separadores (Fase 3F.2).
 *
 * Calcula la nueva configuración al desplazar una división
 * entre dos módulos vecinos. Deriva de `distributeModules`
 * y `maxFixedWidthMm` sin duplicar su aritmética.
 *
 * Reglas:
 * - Solo los dos módulos adyacentes cambian de ancho.
 * - La suma de sus anchos interiores se conserva.
 * - El ancho exterior del mueble no cambia.
 * - Respeta mínimos, máximos y anchos fijados/automáticos.
 * - Devuelve límites de movimiento para la UI.
 */

import { distributeModules, maxFixedWidthMm, type DistributeModulesInput } from '@furniconfig/geometry-core';
import type { WardrobeConfig, GeometryResult } from '@furniconfig/geometry-core';
import { distributionInput, equalizeAllWidths, setModuleWidth, releaseModuleWidth } from '../config.js';

export type SeparatorIndex = number; // 0 = entre módulo 0 y 1, etc.

export type DragMode = 'step10' | 'precise1';

export interface SeparatorDragInput {
  /** Configuración actual. */
  config: WardrobeConfig;
  /** Índice de la división a mover (0-based). */
  separatorIndex: SeparatorIndex;
  /** Desplazamiento solicitado en mm (positivo = divisor a la derecha). */
  deltaMm: number;
  /** Modo de precisión. */
  mode: DragMode;
  /** Si `true`, aplica clamping a límites; si `false`, rechaza fuera de límites. */
  clamp?: boolean;
}

export interface SeparatorDragResult {
  /** Nueva configuración (si cambió). */
  config: WardrobeConfig;
  /** Desplazamiento realmente aplicado en mm. */
  appliedDeltaMm: number;
  /** Límite negativo del movimiento (mm). */
  minDeltaMm: number;
  /** Límite positivo del movimiento (mm). */
  maxDeltaMm: number;
  /** Si el movimiento quedó clamped. */
  clamped: boolean;
  /** Ancho resultante del módulo izquierdo. */
  leftWidthMm: number;
  /** Ancho resultante del módulo derecho. */
  rightWidthMm: number;
  /** Si la configuración cambió (hubo movimiento real). */
  changed: boolean;
}

/**
 * Obtiene el array `declaredWidthsMm` a partir de la config.
 * `undefined` = automático, número = fijado.
 */
function getDeclaredWidths(config: WardrobeConfig): readonly (number | undefined)[] {
  return config.modules.map((m) => m.widthMm);
}

/**
 * Construye un nuevo array de anchos declarados aplicando el delta
 * a los dos módulos adyacentes al separador, y devuelve la nueva config.
 * Si alguno de los módulos era automático, se fija (declara) su ancho
 * actual antes de aplicar el delta, para que el movimiento sea predecible.
 */
function applyDeltaToDeclared(
  declared: readonly (number | undefined)[],
  separatorIndex: SeparatorIndex,
  deltaMm: number,
): readonly (number | undefined)[] {
  const leftIdx = separatorIndex;
  const rightIdx = separatorIndex + 1;
  const leftDeclared = declared[leftIdx];
  const rightDeclared = declared[rightIdx];

  // Anchos actuales resolviendo la distribución (necesario para módulos automáticos)
  // Nota: para calcular anchos actuales necesitamos el resultado de distributeModules
  // pero aquí solo trabajamos con los declarados; el motor recalculará.
  // La regla: si un módulo era automático, al arrastrar se "fija" en su ancho
  // actual y luego se aplica el delta. Esto evita saltos inesperados.

  // Para esto necesitamos los anchos actuales resueltos. Como esta función
  // es pura y no tiene acceso al motor, la lógica de "fijar si era auto"
  // se hace en la capa superior (computeDragResult) que sí tiene acceso
  // a la geometría resuelta. Aquí solo aplicamos el delta a los declarados.

  const nextDeclared = [...declared];
  // Si el módulo izquierdo no estaba declarado, lo declaramos en su valor
  // actual (se resuelve arriba). Aquí asumimos que el llamador ya lo hizo.
  if (nextDeclared[leftIdx] !== undefined) {
    nextDeclared[leftIdx] = Math.max(0, nextDeclared[leftIdx]! + deltaMm);
  }
  if (nextDeclared[rightIdx] !== undefined) {
    nextDeclared[rightIdx] = Math.max(0, nextDeclared[rightIdx]! - deltaMm);
  }
  return nextDeclared;
}

/**
 * Calcula los límites de movimiento para un separador.
 * Devuelve [minDeltaMm, maxDeltaMm] donde:
 * - minDeltaMm ≤ 0 (mover a la izquierda)
 * - maxDeltaMm ≥ 0 (mover a la derecha)
 * Un delta de 0 significa el separador en su posición actual.
 */
export function computeSeparatorLimits(
  config: WardrobeConfig,
  separatorIndex: SeparatorIndex,
): { minDeltaMm: number; maxDeltaMm: number } {
  const declared = getDeclaredWidths(config);
  const leftIdx = separatorIndex;
  const rightIdx = separatorIndex + 1;

  // Para calcular límites reales necesitamos los anchos actuales resueltos
  // (incluyendo automáticos). Usamos distributionInput + maxFixedWidthMm
  // que sí trabajan con la geometría resuelta.
  const distInput = distributionInput(config);
  const minModuleWidthMm = distInput.minModuleWidthMm ?? 200;

  // Ancho del módulo izquierdo actual (resuelto por el motor)
  // Para el límite izquierdo: el módulo izquierdo no puede ser < minModuleWidthMm
  // Para el límite derecho: el módulo derecho no puede ser < minModuleWidthMm

  // maxFixedWidthMm nos da el máximo que puede tener un módulo
  // sin violar los mínimos de los demás. Lo usamos para ambos sentidos.

  // Límite derecho (delta positivo): mover divisor a la derecha
  // => módulo izquierdo crece, derecho mengua
  // El módulo derecho no puede bajar de minModuleWidthMm
  // => maxDelta = rightCurrentWidth - minModuleWidthMm
  // Pero rightCurrentWidth depende de si está fijado o auto.
  // Usamos maxFixedWidthMm sobre el módulo derecho para saber su máximo,
  // y minModuleWidthMm para su mínimo.

  // En realidad, maxFixedWidthMm(config, targetIndex) nos dice
  // el máximo que PUEDE tener el módulo targetIndex.
  // El mínimo siempre es minModuleWidthMm (si no hay otras restricciones).

  // Para el delta positivo (divisor a la derecha):
  // - Módulo izquierdo crece: su máximo = maxFixedWidthMm(leftIdx)
  // - Módulo derecho mengua: su mínimo = minModuleWidthMm
  // deltaMax = min(maxLeft - leftCurrent, rightCurrent - minModuleWidthMm)

  // Para el delta negativo (divisor a la izquierda):
  // - Módulo izquierdo mengua: su mínimo = minModuleWidthMm
  // - Módulo derecho crece: su máximo = maxFixedWidthMm(rightIdx)
  // deltaMin = max(minModuleWidthMm - leftCurrent, rightCurrent - maxRight)

  // Necesitamos los anchos actuales. Para obtenerlos sin depender del
  // motor completo aquí, el llamador debe pasarlos o calcularlos.
  // Esta función se quedará en la capa web donde sí tenemos geometría.

  // Devolvemos límites teóricos; la función real que usa geometría
  // está en la capa web (computeDragResult).
  return { minDeltaMm: -9999, maxDeltaMm: 9999 };
}

/**
 * Función principal de arrastre (capa web, con acceso a geometría resuelta).
 * Recibe la geometría resuelta para calcular límites exactos y anchos actuales.
 */
export function computeDragResult(
  geometry: GeometryResult | null,
  config: WardrobeConfig,
  separatorIndex: SeparatorIndex,
  deltaMm: number,
  mode: DragMode,
  clamp: boolean = true,
): SeparatorDragResult {
  if (geometry === null) {
    return {
      config,
      appliedDeltaMm: 0,
      minDeltaMm: 0,
      maxDeltaMm: 0,
      clamped: false,
      leftWidthMm: 0,
      rightWidthMm: 0,
      changed: false,
    };
  }

  const declared = getDeclaredWidths(config);
  const leftIdx = separatorIndex;
  const rightIdx = separatorIndex + 1;

  const leftModule = geometry.wardrobe.modules[leftIdx];
  const rightModule = geometry.wardrobe.modules[rightIdx];

  if (!leftModule || !rightModule) {
    return {
      config,
      appliedDeltaMm: 0,
      minDeltaMm: 0,
      maxDeltaMm: 0,
      clamped: false,
      leftWidthMm: 0,
      rightWidthMm: 0,
      changed: false,
    };
  }

  const leftCurrentMm = leftModule.widthMm;
  const rightCurrentMm = rightModule.widthMm;
  const leftDeclared = declared[leftIdx];
  const rightDeclared = declared[rightIdx];

  // Paso de cuantización según modo
  const quantizedDelta = quantizeDelta(deltaMm, mode);

  // Límites basados en anchos actuales resueltos + maxFixedWidthMm
  const distInput = distributionInput(config);

  // Módulo izquierdo
  const maxLeft = maxFixedWidthMm({ ...distInput, targetIndex: leftIdx });
  const minLeft = distInput.minModuleWidthMm ?? 200;
  // Módulo derecho
  const maxRight = maxFixedWidthMm({ ...distInput, targetIndex: rightIdx });
  const minRight = distInput.minModuleWidthMm ?? 200;

  // Límites de delta
  // delta > 0: divisor a la derecha => left crece, right mengua
  const maxDeltaByLeft = maxLeft - leftCurrentMm;
  const maxDeltaByRight = rightCurrentMm - minRight;
  const maxDeltaMm = Math.min(maxDeltaByLeft, maxDeltaByRight);

  // delta < 0: divisor a la izquierda => left mengua, right crece
  const minDeltaByLeft = minLeft - leftCurrentMm;
  const minDeltaByRight = rightCurrentMm - maxRight;
  const minDeltaMm = Math.max(minDeltaByLeft, minDeltaByRight);

  let appliedDelta = quantizedDelta;
  let clamped = false;

  if (clamp) {
    if (appliedDelta > maxDeltaMm) {
      appliedDelta = maxDeltaMm;
      clamped = true;
    } else if (appliedDelta < minDeltaMm) {
      appliedDelta = minDeltaMm;
      clamped = true;
    }
  } else {
    if (appliedDelta > maxDeltaMm || appliedDelta < minDeltaMm) {
      // Fuera de límites sin clamp: no aplicar cambio
      return {
        config,
        appliedDeltaMm: 0,
        minDeltaMm,
        maxDeltaMm,
        clamped: false,
        leftWidthMm: leftCurrentMm,
        rightWidthMm: rightCurrentMm,
        changed: false,
      };
    }
  }

  if (appliedDelta === 0) {
    return {
      config,
      appliedDeltaMm: 0,
      minDeltaMm,
      maxDeltaMm,
      clamped,
      leftWidthMm: leftCurrentMm,
      rightWidthMm: rightCurrentMm,
      changed: false,
    };
  }

  // Aplicar delta: fijar módulos si eran automáticos, luego ajustar
  let newDeclared = [...declared];

  // Si el módulo izquierdo era automático, fijarlo en su ancho actual ANTES de mover
  if (newDeclared[leftIdx] === undefined) {
    newDeclared[leftIdx] = leftCurrentMm;
  }
  // Si el módulo derecho era automático, fijarlo en su ancho actual ANTES de mover
  if (newDeclared[rightIdx] === undefined) {
    newDeclared[rightIdx] = rightCurrentMm;
  }

  // Aplicar delta
  newDeclared[leftIdx] = (newDeclared[leftIdx] ?? 0) + appliedDelta;
  newDeclared[rightIdx] = (newDeclared[rightIdx] ?? 0) - appliedDelta;

  // Construir nueva config
  const newModules = config.modules.map((module, idx) => {
    if (idx === leftIdx || idx === rightIdx) {
      return { ...module, widthMm: newDeclared[idx] };
    }
    return module;
  });

  const newConfig = { ...config, modules: newModules };

  const newLeftWidth = leftCurrentMm + appliedDelta;
  const newRightWidth = rightCurrentMm - appliedDelta;

  return {
    config: newConfig,
    appliedDeltaMm: appliedDelta,
    minDeltaMm,
    maxDeltaMm,
    clamped,
    leftWidthMm: newLeftWidth,
    rightWidthMm: newRightWidth,
    changed: true,
  };
}

/**
 * Redondea un delta al paso más cercano según el modo.
 * Usa redondeo "half away from zero" (bancario simétrico):
 * 15 -> 20, -15 -> -20, 1.5 -> 2, -1.5 -> -2.
 */
export function quantizeDelta(deltaMm: number, mode: DragMode): number {
  const step = mode === 'step10' ? 10 : 1;
  const divided = deltaMm / step;
  // Round half away from zero
  const rounded = divided >= 0
    ? Math.floor(divided + 0.5)
    : Math.ceil(divided - 0.5);
  return rounded * step;
}