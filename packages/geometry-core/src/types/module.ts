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
}
