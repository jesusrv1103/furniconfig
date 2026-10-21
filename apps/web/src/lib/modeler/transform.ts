/**
 * WAVE-01 BLOQUE 2 — transformaciones espaciales (traslación en el
 * suelo X/Z) de cualquier objeto de la escena.
 *
 * Decisión de contrato (documentada en
 * `docs/architecture/furniconfig-4/WAVE01_DISTRIBUTION.md`):
 *
 * - `SceneDocument v1` NO soporta rotación (`Transform3` solo tiene
 *   `positionMm`; el propio contrato reserva la rotación futura a un
 *   cambio de versión). Este módulo NO modifica el contrato: la
 *   rotación queda pendiente y NO se simula.
 * - La traslación ya es representable con comandos existentes:
 *   - **Componentes** (clósets): posición = `transform.positionMm` →
 *     comando `set-transform`.
 *   - **Sólidos libres**: la malla, el picking y el kernel derivan
 *     del croquis ABSOLUTO (el `transform` del sólido es identidad y
 *     el render no lo aplica) → posición autoritativa = esquina
 *     mínima del croquis y el movimiento se expresa con `set-sketch`
 *     trasladando todos los vértices. Una única fuente de verdad por
 *     objeto: nada de dobles orígenes.
 *
 * Reglas:
 *
 * - mm enteros (I1) en TODA frontera: los campos de la UI parsean a
 *   enteros con signo; las fábricas de comandos del núcleo revalidan.
 * - UNA entrada de historial por gesto: el comando se construye sobre
 *   el documento vigente y se despacha una sola vez (el arrastre es
 *   solo una previsualización SIN mutar el documento).
 * - Funciones puras: sin DOM, sin estado, deterministas.
 */

import {
  SceneError,
  createSetSketchCommand,
  createSetTransformCommand,
  type Command,
  type MmPoint3,
  type SceneDocument,
  type Sketch2D,
} from '@furniconfig/modeler-core';

/**
 * Texto de campo de posición: entero CON SIGNO en mm (hasta 7
 * dígitos). Acepta negativos (la escena puede extenderse a la
 * izquierda/atrás del origen); lo inválido → `null` (nunca NaN ni
 * decimales).
 */
export function parsePositionMm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^-?\d{1,7}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Snap al múltiplo de `gridStepMm` más cercano (X y Z; Y intacta).
 * Empates: redondeo hacia arriba (Math.round). Rejilla inválida
 * (no entera o ≤ 0) → sin snap (defensa; la rejilla del documento
 * siempre es un entero ≥ 1).
 */
export function snapPositionMm(
  positionMm: MmPoint3,
  gridStepMm: number,
): MmPoint3 {
  if (!Number.isInteger(gridStepMm) || gridStepMm <= 0) return positionMm;
  const snap = (value: number): number =>
    Math.round(value / gridStepMm) * gridStepMm;
  return [snap(positionMm[0]), positionMm[1], snap(positionMm[2])];
}

/**
 * Esquina mínima (mm enteros) de un croquis en el plano suelo:
 * `[minX, 0, minZ]` (los puntos 2D del croquis son `[x, z]`).
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` si el croquis está
 * vacío (no debería ocurrir: el validador exige ≥ 3 vértices).
 */
export function sketchPositionMm(sketch: Sketch2D): MmPoint3 {
  if (sketch.pointsMm.length === 0) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'El croquis no tiene vértices: sin posición derivable.',
    );
  }
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  for (const [x, z] of sketch.pointsMm) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
  }
  return [minX, 0, minZ];
}

/**
 * Posición autoritativa (esquina mínima en el suelo) de un objeto
 * o `null` si no es representable hoy:
 *
 * - componente → su `transform.positionMm` (el render lo aplica);
 * - sólido de croquis EN EL PLANO SUELO → esquina mínima del croquis;
 * - sólido en otro plano / sin croquis / id inexistente → `null`
 *   (la UI oculta el panel en lugar de mostrar valores engañosos).
 */
export function getObjectPositionMm(
  document: SceneDocument,
  objectId: string,
): MmPoint3 | null {
  const object = document.objects.find((entry) => entry.id === objectId);
  if (object === undefined) return null;
  if (object.kind === 'component') return object.transform.positionMm;
  if (object.geometry.source !== 'sketch') return null;
  if (object.geometry.sketch.plane !== 'ground') return null;
  return sketchPositionMm(object.geometry.sketch);
}

/**
 * Traslación de un croquis (dx, dz en mm) conservando forma,
 * orden de vértices, `closed` y enteros (I1). El origen del plano
 * se traslada también para preservar la relación puntos↔origen
 * bajo cualquier interpretación (relativa o absoluta).
 *
 * @throws SceneError `ERR_SCENE_TRANSFORM_INVALID` si dx/dz no son
 * enteros seguros.
 */
export function translateSketch(
  sketch: Sketch2D,
  dxMm: number,
  dzMm: number,
): Sketch2D {
  if (!Number.isSafeInteger(dxMm) || !Number.isSafeInteger(dzMm)) {
    throw new SceneError(
      'ERR_SCENE_TRANSFORM_INVALID',
      'El desplazamiento del croquis debe ser [entero, entero] en mm.',
      { dxMm: String(dxMm), dzMm: String(dzMm) },
    );
  }
  return {
    ...sketch,
    planeOriginMm: [
      sketch.planeOriginMm[0] + dxMm,
      sketch.planeOriginMm[1],
      sketch.planeOriginMm[2] + dzMm,
    ],
    pointsMm: sketch.pointsMm.map(
      ([x, z]) => [x + dxMm, z + dzMm] as const,
    ),
  };
}

/**
 * Comando de movimiento a una posición ABSOLUTA (esquina mínima):
 * UNA entrada de historial por gesto, sobre el documento vigente.
 *
 * - componente → `set-transform` (posición = `transform.positionMm`);
 * - sólido de croquis en `ground` → `set-sketch` con el croquis
 *   trasladado por el delta (las dimensiones NO cambian: traslación
 *   pura).
 *
 * El no-op (misma posición) lo resuelve el propio comando (devuelve
 * el mismo documento → la UI no registra entrada).
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND` (id inexistente),
 * `ERR_SCENE_TRANSFORM_INVALID` (posición con no enteros),
 * `ERR_SCENE_INVALID_OBJECT` (sólido sin croquis en `ground`).
 */
export function buildObjectMoveCommand(
  document: SceneDocument,
  objectId: string,
  positionMm: MmPoint3,
): Command {
  const target = document.objects.find((entry) => entry.id === objectId);
  if (target === undefined) {
    throw new SceneError(
      'ERR_SCENE_OBJECT_NOT_FOUND',
      `No existe el objeto "${objectId}" en el documento.`,
      { objectId },
    );
  }
  for (const value of positionMm) {
    if (!Number.isSafeInteger(value)) {
      throw new SceneError(
        'ERR_SCENE_TRANSFORM_INVALID',
        'La posición debe ser [entero, entero, entero] en mm.',
        { objectId, positionMm: positionMm.map(String).join(', ') },
      );
    }
  }
  if (target.kind === 'component') {
    return createSetTransformCommand(document, objectId, positionMm);
  }
  if (
    target.geometry.source !== 'sketch' ||
    target.geometry.sketch.plane !== 'ground'
  ) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El objeto "${objectId}" no es un sólido de croquis en el plano suelo: su posición no es trasladable.`,
      { objectId },
    );
  }
  const current = sketchPositionMm(target.geometry.sketch);
  const dxMm = positionMm[0] - current[0];
  const dzMm = positionMm[2] - current[2];
  return createSetSketchCommand(
    document,
    objectId,
    translateSketch(target.geometry.sketch, dxMm, dzMm),
  );
}

/**
 * Borrador de arrastre (previsualización): posición propuesta SIN
 * mutar el documento; el commit genera UN único comando.
 */
export interface MoveDraft {
  readonly objectId: string;
  readonly positionMm: MmPoint3;
}

/**
 * Suma de desplazamiento a una posición (previsualización de
 * arrastre y flechas de ajuste): `[x + dx, y, z + dz]` con enteros.
 */
export function offsetPositionMm(
  positionMm: MmPoint3,
  dxMm: number,
  dzMm: number,
): MmPoint3 {
  return [positionMm[0] + dxMm, positionMm[1], positionMm[2] + dzMm];
}
