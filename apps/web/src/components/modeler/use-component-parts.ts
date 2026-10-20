/**
 * FASE-4C-D — retención y liberación de las `BufferGeometry` de un
 * componente (clóset), espejo de `use-solid-geometry.ts`.
 *
 * - `retainComponentParts` (lógica pura, testeable sin WebGL):
 *   crea las geometrías y expone `adopt()`/`release()` idempotentes;
 *   el ciclo se contabiliza en `partsGeometryLifecycle`;
 * - `useComponentParts` (celosía de React): crea UNA vez por
 *   referencia de piezas (`useMemo`), `adopt()` al montar y
 *   `release()` al SUSTITUIR las piezas (cambio de params → piezas
 *   nuevas) o al DESMONTAR (eliminar objeto / desmontar escena).
 *
 * Invariante visible en escena sin fugas: `disposed === created`
 * (mismo criterio que `geometryLifecycle` de los sólidos, §8 prueba
 * 13). El doble render de `StrictMode` en dev puede descartar
 * geometrías nunca montadas (basura GC, sin contador y sin fugas
 * de GPU) y su doble EFECTO (adopt → release → adopt) queda
 * rearma por `retainComponentParts`: el release de sustitución o
 * desmontaje dispone de verdad la geometría que el renderer ha
 * vuelto a subir (auditoría 4C-D §3).
 */

import { useEffect, useMemo } from 'react';

import type { ComponentPart } from '@furniconfig/modeler-core';

import {
  retainComponentParts,
  type ComponentPartsRenderData,
} from '../../lib/modeler/components/parts-to-mesh.js';

/**
 * Mantiene viva la geometría de las piezas de un componente:
 * referencia nueva cuando cambian las piezas (la anterior se
 * libera en la limpieza del efecto) y liberación al desmontar.
 */
export function useComponentParts(
  objectId: string,
  parts: readonly ComponentPart[] | null,
): ComponentPartsRenderData | null {
  // Crea (sin contabilizar) UNA sola vez por identidad de piezas.
  const retained = useMemo(
    () => (parts === null ? null : retainComponentParts(objectId, parts)),
    [objectId, parts],
  );

  useEffect(() => {
    if (retained === null) return;
    retained.adopt();
    return () => {
      retained.release();
    };
  }, [retained]);

  return retained?.data ?? null;
}
