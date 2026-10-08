/**
 * Material: especificación de tablero con identificador resuelto.
 *
 * El espesor forma parte de la geometría (se resta de anchos y alturas),
 * por eso es un dato de cálculo y no solo cosmético (ver ADR-008).
 */

/** Espesores de tablero soportados en Fase 0 (regla confirmada del producto). */
export const BOARD_THICKNESSES_MM = [15, 18] as const;

export type BoardThicknessMm = (typeof BOARD_THICKNESSES_MM)[number];

export function isBoardThicknessMm(value: unknown): value is BoardThicknessMm {
  return (
    typeof value === 'number' &&
    BOARD_THICKNESSES_MM.includes(value as BoardThicknessMm)
  );
}

/** Especificación de material tal como llega en la configuración. */
export interface MaterialSpec {
  name: string;
  thicknessMm: BoardThicknessMm;
  finish: string;
}

/** Material resuelto, con id determinista (p. ej. 'material-structure'). */
export interface Material extends MaterialSpec {
  id: string;
}
