/**
 * Módulos del clóset: unidades verticales que componen el mueble.
 *
 * En configuración (`ModuleConfig`) el módulo solo declara su tipo y opciones;
 * el motor lo resuelve (`Module`) con dimensiones internas útiles en mm.
 */

export const MODULE_KINDS = ['shelves', 'hanging', 'drawers'] as const;

export type ModuleKind = (typeof MODULE_KINDS)[number];

export function isModuleKind(value: unknown): value is ModuleKind {
  return (
    typeof value === 'string' && MODULE_KINDS.includes(value as ModuleKind)
  );
}

/** Módulo en la configuración de entrada. */
export interface ModuleConfig {
  kind: ModuleKind;
  /** Cantidad de entrepaños; obligatorio solo para kind = 'shelves'. */
  shelves?: number;
  /**
   * Cantidad de cajones; opcional para kind = 'drawers'
   * (extensión backward compatible del contrato v1:
   * la ausencia usa el default provisional del motor).
   */
  drawers?: number;
  /**
   * Ancho interior libre del módulo en mm (Fase 3D;
   * extensión backward compatible del contrato v1).
   *
   * Es el espacio ÚTIL entre divisiones/laterales — la
   * misma semántica que `Module.widthMm` resuelto — no
   * una medida nominal que incluya tableros: los tableros
   * son piezas separadas y la conservación exacta es
   * Σ(anchos libres) + divisiones + 2 · laterales =
   * ancho exterior.
   *
   * La ausencia significa "automático": el motor reparte
   * el espacio restante por igual (residuo 1 mm de
   * izquierda a derecha). Si TODOS los módulos declaran
   * ancho, la suma debe coincidir exactamente con el
   * espacio disponible. Rango provisional al declarar:
   * `WARDROBE_LIMITS.moduleWidthMm` (300–2000 mm).
   */
  widthMm?: number;
}

/** Módulo resuelto, con dimensiones internas útiles en milímetros. */
export interface Module {
  id: string;
  kind: ModuleKind;
  /** Ancho interno útil (entre divisiones o laterales). */
  widthMm: number;
  /** Alto interno útil (entre tableros superior e inferior). */
  heightMm: number;
  depthMm: number;
  /** Presente solo en módulos de tipo 'shelves'. */
  shelves?: number;
  /**
   * Presente solo en módulos de tipo 'drawers'
   * (siempre resuelto: usa el default si la configuración
   * no lo declaró).
   */
  drawers?: number;
}
