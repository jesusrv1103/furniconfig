/**
 * FASE-4C-B, B3 — adaptador `MeshData` (mm) → datos de render (m).
 *
 * Único punto de conversión de la malla del kernel hacia la escena
 * R3F (extiende la regla de `lib/units.ts` y el patrón de
 * `panels-to-mesh.ts` al modelador libre: la adaptación vive en un
 * módulo dedicado, no en los componentes).
 *
 * Reglas:
 *
 * - El dominio conserva los **mm originales sin redondear**: aquí
 *   se divide por 1000 (`mmToM`) componente a componente, una sola
 *   vez, al pasar a metros para renderizar.
 * - Se **preservan índices y orientación**: `indices` se copia
 *   tal cual (el `MeshData` puede llegar por transferencia de
 *   buffers; la copia desacopla el ciclo de vida).
 * - La `BufferGeometry` se crea UNA vez por malla recibida (la
 *   pantalla la memoriza y la dispone en su limpieza): no se
 *   recrea en cada render de React.
 * - Sin atributo de normales a propósito: el material de sólido
 *   usa `flatShading` (bordes nítidos y cero coste extra); para
 *   un prisma rectangular el resultado es exactamente el esperado.
 */

import type { MeshData } from '@furniconfig/kernel-adapter';
import { BufferAttribute, BufferGeometry } from 'three';

import { mmToM } from '../units.js';

/** Bordes en metros (mismo contrato que `Aabb` de `camera-views`). */
export interface BoundsM {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** Malla de un sólido preparada para renderizar en metros. */
export interface SolidMeshRenderData {
  readonly objectId: string;
  /** Posiciones en metros (stride3), copia desacoplada del kernel. */
  readonly positionsM: Float32Array;
  /** Índices copiados tal cual (misma orientación de caras). */
  readonly indices: Uint32Array;
  readonly boundsM: BoundsM;
}

function boundsToM(bounds: MeshData['bounds']): BoundsM {
  return {
    min: [mmToM(bounds.min[0]), mmToM(bounds.min[1]), mmToM(bounds.min[2])],
    max: [mmToM(bounds.max[0]), mmToM(bounds.max[1]), mmToM(bounds.max[2])],
  };
}

/**
 * Convierte la malla del kernel (mm enteros del dominio) a datos
 * de render en metros. Pura: no muta el `MeshData` de entrada.
 */
export function toSolidMeshRenderData(
  objectId: string,
  mesh: MeshData,
): SolidMeshRenderData {
  const positionsM = new Float32Array(mesh.positions.length);
  for (let i = 0; i < mesh.positions.length; i += 1) {
    // `?? 0`: defensa de tipos (`noUncheckedIndexedAccess`); el
    // índice siempre existe porque el bucle recorre la longitud.
    positionsM[i] = mmToM(mesh.positions[i] ?? 0);
  }
  return {
    objectId,
    positionsM,
    indices: new Uint32Array(mesh.indices),
    boundsM: boundsToM(mesh.bounds),
  };
}

/**
 * Crea la geometría de Three.js para una malla ya convertida.
 * La responsabilidad de `dispose()` es de quien la retiene (la
 * pantalla la memoriza por identidad de malla y la dispone al
 * desmontar o al sustituirla).
 */
export function createSolidBufferGeometry(
  data: SolidMeshRenderData,
): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data.positionsM, 3));
  geometry.setIndex(new BufferAttribute(data.indices, 1));
  geometry.boundingBox = null; // three la recalcula desde las posiciones
  return geometry;
}
