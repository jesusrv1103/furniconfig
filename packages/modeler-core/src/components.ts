/**
 * Componentes paramétricos: registro versionado y construcción de la
 * geometría derivada (FASE-4B-D).
 *
 * Fuente de verdad: `PROPOSED_ARCHITECTURE.md` §3.9 y el contrato mínimo de
 * `types/component.ts`. Principios:
 *
 * - `modeler-core` sigue **puro** (I5): este módulo no depende de
 *   `geometry-core` ni de `kernel-adapter`. Las definiciones concretas que
 *   delegan en el motor del clóset se componen en la capa de adaptadores
 *   (`apps/web/src/lib/modeler/`).
 * - `build()` es **puro y determinista**: mismas params → mismas piezas en
 *   el mismo orden; las pruebas lo verifican (D1).
 * - La geometría derivada **nunca se almacena** en `SceneDocument`: solo
 *   existen `params` (verdad persistente) y `ComponentBuild` (derivada,
 *   regenerable a demanda).
 * - Frontera estricta: `buildComponent` valida el registro, la versión, los
 *   params contra el esquema declarado y la **forma** de las piezas
 *   devueltas; los ids de pieza se estampan deterministamente con el id del
 *   objeto (`objeto::pieza`), estables entre regeneraciones.
 */

import { SceneError, type SceneIssue } from './errors.js';
import { deepFreeze } from './freeze.js';
import { validateParamsAgainstSchema } from './validate.js';
import type {
  ComponentBuild,
  ComponentDefRef,
  ComponentPart,
  ParametricComponentDef,
  ParametricComponentRegistry,
} from './types/component.js';
import type { SceneParams } from './types/document.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveIntegerMm(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Número finito en mm. Las piezas derivadas admiten el medio milímetro que
 * el motor de clósets emite al centrar barras (p. ej. `z: 277.5`): preservar
 * el valor exacto prima sobre I1 (que aplica al documento persistente).
 */
function isFiniteMm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Longitud/diámetro/tamaño positivo y finito (acepta medios mm). */
function isPositiveFiniteMm(value: unknown): value is number {
  return isFiniteMm(value) && value > 0;
}

/**
 * Id determinista y estable de una pieza dentro de la escena:
 * `${objectId}::${partIdLocal}`. Mismo objeto y mismas params → mismos ids
 * (I4: sin UUID); el prefijo evita colisiones entre objetos.
 */
export function componentPartId(objectId: string, partIdLocal: string): string {
  return `${objectId}::${partIdLocal}`;
}

/**
 * Valida la forma de una definición completa y la devuelve congelada.
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` si el tipo, la versión, el
 * esquema o `build` tienen forma inválida (error de programación: una
 * definición nunca debe registrarse corrupta).
 */
export function defineComponent(
  def: ParametricComponentDef,
): ParametricComponentDef {
  if (typeof def !== 'object' || def === null) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'La definición de componente debe ser un objeto.',
    );
  }
  if (!isNonEmptyString(def.type)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'La definición de componente requiere "type" (cadena no vacía).',
      { type: String(def.type) },
    );
  }
  if (!isPositiveIntegerMm(def.version)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `La definición "${def.type}" requiere "version" (entero ≥ 1).`,
      { type: def.type, version: String(def.version) },
    );
  }
  if (typeof def.build !== 'function') {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `La definición "${def.type}" requiere una función build(params).`,
      { type: def.type },
    );
  }
  const schema = def.paramsSchema;
  if (schema !== undefined) {
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
      throw new SceneError(
        'ERR_SCENE_INVALID_OBJECT',
        `El paramsSchema de "${def.type}" debe ser un registro de especificaciones.`,
        { type: def.type },
      );
    }
    for (const [key, spec] of Object.entries(schema)) {
      const valid =
        typeof spec === 'object' &&
        spec !== null &&
        (spec.kind === 'number' || spec.kind === 'string' || spec.kind === 'boolean') &&
        (spec.min === undefined ||
          (typeof spec.min === 'number' && Number.isFinite(spec.min))) &&
        (spec.max === undefined ||
          (typeof spec.max === 'number' && Number.isFinite(spec.max))) &&
        (spec.min === undefined ||
          spec.max === undefined ||
          spec.min <= spec.max);
      if (!valid) {
        throw new SceneError(
          'ERR_SCENE_INVALID_OBJECT',
          `Especificación inválida del parámetro "${key}" en "${def.type}" (kind/min/max).`,
          { type: def.type, param: key },
        );
      }
    }
  }
  return deepFreeze({ ...def });
}

/**
 * Crea un registro de definiciones completas validando cada entrada y
 * rechazando tipos duplicados (un solo `version` por `type`).
 *
 * @throws SceneError `ERR_SCENE_INVALID_OBJECT` ante definición malformada
 * o tipo duplicado.
 */
export function createComponentRegistry(
  defs: readonly ParametricComponentDef[],
): ParametricComponentRegistry {
  if (!Array.isArray(defs)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'createComponentRegistry espera una lista de definiciones.',
    );
  }
  const registry: Record<string, ParametricComponentDef> = {};
  for (const raw of defs) {
    const def = defineComponent(raw);
    if (Object.hasOwn(registry, def.type)) {
      throw new SceneError(
        'ERR_SCENE_INVALID_OBJECT',
        `Tipo de componente duplicado en el registro: "${def.type}".`,
        { type: def.type },
      );
    }
    registry[def.type] = def;
  }
  return deepFreeze(registry);
}

/** Forma de una pieza bien formada (frontera de `build`). */
function partShapeError(part: unknown, index: number): string | null {
  if (typeof part !== 'object' || part === null || Array.isArray(part)) {
    return `parts[${index}] debe ser un objeto.`;
  }
  const record = part as Record<string, unknown>;
  if (!isNonEmptyString(record.partId)) {
    return `parts[${index}].partId debe ser una cadena no vacía.`;
  }
  if (!isNonEmptyString(record.role)) {
    return `parts[${index}].role debe ser una cadena no vacía.`;
  }
  if (record.materialId !== undefined && !isNonEmptyString(record.materialId)) {
    return `parts[${index}].materialId debe ser una cadena no vacía.`;
  }
  if (record.moduleId !== undefined && !isNonEmptyString(record.moduleId)) {
    return `parts[${index}].moduleId debe ser una cadena no vacía.`;
  }
  if (record.assemblyId !== undefined && !isNonEmptyString(record.assemblyId)) {
    return `parts[${index}].assemblyId debe ser una cadena no vacía.`;
  }
  if (
    record.assemblyIndex !== undefined &&
    !(typeof record.assemblyIndex === 'number' && Number.isInteger(record.assemblyIndex) && record.assemblyIndex >= 1)
  ) {
    return `parts[${index}].assemblyIndex debe ser un entero ≥ 1.`;
  }
  if (record.doorId !== undefined && !isNonEmptyString(record.doorId)) {
    return `parts[${index}].doorId debe ser una cadena no vacía.`;
  }
  if (
    record.hingeSide !== undefined &&
    record.hingeSide !== 'left' &&
    record.hingeSide !== 'right'
  ) {
    return `parts[${index}].hingeSide debe ser "left" o "right".`;
  }
  if (
    record.leafIndex !== undefined &&
    !(typeof record.leafIndex === 'number' && Number.isInteger(record.leafIndex) && record.leafIndex >= 1)
  ) {
    return `parts[${index}].leafIndex debe ser un entero ≥ 1.`;
  }
  if (record.leafCount !== undefined && record.leafCount !== 1 && record.leafCount !== 2) {
    return `parts[${index}].leafCount debe ser 1 o 2.`;
  }
  const position = record.positionMm;
  const positionOk =
    Array.isArray(position) &&
    position.length === 3 &&
    position.every((value) => isFiniteMm(value));
  if (!positionOk) {
    return `parts[${index}].positionMm debe ser [x, y, z] de mm finitos.`;
  }
  if (record.kind === 'box') {
    const size = record.sizeMm;
    const sizeOk =
      Array.isArray(size) &&
      size.length === 3 &&
      size.every((value) => isPositiveFiniteMm(value));
    if (!sizeOk) {
      return `parts[${index}].sizeMm debe ser [x, y, z] de mm positivos y finitos.`;
    }
    return null;
  }
  if (record.kind === 'cylinder') {
    if (record.axis !== 'x' && record.axis !== 'y' && record.axis !== 'z') {
      return `parts[${index}].axis debe ser "x", "y" o "z".`;
    }
    if (!isPositiveFiniteMm(record.lengthMm)) {
      return `parts[${index}].lengthMm debe ser un mm positivo y finito.`;
    }
    if (!isPositiveFiniteMm(record.diameterMm)) {
      return `parts[${index}].diameterMm debe ser un mm positivo y finito.`;
    }
    return null;
  }
  return `parts[${index}].kind debe ser "box" o "cylinder" (sin simplificaciones).`;
}

/**
 * Construye la geometría derivada de un componente registrado.
 *
 * Flujo: registro → versión → params contra `paramsSchema` → `build()` →
 * validación de la forma de las piezas → ids namespaced → congelado.
 *
 * @param objectId id de la instancia de escena; se antepone a los ids
 * locales de las piezas (`componentPartId`), estables entre regeneraciones.
 * @throws SceneError
 * - `ERR_SCENE_UNKNOWN_COMPONENT`: tipo no registrado o versión distinta.
 * - `ERR_SCENE_PARAMS_OUT_OF_RANGE`: params contra el esquema declarado, o
 *   `build` lanzó este código (p. ej. el clóset delegando en `geometry-core`).
 * - `ERR_SCENE_INVALID_OBJECT`: forma inválida de params o de las piezas
 *   devueltas por `build` (error de programación del def).
 */
export function buildComponent(
  registry: ParametricComponentRegistry,
  objectId: string,
  type: string,
  version: number,
  params: SceneParams,
): ComponentBuild {
  if (typeof registry !== 'object' || registry === null) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      'buildComponent requiere un registro de definiciones.',
    );
  }
  if (!Object.hasOwn(registry, type)) {
    throw new SceneError(
      'ERR_SCENE_UNKNOWN_COMPONENT',
      `Tipo de componente no registrado: "${type}".`,
      { type },
    );
  }
  const def: ParametricComponentDef | undefined = registry[type];
  if (def === undefined) {
    throw new SceneError(
      'ERR_SCENE_UNKNOWN_COMPONENT',
      `Tipo de componente no registrado: "${type}".`,
      { type },
    );
  }
  if (def.version !== version) {
    throw new SceneError(
      'ERR_SCENE_UNKNOWN_COMPONENT',
      `Versión ${version} no registrada para "${type}" (registrada: ${def.version}).`,
      { type, version: String(version) },
    );
  }
  if (
    typeof params !== 'object' ||
    params === null ||
    Array.isArray(params)
  ) {
    throw new SceneError(
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      `Los parámetros de "${type}" deben ser un objeto.`,
      { type },
    );
  }

  const schemaIssues: SceneIssue[] = [];
  const schemaOk = validateParamsAgainstSchema(
    params,
    def as ComponentDefRef,
    'params',
    schemaIssues,
  );
  if (!schemaOk) {
    const first = schemaIssues[0];
    throw new SceneError(
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      `Parámetros fuera de rango para "${type}": ${first?.message ?? 'esquema incumplido'}`,
      { type, param: first?.field ?? 'params' },
    );
  }

  let build: ComponentBuild;
  try {
    build = def.build(params);
  } catch (error) {
    if (error instanceof SceneError) throw error;
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `El componente "${type}" falló al construir: ${error instanceof Error ? error.message : String(error)}`,
      { type },
    );
  }

  if (typeof build !== 'object' || build === null || !Array.isArray(build.parts)) {
    throw new SceneError(
      'ERR_SCENE_INVALID_OBJECT',
      `build("${type}") debe devolver { parts: ComponentPart[] }.`,
      { type },
    );
  }

  const seenLocalIds = new Set<string>();
  const parts: ComponentPart[] = build.parts.map((part, index) => {
    const shapeError = partShapeError(part, index);
    if (shapeError !== null) {
      throw new SceneError(
        'ERR_SCENE_INVALID_OBJECT',
        `build("${type}") devolvió una pieza inválida: ${shapeError}`,
        { type, part: String(index) },
      );
    }
    const local = (part as { partId: string }).partId;
    if (seenLocalIds.has(local)) {
      throw new SceneError(
        'ERR_SCENE_INVALID_OBJECT',
        `build("${type}") devolvió partId duplicado: "${local}".`,
        { type, partId: local },
      );
    }
    seenLocalIds.add(local);
    return { ...(part as ComponentPart), partId: componentPartId(objectId, local) };
  });

  return deepFreeze({ parts });
}
