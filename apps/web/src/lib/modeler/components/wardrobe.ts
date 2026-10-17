/**
 * Componente paramétrico `furniconfig.wardrobe` v1 (FASE-4B-D, D2).
 *
 * Puente **no destructivo** con el motor existente de clósets: el
 * `WardrobeConfig` v1 íntegro vive en `params` del `ComponentInstance` y la
 * construcción delega en `geometry-core` sin modificarlo:
 *
 *   params (WardrobeConfig v1) → validateWardrobeConfig → calculateGeometry
 *     → adaptación a ComponentPart (cajas y cilindros, sin simplificar)
 *
 * Decisiones de contrato:
 *
 * - **Sin `paramsSchema` declarado**: los límites de fabricación del clóset
 *   viven únicamente en `WARDROBE_LIMITS` (`geometry-core`); duplicarlos
 *   aquí crearía una segunda copia que puede divergir (regla 4 de
 *   `AGENTS.md`). El rango lo valida el propio motor al construir.
 * - **Sin pérdida geométrica**: `Panel` y `Door` → cajas; `HangingRod` y
 *   `DoorHandle` → cilindros con eje, longitud y diámetro exactos.
 *   `DrawerAssembly` no añade piezas: sus `partIds` son paneles ya emitidos.
 * - **Asociaciones funcionales conservadas** (auditoría 4B-D): `moduleId` en
 *   todas las piezas; `hingeSide`/`leafIndex`/`leafCount` en puertas
 *   (recalculan `doorOpeningTransform` para animar); `doorId` en tiradores;
 *   `assemblyId`/`assemblyIndex` en paneles de cajón. Estos datos existen
 *   solo en la salida del motor (no en `params`), por lo que se estampan en
 *   `ComponentPart`.
 * - Posiciones en mm enteros, esquina mínima del bbox (I2), idénticas a las
 *   del motor: la escena renderizada no cambia de dimensiones ni de sitio.
 *
 * Este módulo vive en la capa de composición de la app (depende de
 * `geometry-core` y `modeler-core`); `modeler-core` sigue sin depender de
 * nadie (I5).
 */

import {
  calculateGeometry,
  validateWardrobeConfig,
  type Door,
  type DoorHandle,
  type DrawerAssembly,
  type GeometryResult,
  type HangingRod,
  type Panel,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  SceneError,
  defineComponent,
  type ComponentPart,
  type ParametricComponentDef,
} from '@furniconfig/modeler-core';

/** Tipo registrado del clóset (estable: es la clave del documento). */
export const WARDROBE_COMPONENT_TYPE = 'furniconfig.wardrobe';

/** Versión de la definición (contrato `furniconfig.wardrobe` v1). */
export const WARDROBE_COMPONENT_VERSION = 1;

type MmTuple3 = readonly [number, number, number];

function toMm(position: { x: number; y: number; z: number }): MmTuple3 {
  return [position.x, position.y, position.z];
}

/** `Panel` → caja (posición y tamaño exactos del motor). */
function panelPart(panel: Panel, assembly?: DrawerAssemblyRef): ComponentPart {
  return {
    kind: 'box',
    partId: panel.id,
    role: panel.role,
    sizeMm: toMm(panel.sizeMm),
    positionMm: toMm(panel.positionMm),
    materialId: panel.materialId,
    moduleId: panel.moduleId ?? undefined,
    // agrupación cajón ↔ paneles (solo roles drawer-*): existe únicamente en
    // la salida del motor, así que se conserva aquí para futuras interacciones
    assemblyId: assembly?.id,
    assemblyIndex: assembly?.index,
  };
}

/** `HangingRod` → cilindro paramétrico (sin simplificar a caja). */
function rodPart(rod: HangingRod): ComponentPart {
  return {
    kind: 'cylinder',
    partId: rod.id,
    role: 'hanging-rod',
    axis: rod.axis,
    lengthMm: rod.lengthMm,
    diameterMm: rod.diameterMm,
    positionMm: toMm(rod.positionMm),
    materialId: rod.materialId,
    moduleId: rod.moduleId,
  };
}

/** Hoja de puerta → caja (grosor exacto) + datos de bisagra para animación. */
function doorPart(door: Door): ComponentPart {
  return {
    kind: 'box',
    partId: door.id,
    role: 'door',
    sizeMm: [door.widthMm, door.heightMm, door.thicknessMm],
    positionMm: toMm(door.positionMm),
    materialId: door.materialId,
    moduleId: door.moduleId,
    hingeSide: door.hingeSide,
    leafIndex: door.leafIndex,
    leafCount: door.leafCount,
  };
}

/** Tirador → cilindro horizontal (eje x del motor) + hoja dueña. */
function handlePart(handle: DoorHandle): ComponentPart {
  return {
    kind: 'cylinder',
    partId: handle.id,
    role: 'door-handle',
    axis: handle.axis,
    lengthMm: handle.lengthMm,
    diameterMm: handle.diameterMm,
    positionMm: toMm(handle.positionMm),
    materialId: handle.materialId,
    moduleId: handle.moduleId,
    doorId: handle.doorId,
  };
}

interface DrawerAssemblyRef {
  readonly id: string;
  readonly index: number;
}

/** Mapa panel → ensamblaje de cajón (partId → { id, index }). */
function drawerAssemblyByPart(
  drawers: readonly DrawerAssembly[],
): Map<string, DrawerAssemblyRef> {
  const map = new Map<string, DrawerAssemblyRef>();
  for (const drawer of drawers) {
    for (const partId of drawer.partIds) {
      map.set(partId, { id: drawer.id, index: drawer.index });
    }
  }
  return map;
}

/** Convierte el resultado completo del motor a piezas de escena (1:1). */
export function geometryResultToParts(result: GeometryResult): ComponentPart[] {
  const assemblies = drawerAssemblyByPart(result.drawers);
  return [
    ...result.panels.map((panel) => panelPart(panel, assemblies.get(panel.id))),
    ...result.rods.map(rodPart),
    ...result.doors.map(doorPart),
    ...result.handles.map(handlePart),
  ];
}

function wardrobeParamsToConfig(
  params: Readonly<Record<string, unknown>>,
): WardrobeConfig {
  const validation = validateWardrobeConfig(params);
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new SceneError(
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      `Parámetros de ${WARDROBE_COMPONENT_TYPE} rechazados por el motor: ${first?.message ?? 'configuración inválida'} (${first?.field ?? 'config'})`,
      { component: WARDROBE_COMPONENT_TYPE, field: first?.field ?? 'config' },
    );
  }
  return validation.config;
}

/**
 * Definición completa del clóset. `build` es pura y determinista: el motor
 * `calculateGeometry` es determinista (misma config → mismos `Panel[]`), y
 * el orden de emisión de las piezas es fijo (paneles, barras, puertas,
 * tiradores).
 */
export const wardrobeComponent: ParametricComponentDef = defineComponent({
  type: WARDROBE_COMPONENT_TYPE,
  version: WARDROBE_COMPONENT_VERSION,
  build(params) {
    const config = wardrobeParamsToConfig(params);
    try {
      return { parts: geometryResultToParts(calculateGeometry(config)) };
    } catch (error) {
      if (error instanceof SceneError) throw error;
      throw new SceneError(
        'ERR_SCENE_PARAMS_OUT_OF_RANGE',
        `El motor rechazó la configuración del clóset: ${error instanceof Error ? error.message : String(error)}`,
        { component: WARDROBE_COMPONENT_TYPE },
      );
    }
  },
});
