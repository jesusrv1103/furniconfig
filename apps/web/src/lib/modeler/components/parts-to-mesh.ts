/**
 * FASE-4C-D, D2 — adaptador `ComponentPart` (mm, marco local) →
 * geometrías de Three.js (metros, ya posicionadas).
 *
 * Reglas (§3 del mandate 4C-D):
 *
 * - **Conservación EXACTA**: cajas y cilindros con sus dimensiones,
 *   posiciones y orientaciones tal como las emite el motor
 *   paramétrico; sin aproximaciones silenciosas (el medio mm que el
 *   motor emite legítimamente, p. ej. centrando barras, se preserva).
 * - La geometría nace en el **marco local** del componente (esquina
 *   mínima `[0, 0, 0]`, I2); el grupo se traslada por
 *   `transform.positionMm` al renderizar.
 * - mm→m se hace **UNA sola vez** aquí (`mmToM`), siguiendo la
 *   frontera de unidades de `mesh-to-renderable.ts`.
 * - **Metadatos preservados** en los datos de render: `role`,
 *   `materialId`, `moduleId`, `assemblyId`/`assemblyIndex` (cajones),
 *   `doorId` (tiradores) y `hingeSide`/`leafIndex`/`leafCount`
 *   (puertas) — el picking resuelve el objeto COMPLETO y las
 *   futuras herramientas tienen su asociación sin volver al motor.
 * - **Ciclo de vida**: `retainComponentParts` contabiliza la
 *   adopción (`created`) y la liberación idempotente (`disposed`);
 *   en una escena sin fugas `disposed` alcanza a `created`
 *   (paridad con `geometryLifecycle` de los sólidos). El montaje
 *   doble de `StrictMode` rearma la retención en lugar de dejarla
 *   muerta: el release definitivo siempre dispone de verdad
 *   (ver `retainComponentParts`).
 *
 * Los cilindros se tesselan con 24 segmentos radiales: la
 * presentación es malla, pero diámetro, longitud y eje siguen
 * siendo exactos (una malla NO puede representar un cilindro
 * matemático; la teselación es inherente al render, no una
 * simplificación de la geometría).
 */

import {
  BoxGeometry,
  CylinderGeometry,
  type BufferGeometry,
} from 'three';
import type { ComponentPart } from '@furniconfig/modeler-core';

import { mmToM } from '../../units.js';

/** Segmentos radiales de un cilindro renderizado (presentación). */
const CYLINDER_RADIAL_SEGMENTS = 24;

/**
 * Color determinista por `materialId` del motor (presentación
 * PROVISIONAL: no es un acabado fotorrealista, solo distingue
 * materiales entre sí de forma estable).
 */
const MATERIAL_COLORS: Readonly<Record<string, string>> = {
  'material-structure': '#c59a6d',
  'material-interior': '#ece7e0',
  'material-drawer': '#d8c3a5',
  'material-door': '#b5885a',
  'material-back': '#cfc8bd',
  'material-rod': '#9aa3ad',
  'material-handle': '#7d8590',
};

/** Color de presentación de una pieza (fallback estable por hash). */
export function partColor(materialId: string | null | undefined): string {
  if (materialId !== null && materialId !== undefined) {
    const known = MATERIAL_COLORS[materialId];
    if (known !== undefined) return known;
  }
  return '#b9a58c';
}

/** Pieza preparada para renderizar (geometría en metros, marco local). */
export interface PartRenderData {
  /** Id namespaced estable (`objeto::pieza`), idéntico al del motor. */
  readonly partId: string;
  readonly objectId: string;
  readonly role: string;
  readonly kind: 'box' | 'cylinder';
  readonly geometry: BufferGeometry;
  readonly color: string;
  readonly materialId: string | null;
  readonly moduleId?: string;
  readonly assemblyId?: string;
  readonly assemblyIndex?: number;
  readonly doorId?: string;
  readonly hingeSide?: 'left' | 'right';
  readonly leafIndex?: number;
  readonly leafCount?: 1 | 2;
}

/** Geometría de render de un componente completo. */
export interface ComponentPartsRenderData {
  readonly objectId: string;
  readonly parts: readonly PartRenderData[];
}

/**
 * Contadores de ciclo de vida (instrumentación 4C-D, §8 prueba 13):
 * en una escena sin fugas, `disposed` alcanza a `created` tras
 * sustituir o desmontar todas las piezas.
 */
export const partsGeometryLifecycle = { created: 0, disposed: 0 };

/** Id del objeto dueño de una pieza namespaced (`objeto::local`). */
export function componentPartObjectId(partId: string): string {
  const separator = partId.indexOf('::');
  return separator < 0 ? partId : partId.slice(0, separator);
}

type BoxPart = Extract<ComponentPart, { readonly kind: 'box' }>;
type CylinderPart = Extract<ComponentPart, { readonly kind: 'cylinder' }>;

/**
 * Caja exacta: `BoxGeometry(size)` trasladada al centro derivado de la
 * esquina mínima (`positionMm` es la esquina mínima del bbox, I2).
 */
function boxPartGeometry(part: BoxPart): BufferGeometry {
  const [wMm, hMm, dMm] = part.sizeMm;
  const geometry = new BoxGeometry(mmToM(wMm), mmToM(hMm), mmToM(dMm));
  geometry.translate(
    mmToM(part.positionMm[0] + wMm / 2),
    mmToM(part.positionMm[1] + hMm / 2),
    mmToM(part.positionMm[2] + dMm / 2),
  );
  return geometry;
}

/**
 * Cilindro exacto: eje, longitud y diámetro del motor. La primitiva
 * de Three nace sobre el eje Y y se rota al eje de la pieza antes de
 * trasladarla al centro de su bbox.
 */
function cylinderPartGeometry(part: CylinderPart): BufferGeometry {
  const radiusM = mmToM(part.diameterMm / 2);
  const lengthM = mmToM(part.lengthMm);
  const geometry = new CylinderGeometry(
    radiusM,
    radiusM,
    lengthM,
    CYLINDER_RADIAL_SEGMENTS,
  );
  const [xMm, yMm, zMm] = part.positionMm;
  const halfDiameter = part.diameterMm / 2;
  if (part.axis === 'x') {
    geometry.rotateZ(Math.PI / 2);
    geometry.translate(
      mmToM(xMm + part.lengthMm / 2),
      mmToM(yMm + halfDiameter),
      mmToM(zMm + halfDiameter),
    );
  } else if (part.axis === 'z') {
    geometry.rotateX(Math.PI / 2);
    geometry.translate(
      mmToM(xMm + halfDiameter),
      mmToM(yMm + halfDiameter),
      mmToM(zMm + part.lengthMm / 2),
    );
  } else {
    geometry.translate(
      mmToM(xMm + halfDiameter),
      mmToM(yMm + part.lengthMm / 2),
      mmToM(zMm + halfDiameter),
    );
  }
  return geometry;
}

function partToRenderData(part: ComponentPart): PartRenderData {
  const common = {
    partId: part.partId,
    // Dueño derivado del namespace del motor (`objeto::pieza`): no se
    // inventa ningún identificador. Con piezas del propio objeto
    // coincide siempre con `objectId`.
    objectId: componentPartObjectId(part.partId),
    role: part.role,
    color: partColor(part.materialId),
    materialId: part.materialId ?? null,
    moduleId: part.moduleId,
  };
  if (part.kind === 'box') {
    return {
      ...common,
      kind: 'box',
      geometry: boxPartGeometry(part),
      assemblyId: part.assemblyId,
      assemblyIndex: part.assemblyIndex,
      hingeSide: part.hingeSide,
      leafIndex: part.leafIndex,
      leafCount: part.leafCount,
    };
  }
  return {
    ...common,
    kind: 'cylinder',
    geometry: cylinderPartGeometry(part),
    doorId: part.doorId,
  };
}

/**
 * Convierte las piezas de un componente a datos de render. Pura: no
 * muta las piezas de entrada. La creación NO contabiliza: el ciclo
 * de vida cuenta la ADOPCIÓN (`retainComponentParts.adopt`), igual
 * que en los sólidos (el doble render de `StrictMode` en dev puede
 * descartar geometrías nunca montadas: basura GC, sin fuga).
 */
export function toComponentPartsRenderData(
  objectId: string,
  parts: readonly ComponentPart[],
): ComponentPartsRenderData {
  return {
    objectId,
    parts: parts.map((part) => partToRenderData(part)),
  };
}

/** Libera TODAS las geometrías de unas piezas de render (idempotente por pieza). */
export function disposeComponentPartsRenderData(
  data: ComponentPartsRenderData,
): void {
  for (const part of data.parts) {
    part.geometry.dispose();
    partsGeometryLifecycle.disposed += 1;
  }
}

/** Piezas de render retenidas con adopción y liberación idempotentes. */
export interface RetainedComponentParts {
  readonly data: ComponentPartsRenderData;
  /**
   * La asenta como vigente (contabiliza `created`). NO-op solo
   * mientras siga vigente; tras un `release` vuelve a armarla: el
   * ciclo estricto de montaje (`adopt → release → adopt`) no deja la
   * retención muerta.
   */
  adopt: () => void;
  /** Libera las geometrías (contabiliza `disposed`, un solo `dispose` por adopción vigente). */
  release: () => void;
}

/**
 * Crea los datos de render de un componente y devuelve su manejador.
 * NO contabiliza hasta `adopt()`.
 *
 * Estado único `released` (= «sin adopción vigente»). Con
 * `StrictMode` (dev) el efecto de montaje se ejecuta dos veces
 * (`adopt → release → adopt`): el `release` intermedio dispone las
 * geometrías ANTES de que el renderer las suba a GPU, y el `adopt`
 * final las rearma para que el `release` definitivo (sustitución de
 * params o desmontaje) vuelva a disponerlas — si no, los búferes
 * que el renderer ha vuelto a subir quedarían huérfanos en cada
 * cambio paramétrico. Cada `created` se empareja con exactamente
 * un `disposed` (paridad final de `partsGeometryLifecycle`).
 */
export function retainComponentParts(
  objectId: string,
  parts: readonly ComponentPart[],
): RetainedComponentParts {
  const data = toComponentPartsRenderData(objectId, parts);
  let released = true;
  return {
    data,
    adopt: () => {
      if (!released) return;
      released = false;
      partsGeometryLifecycle.created += data.parts.length;
    },
    release: () => {
      if (released) return;
      released = true;
      disposeComponentPartsRenderData(data);
    },
  };
}
