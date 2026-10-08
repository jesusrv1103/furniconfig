/**
 * Barra de colgado: componente cilíndrico de un módulo "hanging".
 *
 * Reglas PROVISIONALES (docs/product-rules.md §3):
 * - Eje X (horizontal, a lo ancho del módulo).
 * - Longitud = ancho interior útil del módulo.
 * - Centro a `mountDistanceMm` por debajo de la cara inferior
 *   del tablero superior.
 * - Centrada en la profundidad (Z).
 * - Diámetro configurable (18–60 mm, default 30 mm).
 *
 * La posición sigue la convención de Panel: `positionMm` es la
 * esquina mínima del envolvente (bbox), en milímetros.
 */

/** Eje de orientación de la barra. */
export type RodAxis = 'x' | 'y' | 'z';

/** Diámetro por defecto (PROVISIONAL). */
export const DEFAULT_ROD_DIAMETER_MM = 30;

/** Nombre por defecto del material metálico (PROVISIONAL). */
export const DEFAULT_ROD_NAME = 'Acero';

/** Acabado por defecto del material metálico (PROVISIONAL). */
export const DEFAULT_ROD_FINISH = 'brillo';

export interface HangingRod {
  id: string;
  moduleId: string;
  axis: RodAxis;
  lengthMm: number;
  diameterMm: number;
  /** Esquina mínima del envolvente (bbox), en milímetros. */
  positionMm: { x: number; y: number; z: number };
  materialId: string;
}

/** Material metálico resuelto para barras de colgado (no es un tablero: sin espesor). */
export interface RodMaterial {
  id: string;
  name: string;
  finish: string;
}
