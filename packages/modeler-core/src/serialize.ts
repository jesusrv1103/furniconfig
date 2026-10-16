/**
 * Serialización del documento de escena (FASE-4B-B, paso 8 del MVP).
 *
 * Fuente de verdad: `PROPOSED_ARCHITECTURE.md` §3.8 y
 * `SCENE_DOCUMENT.md` §5. Formato propio versionado, molde heredado de
 * `apps/web/src/lib/designs/transfer.ts` (`serializeDesign` /
 * `parseDesignExport`).
 *
 * Reglas:
 *
 * - `SCENE_FORMAT` + `SCENE_FORMAT_VERSION` marcadores estables del sobre.
 * - `serializeScene` **valida antes de escribir**: un documento inválido
 *   jamás sale del paquete (error en origen, no en destino).
 * - `parseSceneEnvelope` trata todo el texto como **hostil** y devuelve un
 *   resultado discriminado (patrón ADR-005, igual que el validador) en
 *   lugar de lanzar: JSON malformado, marcador incorrecto, sobre no
 *   estructural o versión desconocida → `ok: false` con código estable.
 *   Sin migraciones silenciosas: una versión desconocida se rechaza.
 * - El documento se revalida con `validateSceneDocument` (autoridad): sus
 *   códigos de error se reutilizan tal cual; las claves desconocidas del
 *   sobre (p. ej. `geometryCache`, diferido a 4B-C) se **ignoran**
 *   (tolerancia hacia adelante) y nunca se propagan al documento.
 * - Seguridad de prototipos: `JSON.parse` crea propias propiedades (una
 *   clave hostil `__proto__` no contamina) y el validador reconstruye el
 *   documento campo a campo con `Object.defineProperty` en `params`, de
 *   modo que ningún prototipo queda alterado.
 *
 * Fuera de alcance en v1 (documentado en `SCENE_DOCUMENT.md`): historial de
 * comandos, estado de UI y `geometryCache` — el sobre transporta **solo**
 * el documento validado.
 */

import { SceneError, type SceneErrorCode, type SceneIssue } from './errors.js';
import type { SceneDocument } from './types/document.js';
import {
  validateSceneDocument,
  type SceneValidationOptions,
} from './validate.js';

/** Marcador de formato de los archivos de escena. */
export const SCENE_FORMAT = 'furniconfig-scene';

/** Versión del sobre. Cambios de forma → bump (rechazo de versiones ajenas). */
export const SCENE_FORMAT_VERSION = 1;

/**
 * Envoltorio versionado del archivo de escena.
 *
 * Delta respecto a `PROPOSED_ARCHITECTURE.md` §3.8 (FASE-4B-B): el campo
 * opcional `geometryCache` **no** existe en v1 (diferido a 4B-C). Los
 * sobres que lo traigan se parsean ignorándolo.
 */
export interface SceneEnvelope {
  readonly format: typeof SCENE_FORMAT;
  readonly version: typeof SCENE_FORMAT_VERSION;
  readonly document: SceneDocument;
}

/**
 * Resultado discriminado de `parseSceneEnvelope` (nunca lanza para entrada
 * hostil). En `ok: false`, `issues` contiene los hallazgos de validación
 * cuando proceden (vacío en errores estructurales del sobre).
 */
export type ParseSceneEnvelopeResult =
  | { readonly ok: true; readonly document: SceneDocument }
  | {
      readonly ok: false;
      readonly code: SceneErrorCode;
      readonly message: string;
      readonly issues: readonly SceneIssue[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalid(
  code: SceneErrorCode,
  message: string,
  issues: readonly SceneIssue[] = [],
): ParseSceneEnvelopeResult {
  return { ok: false, code, message, issues };
}

/**
 * Serializa un documento validado como sobre JSON legible y versionado.
 *
 * El documento se revalida (y se empaqueta **reconstruido**: sin claves
 * desconocidas) antes de escribir; `JSON.stringify` no puede fallar sobre
 * la salida porque el validador garantiza JSON finito y acíclico.
 *
 * @throws SceneError con el código del primer hallazgo si el documento no
 * es válido: "error antes de escribir".
 * @param options registro de componentes, para validar `params` contra su
 * esquema además de estructuralmente.
 */
export function serializeScene(
  document: SceneDocument,
  options: SceneValidationOptions = {},
): string {
  const validated = validateSceneDocument(document, options);
  if (!validated.ok) {
    const first = validated.errors[0];
    throw new SceneError(
      first?.code ?? 'ERR_SCENE_INVALID_OBJECT',
      `No se serializa un documento inválido (${validated.errors.length} error(s); primer campo: ${first?.field ?? 'desconocido'}).`,
      { field: first?.field ?? 'root' },
    );
  }
  const envelope: SceneEnvelope = {
    format: SCENE_FORMAT,
    version: SCENE_FORMAT_VERSION,
    document: validated.document,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parsea y valida un archivo de escena. **No lanza**: todo el contenido se
 * considera hostil y los fallos vuelven como `{ ok: false, code, ... }`.
 *
 * Orden de comprobaciones (patrón `parseDesignExport`): JSON → sobre →
 * marcador → versión → documento validado con `validateSceneDocument`.
 *
 * @param options registro de componentes para la validación del documento.
 */
export function parseSceneEnvelope(
  text: string,
  options: SceneValidationOptions = {},
): ParseSceneEnvelopeResult {
  if (typeof text !== 'string') {
    return invalid(
      'ERR_SCENE_ENVELOPE_INVALID',
      'El contenido debe ser una cadena JSON.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return invalid(
      'ERR_SCENE_ENVELOPE_INVALID',
      'El contenido no es JSON válido.',
    );
  }

  if (!isRecord(parsed)) {
    return invalid(
      'ERR_SCENE_ENVELOPE_INVALID',
      'El sobre de escena debe ser un objeto JSON.',
    );
  }

  if (parsed.format !== SCENE_FORMAT) {
    return invalid(
      'ERR_SCENE_ENVELOPE_INVALID',
      'El archivo no es una escena de FurniConfig.',
    );
  }

  if (parsed.version !== SCENE_FORMAT_VERSION) {
    return invalid(
      'ERR_SCENE_ENVELOPE_VERSION',
      `Versión de escena no soportada: ${String(parsed.version)} (se espera ${SCENE_FORMAT_VERSION}). Sin migración automática.`,
    );
  }

  if (!isRecord(parsed.document)) {
    return invalid(
      'ERR_SCENE_ENVELOPE_INVALID',
      'El sobre no contiene un documento de escena.',
    );
  }

  const validated = validateSceneDocument(parsed.document, options);
  if (!validated.ok) {
    const first = validated.errors[0];
    return {
      ok: false,
      code: first?.code ?? 'ERR_SCENE_INVALID_OBJECT',
      message: `Documento de escena inválido (${validated.errors.length} error(s); primer campo: ${first?.field ?? 'desconocido'}).`,
      issues: validated.errors,
    };
  }

  return { ok: true, document: validated.document };
}
