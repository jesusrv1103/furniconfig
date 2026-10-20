/**
 * FASE-4C-B — retención y liberación de la `BufferGeometry` de un
 * sólido.
 *
 * Extraído de `SolidMeshView` para poder verificar la política de
 * recursos de la auditoría §2 en dos niveles:
 *
 * - `retainSolidGeometry` (lógica pura, testeable en node SIN
 *   WebGL): crea la geometría y expone `adopt()`/`release()`
 *   idempotentes; el ciclo se contabiliza en `geometryLifecycle`;
 * - `useSolidGeometry` (celosía de React): `adopt()` al montar y
 *   `release()` al SUSTITUIR la malla o al DESMONTAR — verificado
 *   en navegador real por el check visual `7l` (el entorno de
 *   pruebas unitarias es `node` sin DOM y la fase no admite
 *   dependencias nuevas).
 *
 * Los contadores miden la ADOPCIÓN (comprometida por el effect),
 * no la construcción: el doble render de `StrictMode` en dev puede
 * descartar geometrías nunca montadas (basura GC, sin contador y
 * sin fugas de GPU) y su doble EFECTO (adopt → release → adopt)
 * queda rearma por `retainSolidGeometry`: el release de
 * sustitución o desmontaje dispone de verdad la geometría que el
 * renderer ha vuelto a subir (corrección de recursos 4C-D).
 * Invariante visible: `disposed === created`.
 *
 * La creación vive en `createSolidBufferGeometry`
 * (`lib/modeler/mesh-to-renderable.ts`); este módulo solo añade el
 * ciclo de vida.
 */

import { useEffect, useMemo } from 'react';
import type { BufferGeometry } from 'three';

import type { SolidMeshRenderData } from '../../lib/modeler/mesh-to-renderable.js';
import { createSolidBufferGeometry } from '../../lib/modeler/mesh-to-renderable.js';

/**
 * Contadores de ciclo de vida (instrumentación de auditoría §2):
 * en una escena sin fugas, `disposed` alcanza a `created` tras
 * sustituir o desmontar todas las mallas.
 */
export const geometryLifecycle = { created: 0, disposed: 0 };

/** Geometría retenida con adopción y liberación idempotentes. */
export interface RetainedGeometry {
  readonly geometry: BufferGeometry;
  /**
   * La asenta como vigente (contabiliza `created`). NO-op solo
   * mientras siga vigente; tras un `release` vuelve a armarla: el
   * ciclo estricto de montaje (`adopt → release → adopt`) no deja
   * la retención muerta.
   */
  adopt: () => void;
  /** Libera la geometría (contabiliza `disposed`, un solo `dispose` por adopción vigente). */
  release: () => void;
}

/**
 * Crea la geometría de `mesh` y devuelve su manejador. Pura
 * respecto a DOM y React (solo objetos Three.js); NO contabiliza
 * hasta que se llama a `adopt()`.
 *
 * Estado único `released` (= «sin adopción vigente»). Con
 * `StrictMode` (dev) el efecto de montaje se ejecuta dos veces
 * (`adopt → release → adopt`): el `release` intermedio dispone la
 * geometría ANTES de que el renderer la suba a GPU, y el `adopt`
 * final la rearma para que el `release` definitivo (sustitución de
 * malla o desmontaje: eliminación, Undo/Redo, regeneración,
 * navegación fuera del modelador) vuelva a disponerla — si no, los
 * búferes que el renderer ha vuelto a subir quedarían huérfanos
 * (prueba «montaje estricto» de `use-solid-geometry.test.ts`).
 * Cada `created` se empareja con exactamente un `disposed`;
 * `release` sin adopción vigente es no-op (nada que liberar).
 */
export function retainSolidGeometry(mesh: SolidMeshRenderData): RetainedGeometry {
  const geometry = createSolidBufferGeometry(mesh);
  let released = true;
  return {
    geometry,
    adopt: () => {
      if (!released) return;
      released = false;
      geometryLifecycle.created += 1;
    },
    release: () => {
      if (released) return;
      released = true;
      geometryLifecycle.disposed += 1;
      geometry.dispose();
    },
  };
}

/**
 * Geometría retenida para `mesh`: se crea UNA por malla (identidad
 * estable entre renders) y se dispone al sustituirla o desmontar.
 */
export function useSolidGeometry(mesh: SolidMeshRenderData): BufferGeometry {
  const retained = useMemo(() => retainSolidGeometry(mesh), [mesh]);
  useEffect(() => {
    retained.adopt();
    return () => {
      retained.release();
    };
  }, [retained]);
  return retained.geometry;
}
