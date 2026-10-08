/**
 * Derivación pura del estado geométrico de la aplicación.
 *
 * El motor (@furniconfig/geometry-core) es la fuente única
 * de verdad: la UI nunca calcula geometría por su cuenta.
 *
 * Dos causas de estado inválido, ambas controladas:
 * 1. Errores de forma: la configuración no pasa
 *    `validateWardrobeConfig`.
 * 2. Errores geométricos: pasa la validación pero es
 *    inviable (ancho insuficiente, barra que no cabe en
 *    la altura): el motor lanza `GeometryError`.
 *
 * Cualquier otro error se propaga: es un defecto de
 * programación y no debe ocultarse.
 */

import {
  GeometryError,
  calculateGeometry,
  validateWardrobeConfig,
  type GeometryResult,
  type ValidationResult,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';

export interface DerivedGeometryState {
  validation: ValidationResult;
  /** Geometría calculada; null si la configuración es inviable. */
  geometry: GeometryResult | null;
  /** Error geométrico capturado del motor; null si no hubo. */
  geometryError: GeometryError | null;
}

export function deriveGeometryState(
  config: WardrobeConfig,
): DerivedGeometryState {
  const validation = validateWardrobeConfig(config);
  if (!validation.ok) {
    return { validation, geometry: null, geometryError: null };
  }

  try {
    return {
      validation,
      geometry: calculateGeometry(validation.config),
      geometryError: null,
    };
  } catch (error) {
    if (error instanceof GeometryError) {
      return { validation, geometry: null, geometryError: error };
    }
    throw error;
  }
}
