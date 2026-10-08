/**
 * Contrato de configuración del clóset, versión 1.
 *
 * El contrato es JSON-serializable y versionado (ADR-007): toda entrada debe
 * declarar `schemaVersion`; el validador rechaza versiones desconocidas para
 * permitir evolucionar el formato sin romper el motor.
 */

import type { MaterialSpec } from '../types/material.js';
import type { ModuleConfig } from '../types/module.js';
import type { RodMaterial } from '../types/rod.js';

export const WARDROBE_CONFIG_SCHEMA_VERSION = 1;

/**
 * Configuración opcional de barras de colgado.
 *
 * Todos los campos son opcionales (extensión backward compatible
 * del contrato v1): la ausencia del objeto o de un campo usa los
 * valores por defecto provisionales del motor.
 */
export interface HangingRodSpec {
  /** Diámetro en mm. Provisional: 18–60; default 30. */
  diameterMm?: number;
  /** Nombre del material metálico. Default: 'Acero'. */
  name?: string;
  /** Acabado. Default: 'brillo'. */
  finish?: string;
}

export interface WardrobeConfig {
  schemaVersion: typeof WARDROBE_CONFIG_SCHEMA_VERSION;
  /** Dimensiones externas del clóset, en milímetros enteros. */
  dimensions: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
  };
  /** Entre 1 y 4 módulos verticales (regla confirmada del producto). */
  modules: ModuleConfig[];
  materials: {
    structure: MaterialSpec;
    interior: MaterialSpec;
    /**
     * Material de piezas de cajón (opcional; extensión
     * backward compatible del contrato v1). El motor
     * aplica un default provisional si no se declara.
     */
    drawer?: MaterialSpec;
  };
  /** Barras de colgado para módulos "hanging" (opcional). */
  hangingRod?: HangingRodSpec;
}
