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
import type {
  DoorHingeSide,
  DoorLeafCount,
} from '../types/door.js';

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

/**
 * Configuración de puertas abatibles (Fase 2C).
 *
 * La presencia del objeto activa las puertas
 * (una o dos hojas por módulo); su ausencia
 * las desactiva. El motor genera las hojas
 * cerradas: la apertura es una transformación
 * de presentación (`doorOpeningTransform`).
 */
export interface DoorsConfig {
  /** Hojas por módulo: 1 o 2 (PROVISIONAL). */
  leaves: DoorLeafCount;
  /**
   * Lado de la bisagra para una hoja
   * (PROVISIONAL; default 'left'). Con dos
   * hojas se ignora: las bisagras van en
   * los extremos exteriores.
   */
  hingeSide?: DoorHingeSide;
  /**
   * Holgura en mm entre hojas y bordes del
   * módulo (PROVISIONAL: 0–10; default 3).
   */
  clearanceMm?: number;
  /** Material de las hojas (opcional; default: estructura). */
  material?: MaterialSpec;
}

/**
 * Configuración del panel trasero (Fase 2C).
 *
 * `enabled` activa/desactiva el panel (montaje
 * por encaje, PROVISIONAL: ocupa el plano
 * posterior entre laterales y entre superior
 * e inferior).
 */
export interface BackPanelConfig {
  /** Activa o desactiva el panel trasero. */
  enabled: boolean;
  /** Espesor del tablero trasero: 15 o 18 mm. */
  thicknessMm: MaterialSpec['thicknessMm'];
  /** Material (opcional; default: estructura). */
  material?: MaterialSpec;
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
    /** Material de hojas de puerta (opcional; default: estructura). */
    door?: MaterialSpec;
    /** Material del panel trasero (opcional; default: estructura). */
    back?: MaterialSpec;
  };
  /** Barras de colgado para módulos "hanging" (opcional). */
  hangingRod?: HangingRodSpec;
  /** Puertas abatibles (opcional; ausencia = sin puertas). */
  doors?: DoorsConfig;
  /** Panel trasero (opcional; ausencia = sin panel trasero). */
  backPanel?: BackPanelConfig;
}
