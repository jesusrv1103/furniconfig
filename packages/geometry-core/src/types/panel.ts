/**
 * Panel: pieza de tablero con dimensiones y posición.
 *
 * Convención (ADR-004): unidad mm; X = ancho, Y = alto, Z = profundidad;
 * `positionMm` es la esquina mínima del panel, con origen en la esquina
 * inferior-izquierda-frontal del mueble.
 */

export type PanelRole =
  | 'side'
  | 'top'
  | 'bottom'
  | 'divider'
  | 'shelf'
  | 'drawer-front'
  | 'drawer-side'
  | 'drawer-back'
  | 'drawer-bottom';

export interface Panel {
  id: string;
  role: PanelRole;
  /** Módulo al que pertenece; null en paneles globales (laterales, superior, inferior). */
  moduleId: string | null;
  materialId: string;
  sizeMm: { x: number; y: number; z: number };
  positionMm: { x: number; y: number; z: number };
}
