/**
 * Selección de módulos del Studio (Fase 3C).
 *
 * Capa pura entre la geometría resuelta del motor y el
 * estado de selección de la interfaz:
 *
 * - La selección usa los ids DETERMINISTAS del motor
 *   (`module-N`, estables entre recálculos mientras el
 *   módulo siga existiendo en su índice).
 * - La correspondencia clic → módulo nace de los
 *   `moduleId` que el motor ya asigna a paneles, barras,
 *   cajones y puertas: React no duplica cálculos del motor.
 * - Si la configuración queda inválida (sin geometría) no
 *   se puede verificar la existencia del módulo: se
 *   conserva la selección y se resuelve al recuperarse.
 *   Si el módulo desaparece, la selección se limpia.
 *
 * Esta es la pieza específica de la familia "clóset"
 * dentro del Studio; una nueva familia aportaría su propio
 * contrato y su mapeo de selección sin tocar el historial
 * ni la capa de presentación.
 */

import type {
  GeometryResult,
  Module,
} from '@furniconfig/geometry-core';

/** Términos amigables del tipo de módulo (lenguaje de usuario). */
export const MODULE_KIND_FRIENDLY: Readonly<Record<Module['kind'], string>> =
  {
    shelves: 'Repisas',
    hanging: 'Espacio para colgar',
    drawers: 'Cajones',
  };

/**
 * Resuelve la selección vigente contra la geometría actual.
 *
 * - Sin selección → null.
 * - Sin geometría (config inválida) → se conserva el id
 *   (no puede verificarse; se reevaluará al recuperarse).
 * - Con geometría → el id solo sobrevive si el módulo existe.
 */
export function resolveSelection(
  geometry: GeometryResult | null,
  selectedId: string | null,
): string | null {
  if (selectedId === null) {
    return null;
  }
  if (geometry === null) {
    return selectedId;
  }
  return geometry.wardrobe.modules.some((module) => module.id === selectedId)
    ? selectedId
    : null;
}

export interface ModuleContext {
  /** Id estable del módulo en el motor. */
  id: string;
  /** Índice en `config.modules` (el motor preserva el orden). */
  index: number;
  /** Número de módulo (1-based) para mostrar. */
  number: number;
  /** Módulo resuelto por el motor (dimensiones útiles). */
  resolved: Module;
}

/**
 * Contexto del módulo seleccionado: null sin selección o
 * si el módulo ya no existe en la geometría.
 */
export function moduleContext(
  geometry: GeometryResult | null,
  selectedId: string | null,
): ModuleContext | null {
  if (geometry === null || selectedId === null) {
    return null;
  }
  const index = geometry.wardrobe.modules.findIndex(
    (module) => module.id === selectedId,
  );
  const resolved = geometry.wardrobe.modules[index];
  if (index < 0 || resolved === undefined) {
    return null;
  }
  return { id: selectedId, index, number: index + 1, resolved };
}

/** Caja alineada a ejes en milímetros. */
export interface MmBounds {
  min: [number, number, number];
  max: [number, number, number];
}

function includeBox(
  bounds: { min: [number, number, number]; max: [number, number, number] },
  positionMm: { x: number; y: number; z: number },
  sizeMm: { x: number; y: number; z: number },
): void {
  bounds.min[0] = Math.min(bounds.min[0], positionMm.x);
  bounds.min[1] = Math.min(bounds.min[1], positionMm.y);
  bounds.min[2] = Math.min(bounds.min[2], positionMm.z);
  bounds.max[0] = Math.max(bounds.max[0], positionMm.x + sizeMm.x);
  bounds.max[1] = Math.max(bounds.max[1], positionMm.y + sizeMm.y);
  bounds.max[2] = Math.max(bounds.max[2], positionMm.z + sizeMm.z);
}

/**
 * Envolvente (mm) de un módulo: sus paneles (incluye piezas
 * de cajón), su barra de colgado y sus hojas de puerta.
 *
 * Los paneles globales (laterales, divisiones, superior,
 * inferior, fondo) tienen `moduleId = null` y quedan fuera:
 * el encuadre se centra en las piezas del propio módulo.
 * Devuelve null si el módulo no existe o no aporta piezas.
 */
export function moduleBoundsMm(
  geometry: GeometryResult | null,
  selectedId: string | null,
): MmBounds | null {
  if (geometry === null || selectedId === null) {
    return null;
  }
  const bounds = {
    min: [Infinity, Infinity, Infinity] as [number, number, number],
    max: [-Infinity, -Infinity, -Infinity] as [number, number, number],
  };
  let found = false;

  for (const panel of geometry.panels) {
    if (panel.moduleId === selectedId) {
      includeBox(bounds, panel.positionMm, panel.sizeMm);
      found = true;
    }
  }
  for (const rod of geometry.rods) {
    if (rod.moduleId !== selectedId) {
      continue;
    }
    // Bbox del cilindro según su eje (la posición es la
    // esquina mínima del envolvente, convención del motor).
    const sizeMm =
      rod.axis === 'x'
        ? { x: rod.lengthMm, y: rod.diameterMm, z: rod.diameterMm }
        : rod.axis === 'y'
          ? { x: rod.diameterMm, y: rod.lengthMm, z: rod.diameterMm }
          : { x: rod.diameterMm, y: rod.diameterMm, z: rod.lengthMm };
    includeBox(bounds, rod.positionMm, sizeMm);
    found = true;
  }
  for (const door of geometry.doors) {
    if (door.moduleId === selectedId) {
      includeBox(bounds, door.positionMm, {
        x: door.widthMm,
        y: door.heightMm,
        z: door.thicknessMm,
      });
      found = true;
    }
  }

  if (!found) {
    return null;
  }
  return { min: bounds.min, max: bounds.max };
}
