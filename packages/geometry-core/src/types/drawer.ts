/**
 * Cajonera: ensamblaje de cajones de un módulo "drawers".
 *
 * Un `DrawerAssembly` agrupa los paneles (ya generados en
 * `GeometryResult.panels` con roles "drawer-*") que forman
 * un cajón: frente, dos laterales, trasera y fondo.
 *
 * Reglas PROVISIONALES (docs/product-rules.md §3):
 * - Entre 1 y 8 cajones por módulo (default 3).
 * - El frente es el panel visible; la caja (laterales,
 *   trasera, fondo) vive detrás del frente.
 * - El cajón permanece cerrado (sin mecanismos de
 *   apertura en esta fase).
 */

/** Cantidad de cajones por defecto (PROVISIONAL). */
export const DEFAULT_DRAWER_COUNT = 3;

/**
 * Especificación de material de cajón por defecto
 * (PROVISIONAL): se aplica cuando la configuración no
 * declara `materials.drawer`.
 */
export const DEFAULT_DRAWER_MATERIAL_SPEC = {
  name: 'Blanco',
  thicknessMm: 15,
  finish: 'mate',
} as const;

/**
 * Ensamblaje de un cajón: relación tipada entre los
 * paneles que lo componen.
 */
export interface DrawerAssembly {
  /** Identificador estable: `drawer-module-{m}-{i}`. */
  id: string;
  /** Módulo "drawers" al que pertenece. */
  moduleId: string;
  /** Orden del cajón dentro del módulo (1-based, de abajo hacia arriba). */
  index: number;
  /** IDs de los paneles del cajón (frente, laterales, trasera, fondo). */
  partIds: readonly string[];
}
