/**
 * Las 8 operaciones reversibles del modelador (FASE-4B-B; la octava,
 * `convert-to-component`, llegó en FASE-4B-D).
 *
 * Fuente de verdad: `PROPOSED_ARCHITECTURE.md` §3.7. Cada fábrica:
 *
 * 1. **Valida sus entradas estáticas** y las precondiciones sobre el
 *    documento dado, lanzando `SceneError` con código estable (errores de
 *    programación u operación inválida → situación C, nunca un no-op
 *    silencioso).
 * 2. **Captura el delta** (el estado previo) necesario para `revert`,
 *    sin retener documentos completos: solo el valor sustituido y, en
 *    `remove-object`, el objeto retirado con su índice.
 * 3. Devuelve un `Command` cuyo `apply`/`revert` son puros: no mutan el
 *    documento recibido y devuelven el **mismo documento** cuando el valor
 *    pedido ya estaba (no-op de la situación B, detectado por el historial
 *    por referencia o igualdad estructural).
 *
 * Reparto de responsabilidades con `validateSceneDocument`: la fábrica
 * comprueba la **forma** de sus entradas (I1: mm enteros; tipos de los
 * campos que el comando manipula) y las precondiciones de identidad; el
 * validador del documento —autoridad en el paquete— comprueba en
 * `executeCommand` el contenido completo (cotas de `SCENE_LIMITS`,
 * degeneración de croquis, materiales, `params` contra su registro).
 *
 * Mapeo de códigos (estable y documentado en el README):
 *
 * - `ERR_SCENE_OBJECT_NOT_FOUND`: el objetivo no existe (creación o apply).
 * - `ERR_SCENE_DUPLICATE_ID`: `add-object` sobre un id ya presente.
 * - `ERR_SCENE_COMMAND_CONFLICT`: el estado actual no coincide con el
 *   capturado al crear el comando (comando obsoleto o edición concurrente).
 * - `ERR_SCENE_INVALID_OBJECT` / `ERR_SCENE_TRANSFORM_INVALID` /
 *   `ERR_SCENE_INVALID_EXTRUSION` / `ERR_SCENE_DEGENERATE_SKETCH` /
 *   `ERR_SCENE_PARAMS_OUT_OF_RANGE`: entradas malformadas en la creación
 *   (los mismos códigos que usaría el validador para el contenido).
 *
 * IDs de comando (corrección de contrato, revisión de cierre 4B-B): son
 * **únicos por contenido y deterministas**:
 * `cmd:tipo:idObjetivo:hash64`, donde el hash es FNV-1a (64 bits) de la
 * representación **canónica** (claves ordenadas recursivamente) del delta
 * de la operación (valores anterior/nuevo u objeto capturado). Mismos
 * insumos → mismo id; deltas distintos → ids distintos, de modo que dos
 * operaciones diferentes nunca se confunden por id. El historial sigue
 * indexando por posición: el id es etiqueta determinista, no clave.
 *
 * Congelado de deltas: los insumos **nuevos** que el comando introduce en
 * el documento (objeto añadido, croquis, posición, parámetros) se congelan
 * al capturarlos (I3), de modo que el delta es inmutable aunque el
 * llamante conserve referencias; los valores previos provienen del
 * documento, que ya es inmutable por contrato.
 */

import { deepEqual, type Command, type CommandKind } from './command.js';
import { buildComponent } from './components.js';
import { deepFreeze } from './freeze.js';
import { SceneError } from './errors.js';
import type {
  ComponentBuild,
  ParametricComponentRegistry,
} from './types/component.js';
import type {
  ComponentInstance,
  MmPoint3,
  SceneDocument,
  SceneGeometryRef,
  SceneObject,
  SceneParams,
  Sketch2D,
  SolidObject,
} from './types/document.js';

/** Planos válidos (espejo de `validate.ts` para errores en creación). */
const SKETCH_PLANES: readonly string[] = ['ground', 'front', 'side', 'custom'];

/** Geometría de fuente `sketch` (narrowing de `SceneGeometryRef`). */
type SketchGeometry = Extract<SceneGeometryRef, { source: 'sketch' }>;

// ---------------------------------------------------------------------------
// IDs deterministas por contenido (FNV-1a 64 sobre forma canónica)
// ---------------------------------------------------------------------------

/**
 * Representación canónica y determinista de JSON: claves ordenadas
 * alfabéticamente de forma recursiva y etiquetas de tipo, de modo que dos
 * valores estructuralmente iguales (cualquier orden de claves) producen la
 * misma cadena y tipos distintos no colisionan.
 *
 * Cota de profundidad defensiva (64 ≫ `SCENE_LIMITS.paramsMaxDepth`): una
 * estructura circular o hiperprofunda del llamante se truncaría en un
 * marcador determinista en lugar de desbordar la pila; el validador del
 * documento se encarga después de rechazarla con su código estable.
 */
function canonicalize(value: unknown, depth = 0): string {
  if (depth > 64) return 'depth-limit';
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') return `n:${String(value)}`;
  if (typeof value === 'boolean') return `b:${String(value)}`;
  if (typeof value === 'string') return `s:${JSON.stringify(value)}`;
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalize(item, depth + 1))
      .join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], depth + 1)}`)
      .join(',');
    return `{${body}}`;
  }
  return `unknown:${String(value)}`;
}

/** FNV-1a de 64 bits (puro, sin dependencias; determinista en UTF-16). */
function fnv1a64(text: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/** `cmd:tipo:idObjetivo:hash64` determinista para el delta descrito. */
function commandId(
  kind: CommandKind,
  targetId: string,
  descriptor: unknown,
): string {
  return `cmd:${kind}:${targetId}:${fnv1a64(canonicalize(descriptor))}`;
}

// ---------------------------------------------------------------------------
// Auxiliares de validación estática (creación del comando)
// ---------------------------------------------------------------------------

function requireRecord(value: unknown, field: string, message: string): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SceneError('ERR_SCENE_INVALID_OBJECT', message, { field });
  }
}

function requireSceneObject(value: unknown, field: string): SceneObject {
  requireRecord(value, field, `${field} debe ser un objeto de escena.`);
  return value as SceneObject;
}

function requireObjectId(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `${field} debe ser una cadena no vacía.`,
      { field, value: String(value) },
    );
  }
  return value;
}

function requireName(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `${field} debe ser una cadena no vacía.`,
      { field, value: String(value) },
    );
  }
  return value;
}

/** Punto [entero, entero, entero] (I1). Las cotas de rango las pone el validador. */
function assertMmPoint3(value: unknown, field: string): MmPoint3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new SceneError(
      'ERR_SCENE_TRANSFORM_INVALID',
      `${field} debe ser [x, y, z] de mm enteros.`,
      { field },
    );
  }
  if (
    !value.every(
      (coordinate) => typeof coordinate === 'number' && Number.isInteger(coordinate),
    )
  ) {
    throw new SceneError(
      'ERR_SCENE_TRANSFORM_INVALID',
      `${field} debe contener solo mm enteros.`,
      { field },
    );
  }
  return value as unknown as MmPoint3;
}

/** Forma mínima de un croquis; el contenido (área, cotas) lo valida el validador. */
function assertSketchShape(value: unknown, field: string): Sketch2D {
  requireRecord(value, field, `${field} debe ser un objeto croquis.`);
  const raw = value as Record<string, unknown>;
  if (typeof raw.plane !== 'string' || !SKETCH_PLANES.includes(raw.plane)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `${field}.plane desconocido. Se espera uno de: ${SKETCH_PLANES.join(', ')}.`,
      { field: `${field}.plane` },
    );
  }
  assertMmPoint3(raw.planeOriginMm, `${field}.planeOriginMm`);
  if (raw.closed !== true) {
    throw new SceneError(
      'ERR_SCENE_DEGENERATE_SKETCH',
      `${field}.closed debe ser true: en el MVP el croquis almacenado siempre está cerrado.`,
      { field: `${field}.closed` },
    );
  }
  if (!Array.isArray(raw.pointsMm)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `${field}.pointsMm debe ser la lista de vértices [x, y] en mm enteros.`,
      { field: `${field}.pointsMm` },
    );
  }
  return value as Sketch2D;
}

/** Registro JSON de parámetros; profundidad y rangos los valida el validador. */
function assertParams(value: unknown, field: string): SceneParams {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    // Mismo código que `validateSceneDocument` para `params` malformado.
    throw new SceneError(
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      'Los parámetros deben ser un objeto JSON (registro de claves y valores).',
      { field },
    );
  }
  return value as SceneParams;
}

// ---------------------------------------------------------------------------
// Auxiliares de precondiciones (apply/revert)
// ---------------------------------------------------------------------------

function preconditionError(objectId: string, op: string, detail?: string): SceneError {
  return new SceneError(
    'ERR_SCENE_COMMAND_CONFLICT',
    `Conflicto de precondiciones en "${op}" sobre "${objectId}": ${
      detail ??
      'el documento actual no coincide con el estado capturado al crear el comando.'
    }`,
    detail === undefined ? { objectId, op } : { objectId, op, detail },
  );
}

function objectNotFound(objectId: string): SceneError {
  return new SceneError(
    'ERR_SCENE_OBJECT_NOT_FOUND',
    `No existe el objeto "${objectId}" en el documento.`,
    { objectId },
  );
}

function duplicateId(objectId: string): SceneError {
  return new SceneError(
    'ERR_SCENE_DUPLICATE_ID',
    `Ya existe un objeto con id "${objectId}" en el documento.`,
    { objectId },
  );
}

function findObject(doc: SceneDocument, objectId: string): SceneObject {
  const found = doc.objects.find((candidate) => candidate.id === objectId);
  if (found === undefined) throw objectNotFound(objectId);
  return found;
}

/** Creación: el objetivo debe ser un sólido con geometría de croquis. */
function findSketchGeometry(
  doc: SceneDocument,
  objectId: string,
): { object: SolidObject; geometry: SketchGeometry } {
  const object = findObject(doc, objectId);
  if (object.kind !== 'solid') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El objeto "${objectId}" es un componente: la operación requiere un sólido con croquis.`,
      { objectId },
    );
  }
  const geometry = object.geometry;
  if (geometry.source !== 'sketch') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El objeto "${objectId}" no usa geometría de croquis (fuente "${geometry.source}").`,
      { objectId },
    );
  }
  return { object, geometry };
}

/** apply/revert: misma exigencia, pero el incumplimiento es conflicto. */
function currentSketchGeometry(
  doc: SceneDocument,
  objectId: string,
  op: string,
): { object: SolidObject; geometry: SketchGeometry } {
  const object = findObject(doc, objectId);
  if (object.kind !== 'solid') {
    throw preconditionError(objectId, op, 'ya no es un sólido con geometría de croquis.');
  }
  const geometry = object.geometry;
  if (geometry.source !== 'sketch') {
    throw preconditionError(
      objectId,
      op,
      `la geometría ya no es de tipo croquis (fuente "${geometry.source}").`,
    );
  }
  return { object, geometry };
}

function findComponent(doc: SceneDocument, objectId: string): ComponentInstance {
  const object = findObject(doc, objectId);
  if (object.kind !== 'component') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El objeto "${objectId}" es un sólido: solo los componentes paramétricos admiten params.`,
      { objectId },
    );
  }
  return object;
}

function currentComponent(
  doc: SceneDocument,
  objectId: string,
  op: string,
): ComponentInstance {
  const object = findObject(doc, objectId);
  if (object.kind !== 'component') {
    throw preconditionError(objectId, op, 'ya no es un componente paramétrico.');
  }
  return object;
}

// ---------------------------------------------------------------------------
// Auxiliares de inmutabilidad (devuelven un documento nuevo; nunca mutan)
// ---------------------------------------------------------------------------

function withTransform(
  doc: SceneDocument,
  objectId: string,
  positionMm: MmPoint3,
): SceneDocument {
  return {
    ...doc,
    objects: doc.objects.map((candidate) =>
      candidate.id === objectId
        ? { ...candidate, transform: { positionMm } }
        : candidate,
    ),
  };
}

function withGeometry(
  doc: SceneDocument,
  objectId: string,
  geometry: SceneGeometryRef,
): SceneDocument {
  return {
    ...doc,
    objects: doc.objects.map((candidate) =>
      candidate.id === objectId && candidate.kind === 'solid'
        ? { ...candidate, geometry }
        : candidate,
    ),
  };
}

function withParams(
  doc: SceneDocument,
  objectId: string,
  params: SceneParams | undefined,
): SceneDocument {
  return {
    ...doc,
    objects: doc.objects.map((candidate) => {
      if (candidate.id !== objectId || candidate.kind !== 'component') {
        return candidate;
      }
      if (params === undefined) {
        // Sin params: elimina la clave (no la deja en `undefined`, que
        // difiere estructuralmente de un componente sin params).
        const copy: Record<string, unknown> = { ...candidate };
        delete copy.params;
        return copy as unknown as SceneObject;
      }
      return { ...candidate, params };
    }),
  };
}

function withName(doc: SceneDocument, objectId: string, name: string): SceneDocument {
  return {
    ...doc,
    objects: doc.objects.map((candidate) =>
      candidate.id === objectId ? { ...candidate, name } : candidate,
    ),
  };
}

function withoutObject(doc: SceneDocument, index: number): SceneDocument {
  return {
    ...doc,
    objects: [
      ...doc.objects.slice(0, index),
      ...doc.objects.slice(index + 1),
    ],
  };
}

// ---------------------------------------------------------------------------
// Las 7 fábricas de comandos
// ---------------------------------------------------------------------------

/**
 * Comando `add-object`: añade un objeto al final de `objects`.
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` si el objeto no tiene forma
 * válida (id/kind), `ERR_SCENE_DUPLICATE_ID` si el id ya existe en `doc`.
 */
export function createAddObjectCommand(
  doc: SceneDocument,
  object: SceneObject,
): Command {
  // El objeto añadido es insumo nuevo: se congela al capturarlo (I3), de
  // modo que el delta del comando es inmutable.
  const target = deepFreeze(requireSceneObject(object, 'object'));
  const objectId = requireObjectId(target.id, 'object.id');
  const kind: unknown = target.kind;
  if (kind !== 'solid' && kind !== 'component') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El objeto "${objectId}" tiene un kind desconocado: se espera "solid" o "component".`,
      { objectId, kind: String(kind) },
    );
  }
  const name =
    typeof target.name === 'string' && target.name.trim() !== ''
      ? target.name
      : objectId;
  if (doc.objects.some((candidate) => candidate.id === objectId)) {
    throw duplicateId(objectId);
  }

  return {
    id: commandId('add-object', objectId, { object: target }),
    kind: 'add-object',
    label: `Añadir "${name}"`,
    apply(current) {
      if (current.objects.some((candidate) => candidate.id === objectId)) {
        throw duplicateId(objectId);
      }
      return { ...current, objects: [...current.objects, target] };
    },
    revert(current) {
      const at = current.objects.findIndex(
        (candidate) => candidate.id === objectId,
      );
      const added = current.objects[at];
      if (at < 0 || added === undefined) throw objectNotFound(objectId);
      if (!deepEqual(added, target)) {
        throw preconditionError(objectId, 'add-object');
      }
      return withoutObject(current, at);
    },
  };
}

/**
 * Comando `remove-object`: retira el objeto y lo conserva (con su índice)
 * para poder restaurarlo exactamente.
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND` si el objeto no existe.
 */
export function createRemoveObjectCommand(
  doc: SceneDocument,
  objectId: string,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const index = doc.objects.findIndex((candidate) => candidate.id === id);
  const captured = doc.objects[index];
  if (index < 0 || captured === undefined) throw objectNotFound(id);

  return {
    id: commandId('remove-object', id, { object: captured, index }),
    kind: 'remove-object',
    label: `Eliminar "${captured.name}"`,
    apply(current) {
      const at = current.objects.findIndex(
        (candidate) => candidate.id === id,
      );
      const found = current.objects[at];
      if (at < 0 || found === undefined) throw objectNotFound(id);
      if (at !== index || !deepEqual(found, captured)) {
        throw preconditionError(id, 'remove-object');
      }
      return withoutObject(current, at);
    },
    revert(current) {
      if (current.objects.some((candidate) => candidate.id === id)) {
        throw preconditionError(
          id,
          'remove-object',
          'el objeto a restaurar ya está presente: el documento no es el esperado tras apply.',
        );
      }
      const objects = [...current.objects];
      objects.splice(index, 0, captured);
      return { ...current, objects };
    },
  };
}

/**
 * Comando `set-sketch`: sustituye el croquis del sólido conservando su
 * extrusión.
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND`,
 * `ERR_SCENE_INVALID_OBJECT` (objetivo sin croquis), o códigos de forma del
 * croquis malformado.
 */
export function createSetSketchCommand(
  doc: SceneDocument,
  objectId: string,
  sketch: Sketch2D,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const { object, geometry } = findSketchGeometry(doc, id);
  // El croquis nuevo es insumo del comando: se congela al capturarlo (I3).
  const next = deepFreeze(assertSketchShape(sketch, 'sketch'));
  const previous = geometry.sketch;

  return {
    id: commandId('set-sketch', id, { previous, next }),
    kind: 'set-sketch',
    label: `Editar croquis de "${object.name}"`,
    apply(current) {
      const { geometry: currentGeometry } = currentSketchGeometry(
        current,
        id,
        'set-sketch',
      );
      if (!deepEqual(currentGeometry.sketch, previous)) {
        throw preconditionError(id, 'set-sketch');
      }
      if (deepEqual(next, previous)) return current;
      return withGeometry(current, id, { ...currentGeometry, sketch: next });
    },
    revert(current) {
      const { geometry: currentGeometry } = currentSketchGeometry(
        current,
        id,
        'set-sketch',
      );
      if (!deepEqual(currentGeometry.sketch, next)) {
        throw preconditionError(id, 'set-sketch');
      }
      if (deepEqual(previous, next)) return current;
      return withGeometry(current, id, { ...currentGeometry, sketch: previous });
    },
  };
}

/**
 * Comando `set-extrusion`: cambia la extrusión del croquis conservándolo.
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND`,
 * `ERR_SCENE_INVALID_OBJECT` (objetivo sin croquis) o
 * `ERR_SCENE_INVALID_EXTRUSION` (entero ≥ 1).
 */
export function createSetExtrusionCommand(
  doc: SceneDocument,
  objectId: string,
  extrusionMm: number,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const { object, geometry } = findSketchGeometry(doc, id);
  if (
    typeof extrusionMm !== 'number' ||
    !Number.isInteger(extrusionMm) ||
    extrusionMm < 1
  ) {
    throw new SceneError(
      'ERR_SCENE_INVALID_EXTRUSION',
      'La extrusión debe ser un entero ≥ 1 (mm).',
      { value: String(extrusionMm) },
    );
  }
  const next = extrusionMm;
  const previous = geometry.extrusionMm;

  return {
    id: commandId('set-extrusion', id, { previous, next }),
    kind: 'set-extrusion',
    label: `Extruir "${object.name}" a ${next} mm`,
    apply(current) {
      const { geometry: currentGeometry } = currentSketchGeometry(
        current,
        id,
        'set-extrusion',
      );
      if (currentGeometry.extrusionMm !== previous) {
        throw preconditionError(id, 'set-extrusion');
      }
      if (next === previous) return current;
      return withGeometry(current, id, {
        ...currentGeometry,
        extrusionMm: next,
      });
    },
    revert(current) {
      const { geometry: currentGeometry } = currentSketchGeometry(
        current,
        id,
        'set-extrusion',
      );
      if (currentGeometry.extrusionMm !== next) {
        throw preconditionError(id, 'set-extrusion');
      }
      if (previous === next) return current;
      return withGeometry(current, id, {
        ...currentGeometry,
        extrusionMm: previous,
      });
    },
  };
}

/**
 * Comando `set-transform`: mueve la esquina mínima del objeto (solo
 * traslación en el MVP; sin rotación, `PROPOSED_ARCHITECTURE.md` §3.6).
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND` o
 * `ERR_SCENE_TRANSFORM_INVALID` (no es [entero, entero, entero]).
 */
export function createSetTransformCommand(
  doc: SceneDocument,
  objectId: string,
  positionMm: MmPoint3,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const target = findObject(doc, id);
  // La posición nueva es insumo del comando: se congela al capturarla (I3).
  const next = deepFreeze(assertMmPoint3(positionMm, 'positionMm'));
  const previous = target.transform.positionMm;

  return {
    id: commandId('set-transform', id, { previous, next }),
    kind: 'set-transform',
    label: `Mover "${target.name}"`,
    apply(current) {
      const object = findObject(current, id);
      if (!deepEqual(object.transform.positionMm, previous)) {
        throw preconditionError(id, 'set-transform');
      }
      if (deepEqual(next, previous)) return current;
      return withTransform(current, id, next);
    },
    revert(current) {
      const object = findObject(current, id);
      if (!deepEqual(object.transform.positionMm, next)) {
        throw preconditionError(id, 'set-transform');
      }
      if (deepEqual(previous, next)) return current;
      return withTransform(current, id, previous);
    },
  };
}

/**
 * Comando `set-params`: **reemplaza** el mapa completo de parámetros del
 * componente (para editar una sola clave, el llamante combina:
 * `{ ...obj.params, ancho: 600 }`). El mapa anterior se conserva íntegro
 * para `revert`.
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND`,
 * `ERR_SCENE_INVALID_OBJECT` (objetivo no es componente) o
 * `ERR_SCENE_PARAMS_OUT_OF_RANGE` (no es un registro JSON).
 */
export function createSetParamsCommand(
  doc: SceneDocument,
  objectId: string,
  params: SceneParams,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const target = findComponent(doc, id);
  // Los parámetros nuevos son insumo del comando: se congelan al capturarlos (I3).
  const next = deepFreeze(assertParams(params, 'params'));
  const previous = target.params;

  return {
    id: commandId('set-params', id, { previous, next }),
    kind: 'set-params',
    label: `Parámetros de "${target.name}"`,
    apply(current) {
      const object = currentComponent(current, id, 'set-params');
      if (!deepEqual(object.params, previous)) {
        throw preconditionError(id, 'set-params');
      }
      if (deepEqual(next, previous)) return current;
      return withParams(current, id, next);
    },
    revert(current) {
      const object = currentComponent(current, id, 'set-params');
      if (!deepEqual(object.params, next)) {
        throw preconditionError(id, 'set-params');
      }
      if (deepEqual(previous, next)) return current;
      return withParams(current, id, previous);
    },
  };
}

/**
 * Comando `rename`: cambia el nombre visible del objeto.
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND` o
 * `ERR_SCENE_INVALID_OBJECT` (nombre vacío).
 */
export function createRenameCommand(
  doc: SceneDocument,
  objectId: string,
  name: string,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const target = findObject(doc, id);
  const next = requireName(name, 'name');
  const previous = target.name;

  return {
    id: commandId('rename', id, { previous, next }),
    kind: 'rename',
    label: `Renombrar "${previous}" → "${next}"`,
    apply(current) {
      const object = findObject(current, id);
      if (object.name !== previous) {
        throw preconditionError(id, 'rename');
      }
      if (next === previous) return current;
      return withName(current, id, next);
    },
    revert(current) {
      const object = findObject(current, id);
      if (object.name !== next) {
        throw preconditionError(id, 'rename');
      }
      if (previous === next) return current;
      return withName(current, id, previous);
    },
  };
}

// ---------------------------------------------------------------------------
// FASE-4B-D: conversión de sólido libre a componente paramétrico
// ---------------------------------------------------------------------------

/** Prisma axial exacto en mm enteros (marco local del objeto). */
interface CanonicalPrism {
  readonly minMm: MmPoint3;
  readonly sizeMm: MmPoint3;
}

/**
 * Canoniza la geometría de un sólido croquis a un prisma axial exacto, o
 * `null` cuando la equivalencia **no es demostrable**.
 *
 * Restricciones documentadas (`SCENE_DOCUMENT.md` §3.7, FASE-4B-D): el
 * croquis debe ser un rectángulo exacto de 4 vértices axiales en el plano
 * `ground` (el kernel extruye sobre +Z; otros planos no se canonizan sin
 * ambigüedad en el MVP). Cualquier otra forma → `null` y la conversión se
 * **rechaza explícitamente**: nunca se inventan parámetros ni se aproxima
 * geometría.
 */
function canonicalSketchPrism(geometry: SketchGeometry): CanonicalPrism | null {
  const { sketch, extrusionMm } = geometry;
  if (sketch.plane !== 'ground') return null;
  const points = sketch.pointsMm;
  if (points.length !== 4) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    seen.add(`${x},${y}`);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 1 || height < 1 || seen.size !== 4) return null;
  // El conjunto de vértices debe ser exactamente las 4 esquinas del
  // rectángulo axial (descarta rombos, trapecios y rectángulos rotados).
  for (const corner of [
    `${minX},${minY}`,
    `${maxX},${minY}`,
    `${maxX},${maxY}`,
    `${minX},${maxY}`,
  ]) {
    if (!seen.has(corner)) return null;
  }
  const [originX, originY, originZ] = sketch.planeOriginMm;
  return {
    minMm: [originX + minX, originY + minY, originZ],
    sizeMm: [width, height, extrusionMm],
  };
}

/**
 * Canoniza la construcción de un componente a un prisma axial exacto, o
 * `null` si no es demostrablemente una caja única (multi-pieza, cilindros,
 * etc. → la equivalencia con un sólido individual no puede probarse).
 */
function canonicalBuildPrism(build: ComponentBuild): CanonicalPrism | null {
  if (build.parts.length !== 1) return null;
  const part = build.parts[0];
  if (part === undefined || part.kind !== 'box') return null;
  return { minMm: part.positionMm, sizeMm: part.sizeMm };
}

/** Igualdad exacta de prisma (mm enteros: sin epsilons). */
function prismsEqual(a: CanonicalPrism, b: CanonicalPrism): boolean {
  return (
    a.minMm[0] === b.minMm[0] &&
    a.minMm[1] === b.minMm[1] &&
    a.minMm[2] === b.minMm[2] &&
    a.sizeMm[0] === b.sizeMm[0] &&
    a.sizeMm[1] === b.sizeMm[1] &&
    a.sizeMm[2] === b.sizeMm[2]
  );
}

/** Sustituye un objeto por id con otro objeto distinto (cambia el `kind`). */
function withObject(
  doc: SceneDocument,
  objectId: string,
  object: SceneObject,
): SceneDocument {
  return {
    ...doc,
    objects: doc.objects.map((candidate) =>
      candidate.id === objectId ? object : candidate,
    ),
  };
}

/**
 * Comando `convert-to-component` (FASE-4B-D): sustituye un `SolidObject`
 * por un `ComponentInstance` **conservando id, nombre, transformación y
 * material**, solo si la equivalencia geométrica es **demostrable**:
 *
 * 1. El sólido debe ser croquis con rectángulo axial en `ground`
 *    (prisma canónico exacto).
 * 2. `build(params)` del componente registrado debe producir **una única
 *    caja** con el mismo prisma canónico (mismo min y tamaño, mm exactos).
 *
 * Cualquier caso no demostrable se rechaza con
 * `ERR_SCENE_CONVERSION_INCOMPATIBLE` (sin aproximación). El `revert`
 * restaura exactamente el `SolidObject` anterior (capturado por
 * referencia del documento, ya congelado).
 *
 * @throws SceneError `ERR_SCENE_OBJECT_NOT_FOUND`, `ERR_SCENE_INVALID_OBJECT`
 * (objetivo no es sólido), `ERR_SCENE_UNKNOWN_COMPONENT`,
 * `ERR_SCENE_PARAMS_OUT_OF_RANGE` o `ERR_SCENE_CONVERSION_INCOMPATIBLE`.
 */
export function createConvertToComponentCommand(
  doc: SceneDocument,
  objectId: string,
  type: string,
  version: number,
  params: SceneParams,
  registry: ParametricComponentRegistry,
): Command {
  const id = requireObjectId(objectId, 'objectId');
  const target = findObject(doc, id);
  if (target.kind !== 'solid') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El objeto "${id}" no es un sólido libre: solo los sólidos se convierten en componentes.`,
      { objectId: id },
    );
  }
  const geometry = target.geometry;
  if (geometry.source !== 'sketch') {
    throw new SceneError(
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
      `El sólido "${id}" no tiene geometría de croquis (fuente "${geometry.source}"): su forma no es demostrable.`,
      { objectId: id },
    );
  }
  const solidPrism = canonicalSketchPrism(geometry);
  if (solidPrism === null) {
    throw new SceneError(
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
      `El croquis de "${id}" no es un rectángulo axial en el plano ground: la equivalencia no es demostrable.`,
      { objectId: id },
    );
  }

  // Valida registro, versión y params (UNKNOWN_COMPONENT / PARAMS_OUT_OF_RANGE)
  // y construye las piezas deterministas del componente.
  const frozenParams = deepFreeze(assertParams(params, 'params'));
  const build = buildComponent(registry, id, type, version, frozenParams);

  const componentPrism = canonicalBuildPrism(build);
  if (componentPrism === null || !prismsEqual(solidPrism, componentPrism)) {
    throw new SceneError(
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
      `La construcción de "${type}" no reproduce la geometría del sólido "${id}" (se esperaba una única caja en min [${solidPrism.minMm.join(', ')}] con tamaño [${solidPrism.sizeMm.join(', ')}]).`,
      { objectId: id, type },
    );
  }

  const previous: SolidObject = target;
  const next: ComponentInstance = deepFreeze({
    id,
    kind: 'component' as const,
    name: target.name,
    type,
    version,
    transform: target.transform,
    materialId: target.materialId,
    params: frozenParams,
  });

  return {
    id: commandId('convert-to-component', id, { type, version, params: frozenParams }),
    kind: 'convert-to-component',
    label: `Convertir "${target.name}" en ${type}`,
    apply(current) {
      const object = findObject(current, id);
      if (!deepEqual(object, previous)) {
        throw preconditionError(id, 'convert-to-component');
      }
      return withObject(current, id, next);
    },
    revert(current) {
      const object = findObject(current, id);
      if (!deepEqual(object, next)) {
        throw preconditionError(id, 'convert-to-component');
      }
      return withObject(current, id, previous);
    },
  };
}
