/**
 * Validación runtime del Scene Document v1 (FASE-4B-A).
 *
 * Patrón heredado de `validateWardrobeConfig` (`geometry-core`): valida
 * `unknown` (frontera de importación/serialización), **recopila todos los
 * errores** en lugar de parar en el primero y devuelve un resultado
 * discriminado en vez de lanzar (ADR-005).
 *
 * Propiedades de seguridad de esta frontera:
 *
 * - La salida se **reconstruye campo a campo**: las claves desconocidas del
 *   entrada se descartan (nunca se propagan al documento validado).
 * - Las claves de `params` se copian con `Object.defineProperty` (semántica
 *   de definición, no de asignación), de modo que una clave hostil
 *   `__proto__` procedente de `JSON.parse` se convierte en una propiedad
 *   propia inocua y **no** contamina el prototipo.
 * - Todo número validado es entero (campos mm) o finito (parámetros):
 *   `NaN`/`Infinity` siempre rechazados.
 * - `params` se sanitiza recursivamente con cota de profundidad
 *   (`SCENE_LIMITS.paramsMaxDepth`), por lo que una estructura circular o
 *   hiperprofunda termina en error y nunca en desbordamiento de pila.
 * - El resultado exitoso se **congela** (invariante I3).
 *
 * Detección de auto-intersección de croquis: NO se duplica aquí el chequeo
 * O(n²) de `kernel-adapter/src/polygon.ts`. La frontera del kernel es la
 * única autoridad sobre la simplicidad del polígono (RISKS R-18); el
 * validador del documento garantiza la degeneración barata (≥3 vértices,
 * cerrado, área ≠ 0, sin repetir el primero), que ya cubre el caso bowtie
 * (área shoelace 0).
 */

import type { SceneErrorCode, SceneIssue } from './errors.js';
import { deepFreeze } from './freeze.js';
import { SCENE_LIMITS } from './limits.js';
import type {
  ComponentDefRef,
  ComponentRegistry,
} from './types/component.js';
import {
  SCENE_DOCUMENT_VERSION,
  type MmPoint2,
  type MmPoint3,
  type SceneDocument,
  type SceneGeometryRef,
  type SceneMaterial,
  type SceneObject,
  type SceneParams,
  type SceneParamValue,
  type Sketch2D,
  type SketchPlane,
  type SolidObject,
  type ComponentInstance,
  type Transform3,
} from './types/document.js';

const SKETCH_PLANES: readonly SketchPlane[] = [
  'ground',
  'front',
  'side',
  'custom',
];

export interface SceneValidationOptions {
  /**
   * Registro de componentes paramétricos. Si se proporciona, los tipos de
   * `ComponentInstance` deben estar registrados (`ERR_SCENE_UNKNOWN_COMPONENT`)
   * y sus parámetros escalares declarados se validan contra el esquema
   * (`ERR_SCENE_PARAMS_OUT_OF_RANGE`). Sin registro, los componentes se
   * validan solo estructuralmente.
   */
  readonly components?: ComponentRegistry;
}

export type SceneValidationResult =
  | { ok: true; document: SceneDocument }
  | { ok: false; errors: SceneIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** Entero mm dentro de la cota de sanidad de coordenadas (I1 + limits). */
function isMmCoordinate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    Math.abs(value) <= SCENE_LIMITS.coordinateMm.max
  );
}

/** Entero mm positivo (≥ 1), sin cota superior. */
function isPositiveIntegerMm(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function issue(
  code: SceneErrorCode,
  field: string,
  message: string,
): SceneIssue {
  return { code, field, message };
}

/**
 * Valida un punto 3D de mm enteros (origen, traslación, origen de plano).
 * Devuelve el punto reconstruido (tipado, congelable) o null con error
 * acumulado.
 */
function validatePoint3(
  raw: unknown,
  field: string,
  errors: SceneIssue[],
): MmPoint3 | null {
  if (!Array.isArray(raw) || raw.length !== 3) {
    errors.push(
      issue(
        'ERR_SCENE_TRANSFORM_INVALID',
        field,
        'Debe ser un punto [x, y, z] de mm enteros.',
      ),
    );
    return null;
  }
  const [x, y, z] = raw;
  if (!isMmCoordinate(x) || !isMmCoordinate(y) || !isMmCoordinate(z)) {
    errors.push(
      issue(
        'ERR_SCENE_TRANSFORM_INVALID',
        field,
        `Coordenadas no enteras, no finitas o fuera de la cota provisional ±${SCENE_LIMITS.coordinateMm.max} mm.`,
      ),
    );
    return null;
  }
  return [x, y, z] as const;
}

function validateTransform(
  raw: unknown,
  field: string,
  errors: SceneIssue[],
): Transform3 | null {
  if (!isRecord(raw)) {
    errors.push(
      issue(
        'ERR_SCENE_TRANSFORM_INVALID',
        field,
        'El objeto "transform" es obligatorio.',
      ),
    );
    return null;
  }
  const positionMm = validatePoint3(
    raw.positionMm,
    `${field}.positionMm`,
    errors,
  );
  if (positionMm === null) return null;
  return { positionMm };
}

function validateMaterials(
  raw: unknown,
  errors: SceneIssue[],
): SceneMaterial[] | null {
  if (!Array.isArray(raw)) {
    errors.push(
      issue('ERR_SCENE_INVALID_OBJECT', 'materials', 'Debe ser una lista.'),
    );
    return null;
  }
  const materials: SceneMaterial[] = [];
  const seenIds = new Set<string>();
  let valid = true;
  raw.forEach((entry, index) => {
    const field = `materials[${index}]`;
    if (!isRecord(entry)) {
      errors.push(
        issue('ERR_SCENE_INVALID_OBJECT', field, 'Debe ser un objeto.'),
      );
      valid = false;
      return;
    }
    const { id, name, finish, thicknessMm } = entry;
    if (
      !isNonEmptyString(id) ||
      !isNonEmptyString(name) ||
      !isNonEmptyString(finish) ||
      !isPositiveIntegerMm(thicknessMm)
    ) {
      errors.push(
        issue(
          'ERR_SCENE_INVALID_OBJECT',
          field,
          'Un material requiere "id", "name" y "finish" (cadenas no vacías) y "thicknessMm" (entero ≥ 1).',
        ),
      );
      valid = false;
      return;
    }
    if (seenIds.has(id)) {
      errors.push(
        issue(
          'ERR_SCENE_DUPLICATE_ID',
          `${field}.id`,
          `Id de material duplicado: "${id}".`,
        ),
      );
      valid = false;
      return;
    }
    seenIds.add(id);
    materials.push({ id, name, finish, thicknessMm });
  });
  return valid ? materials : null;
}

/** Área firmada (zapatero) × 2 en mm². Exacta dentro de la cota de limits. */
function signedDoubleAreaMm2(points: readonly MmPoint2[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice;
}

function validateSketch(
  raw: unknown,
  field: string,
  errors: SceneIssue[],
): Sketch2D | null {
  if (!isRecord(raw)) {
    errors.push(
      issue('ERR_SCENE_INVALID_OBJECT', field, 'El croquis debe ser un objeto.'),
    );
    return null;
  }
  let valid = true;

  const planeOk =
    typeof raw.plane === 'string' &&
    (SKETCH_PLANES as readonly string[]).includes(raw.plane);
  if (!planeOk) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        `${field}.plane`,
        `Plano desconocido. Se espera uno de: ${SKETCH_PLANES.join(', ')}.`,
      ),
    );
    valid = false;
  }

  const planeOriginMm = validatePoint3(
    raw.planeOriginMm,
    `${field}.planeOriginMm`,
    errors,
  );
  if (planeOriginMm === null) valid = false;

  if (raw.closed !== true) {
    errors.push(
      issue(
        'ERR_SCENE_DEGENERATE_SKETCH',
        `${field}.closed`,
        'En el MVP un croquis almacenado debe ser cerrado (closed: true).',
      ),
    );
    valid = false;
  }

  // Vértices: cada punto debe ser [entero, entero] dentro de cota.
  let points: MmPoint2[] | null = null;
  if (!Array.isArray(raw.pointsMm)) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        `${field}.pointsMm`,
        'Debe ser la lista de vértices [x, y] en mm enteros.',
      ),
    );
    valid = false;
  } else {
    const collected: MmPoint2[] = [];
    let pointsValid = true;
    raw.pointsMm.forEach((point, index) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !isMmCoordinate(point[0]) ||
        !isMmCoordinate(point[1])
      ) {
        errors.push(
          issue(
            'ERR_SCENE_INVALID_OBJECT',
            `${field}.pointsMm[${index}]`,
            `Vértice inválido: se espera [x, y] de mm enteros dentro de ±${SCENE_LIMITS.coordinateMm.max}.`,
          ),
        );
        pointsValid = false;
        return;
      }
      collected.push([point[0], point[1]] as const);
    });
    if (pointsValid) points = collected;
  }

  // Degeneración (solo tiene sentido evaluarla con vértices válidos).
  if (points !== null) {
    if (points.length < 3) {
      errors.push(
        issue(
          'ERR_SCENE_DEGENERATE_SKETCH',
          `${field}.pointsMm`,
          `Un croquis necesita al menos 3 vértices (recibidos: ${points.length}).`,
        ),
      );
      valid = false;
    } else {
      const first = points[0];
      const last = points[points.length - 1];
      if (
        first !== undefined &&
        last !== undefined &&
        first[0] === last[0] &&
        first[1] === last[1]
      ) {
        errors.push(
          issue(
            'ERR_SCENE_DEGENERATE_SKETCH',
            `${field}.pointsMm`,
            'El primer vértice no debe repetirse al final: el cierre es implícito (closed: true).',
          ),
        );
        valid = false;
      }
      if (signedDoubleAreaMm2(points) === 0) {
        errors.push(
          issue(
            'ERR_SCENE_DEGENERATE_SKETCH',
            `${field}.pointsMm`,
            'El croquis tiene área nula (polígono degenerado).',
          ),
        );
        valid = false;
      }
    }
  }

  if (!valid || points === null || planeOriginMm === null || !planeOk) {
    return null;
  }
  return {
    plane: raw.plane as SketchPlane,
    planeOriginMm,
    pointsMm: points,
    closed: true,
  };
}

function validateExtrusion(
  raw: unknown,
  field: string,
  errors: SceneIssue[],
): number | null {
  if (
    !isPositiveIntegerMm(raw) ||
    raw > SCENE_LIMITS.extrusionMm.max
  ) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_EXTRUSION',
        field,
        `La extrusión debe ser un entero en [${SCENE_LIMITS.extrusionMm.min}, ${SCENE_LIMITS.extrusionMm.max}] mm.`,
      ),
    );
    return null;
  }
  return raw;
}

function validateGeometry(
  raw: unknown,
  field: string,
  errors: SceneIssue[],
): SceneGeometryRef | null {
  if (!isRecord(raw)) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        field,
        'El objeto "geometry" es obligatorio.',
      ),
    );
    return null;
  }
  if (raw.source === 'sketch') {
    const sketch = validateSketch(raw.sketch, `${field}.sketch`, errors);
    const extrusionMm = validateExtrusion(
      raw.extrusionMm,
      `${field}.extrusionMm`,
      errors,
    );
    if (sketch === null || extrusionMm === null) return null;
    return { source: 'sketch', sketch, extrusionMm };
  }
  if (raw.source === 'kernel') {
    if (!isNonEmptyString(raw.key)) {
      errors.push(
        issue(
          'ERR_SCENE_INVALID_OBJECT',
          `${field}.key`,
          'La referencia de kernel requiere una clave de caché no vacía.',
        ),
      );
      return null;
    }
    return { source: 'kernel', key: raw.key };
  }
  errors.push(
    issue(
      'ERR_SCENE_INVALID_OBJECT',
      `${field}.source`,
      'Fuente de geometría desconocida. Se espera "sketch" o "kernel".',
    ),
  );
  return null;
}

/** Copia propia (sin contaminación de prototipos) con semántica de definición. */
function setOwn(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Sanitiza `params` a JSON serializable: números **finitos**, cadenas,
 * booleanos, listas y objetos anidados. Devuelve null con error acumulado
 * ante cualquier valor no serializable, clave reservada peligrosa tratada
 * como dato o profundidad excesiva.
 */
function sanitizeParamValue(
  value: unknown,
  field: string,
  depth: number,
  errors: SceneIssue[],
): SceneParamValue | null {
  if (depth > SCENE_LIMITS.paramsMaxDepth) {
    errors.push(
      issue(
        'ERR_SCENE_PARAMS_OUT_OF_RANGE',
        field,
        `Profundidad máxima de parámetros excedida (${SCENE_LIMITS.paramsMaxDepth}).`,
      ),
    );
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      errors.push(
        issue(
          'ERR_SCENE_PARAMS_OUT_OF_RANGE',
          field,
          'Número no finito (NaN/Infinity) en parámetros.',
        ),
      );
      return null;
    }
    return value;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    const out: SceneParamValue[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const item = sanitizeParamValue(
        value[i],
        `${field}[${i}]`,
        depth + 1,
        errors,
      );
      if (item === null) return null;
      out.push(item);
    }
    return out;
  }
  if (isRecord(value)) {
    const out: Record<string, SceneParamValue> = {};
    for (const key of Object.keys(value)) {
      const item = sanitizeParamValue(
        value[key],
        `${field}.${key}`,
        depth + 1,
        errors,
      );
      if (item === null) return null;
      setOwn(out, key, item);
    }
    return out;
  }
  errors.push(
    issue(
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      field,
      'Valor de parámetro no serializable (se admite número finito, cadena, booleano, lista u objeto).',
    ),
  );
  return null;
}

/** Valida los parámetros declarados de un componente contra su esquema. */
function validateParamsAgainstSchema(
  params: SceneParams,
  def: ComponentDefRef,
  field: string,
  errors: SceneIssue[],
): boolean {
  const schema = def.paramsSchema;
  if (schema === undefined) return true;
  let valid = true;
  for (const [key, spec] of Object.entries(schema)) {
    const value = params[key];
    if (value === undefined) continue; // los parámetros son opcionales
    const paramField = `${field}.${key}`;
    const kindMatches =
      (spec.kind === 'number' && typeof value === 'number') ||
      (spec.kind === 'string' && typeof value === 'string') ||
      (spec.kind === 'boolean' && typeof value === 'boolean');
    if (!kindMatches) {
      errors.push(
        issue(
          'ERR_SCENE_PARAMS_OUT_OF_RANGE',
          paramField,
          `El parámetro debe ser de tipo "${spec.kind}".`,
        ),
      );
      valid = false;
      continue;
    }
    if (spec.kind === 'number' && typeof value === 'number') {
      if (spec.min !== undefined && value < spec.min) {
        errors.push(
          issue(
            'ERR_SCENE_PARAMS_OUT_OF_RANGE',
            paramField,
            `Valor ${value} por debajo del mínimo ${spec.min}.`,
          ),
        );
        valid = false;
      }
      if (spec.max !== undefined && value > spec.max) {
        errors.push(
          issue(
            'ERR_SCENE_PARAMS_OUT_OF_RANGE',
            paramField,
            `Valor ${value} por encima del máximo ${spec.max}.`,
          ),
        );
        valid = false;
      }
    }
  }
  // Nota: los parámetros NO declarados en el esquema se admiten (JSON
  // serializable) — necesario para parámetros anidados como un WardrobeConfig
  // completo, cuyo rango valida geometry-core al construir el componente.
  return valid;
}

function validateComponent(
  raw: Record<string, unknown>,
  field: string,
  registry: ComponentRegistry | undefined,
  errors: SceneIssue[],
): { params?: SceneParams } | null {
  let valid = true;
  let params: SceneParams | undefined;

  if (!isNonEmptyString(raw.type)) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        `${field}.type`,
        'Un componente requiere "type" (cadena no vacía).',
      ),
    );
    valid = false;
  }
  if (!isPositiveIntegerMm(raw.version)) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        `${field}.version`,
        'Un componente requiere "version" (entero ≥ 1).',
      ),
    );
    valid = false;
  }

  if (raw.params !== undefined) {
    if (!isRecord(raw.params)) {
      errors.push(
        issue(
          'ERR_SCENE_PARAMS_OUT_OF_RANGE',
          `${field}.params`,
          'Los parámetros deben ser un objeto.',
        ),
      );
      valid = false;
    } else {
      const sanitized = sanitizeParamValue(
        raw.params,
        `${field}.params`,
        0,
        errors,
      );
      if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
        valid = false;
      } else {
        params = sanitized as SceneParams;
      }
    }
  }

  // Contra el registro (solo si la forma es válida: evita ruido en cascada).
  if (registry !== undefined && isNonEmptyString(raw.type)) {
    const def = Object.hasOwn(registry, raw.type)
      ? registry[raw.type]
      : undefined;
    if (def === undefined) {
      errors.push(
        issue(
          'ERR_SCENE_UNKNOWN_COMPONENT',
          `${field}.type`,
          `Tipo de componente no registrado: "${raw.type}".`,
        ),
      );
      valid = false;
    } else if (
      isPositiveIntegerMm(raw.version) &&
      def.version !== raw.version
    ) {
      errors.push(
        issue(
          'ERR_SCENE_UNKNOWN_COMPONENT',
          `${field}.version`,
          `Versión ${raw.version} no registrada para "${raw.type}" (registrada: ${def.version}).`,
        ),
      );
      valid = false;
    } else if (params !== undefined) {
      valid = validateParamsAgainstSchema(
        params,
        def,
        `${field}.params`,
        errors,
      ) && valid;
    }
  }

  return valid ? { params } : null;
}

/**
 * Valida la lista de objetos. `materialIds` es `null` cuando la colección de
 * materiales no es evaluable (errores ya acumulados); en ese caso la
 * referencia `materialId` solo se valida como cadena no vacía, sin emitir un
 * error en cascada por cada objeto (evita ruido diagnóstico: la causa raíz
 * ya está reportada en `materials`).
 */
function validateObjects(
  raw: unknown,
  materialIds: ReadonlySet<string> | null,
  registry: ComponentRegistry | undefined,
  errors: SceneIssue[],
): SceneObject[] | null {
  if (!Array.isArray(raw)) {
    errors.push(
      issue('ERR_SCENE_INVALID_OBJECT', 'objects', 'Debe ser una lista.'),
    );
    return null;
  }
  const objects: SceneObject[] = [];
  const seenIds = new Set<string>();
  let valid = true;
  raw.forEach((entry, index) => {
    const field = `objects[${index}]`;
    if (!isRecord(entry)) {
      errors.push(
        issue('ERR_SCENE_INVALID_OBJECT', field, 'Debe ser un objeto.'),
      );
      valid = false;
      return;
    }
    let objectOk = true;

    if (!isNonEmptyString(entry.id)) {
      errors.push(
        issue(
          'ERR_SCENE_INVALID_OBJECT',
          `${field}.id`,
          'Un objeto requiere "id" (cadena no vacía, determinista).',
        ),
      );
      objectOk = false;
    } else if (seenIds.has(entry.id)) {
      errors.push(
        issue(
          'ERR_SCENE_DUPLICATE_ID',
          `${field}.id`,
          `Id de objeto duplicado: "${entry.id}".`,
        ),
      );
      objectOk = false;
    } else {
      seenIds.add(entry.id);
    }

    if (!isNonEmptyString(entry.name)) {
      errors.push(
        issue(
          'ERR_SCENE_INVALID_OBJECT',
          `${field}.name`,
          'Un objeto requiere "name" (cadena no vacía).',
        ),
      );
      objectOk = false;
    }

    const transform = validateTransform(
      entry.transform,
      `${field}.transform`,
      errors,
    );
    if (transform === null) objectOk = false;

    if (!isNonEmptyString(entry.materialId)) {
      errors.push(
        issue(
          'ERR_SCENE_INVALID_OBJECT',
          `${field}.materialId`,
          'Un objeto requiere "materialId" (cadena no vacía).',
        ),
      );
      objectOk = false;
    } else if (materialIds !== null && !materialIds.has(entry.materialId)) {
      errors.push(
        issue(
          'ERR_SCENE_UNKNOWN_MATERIAL',
          `${field}.materialId`,
          `materialId inexistente: "${entry.materialId}".`,
        ),
      );
      objectOk = false;
    }

    if (entry.kind === 'solid') {
      const geometry = validateGeometry(
        entry.geometry,
        `${field}.geometry`,
        errors,
      );
      if (geometry === null) objectOk = false;
      if (objectOk && transform !== null && geometry !== null) {
        const solid: SolidObject = {
          id: entry.id as string,
          kind: 'solid',
          name: entry.name as string,
          transform,
          geometry,
          materialId: entry.materialId as string,
        };
        objects.push(solid);
      } else {
        valid = false;
      }
      return;
    }

    if (entry.kind === 'component') {
      const component = validateComponent(entry, field, registry, errors);
      if (component === null) objectOk = false;
      if (objectOk && transform !== null) {
        const instance: ComponentInstance = {
          id: entry.id as string,
          kind: 'component',
          name: entry.name as string,
          type: entry.type as string,
          version: entry.version as number,
          transform,
          materialId: entry.materialId as string,
          ...(component?.params !== undefined
            ? { params: component.params }
            : {}),
        };
        objects.push(instance);
      } else {
        valid = false;
      }
      return;
    }

    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        `${field}.kind`,
        'Kind desconocido. Se espera "solid" o "component".',
      ),
    );
    valid = false;
  });
  return valid ? objects : null;
}

/**
 * Valida una entrada desconocida como Scene Document v1.
 *
 * Recopila **todos** los errores (no para en el primero) y, en caso
 * exitoso, devuelve un documento **reconstruido y congelado** (I3): las
 * claves desconocidas de la entrada no sobreviven al pasar por aquí.
 *
 * Determinista: misma entrada → mismos errores, en el mismo orden.
 */
export function validateSceneDocument(
  input: unknown,
  options: SceneValidationOptions = {},
): SceneValidationResult {
  const errors: SceneIssue[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        issue(
          'ERR_SCENE_INVALID_OBJECT',
          'root',
          'El documento debe ser un objeto.',
        ),
      ],
    };
  }

  if (input.documentVersion !== SCENE_DOCUMENT_VERSION) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_VERSION',
        'documentVersion',
        `Versión de documento no soportada. Se espera ${SCENE_DOCUMENT_VERSION}.`,
      ),
    );
  }

  if (!isNonEmptyString(input.id)) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        'id',
        'El documento requiere "id" (cadena no vacía, determinista).',
      ),
    );
  }

  if (!isNonEmptyString(input.name)) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        'name',
        'El documento requiere "name" (cadena no vacía).',
      ),
    );
  }

  if (
    !isPositiveIntegerMm(input.gridStepMm) ||
    input.gridStepMm > SCENE_LIMITS.gridStepMm.max
  ) {
    errors.push(
      issue(
        'ERR_SCENE_INVALID_OBJECT',
        'gridStepMm',
        `El paso de rejilla debe ser un entero en [${SCENE_LIMITS.gridStepMm.min}, ${SCENE_LIMITS.gridStepMm.max}] mm.`,
      ),
    );
  }

  const originMm = validatePoint3(input.originMm, 'originMm', errors);

  const materials = validateMaterials(input.materials, errors);
  const materialIds: ReadonlySet<string> | null =
    materials === null
      ? null
      : new Set(materials.map((material) => material.id));
  const objects = validateObjects(
    input.objects,
    materialIds,
    options.components,
    errors,
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const document: SceneDocument = deepFreeze({
    documentVersion: SCENE_DOCUMENT_VERSION,
    id: input.id as string,
    name: input.name as string,
    gridStepMm: input.gridStepMm as number,
    originMm: originMm as MmPoint3,
    objects: objects as SceneObject[],
    materials: materials as SceneMaterial[],
  });
  return { ok: true, document };
}
