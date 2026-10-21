/**
 * WAVE-01 BLOQUE 3 — persistencia LOCAL de escenas del modelador.
 *
 * Reglas del mandato y decisiones:
 *
 * - **Namespace AISLADO** del configurador (`furniconfig.designs` y
 *   `furniconfig.session`, ver `lib/designs/local-storage.ts`): este
 *   almacén usa `furniconfig.modeler.designs` y NO comparte claves,
 *   formato ni repositorio con él. Son persistencias distintas.
 * - Reutiliza `SceneEnvelope` (`serializeScene` / `parseSceneEnvelope`
 *   de `modeler-core`): `serializeScene` **valida antes de escribir**
 *   (un documento inválido jamás llega a storage) y `parseSceneEnvelope`
 *   trata la entrada como hostil con códigos estables.
 * - **Sin pérdida silenciosa**: todo fallo es un resultado discriminado
 *   con `code` + `message`; la corrupción se expone al usuario y NUNCA
 *   se borra ni se sobrescribe automáticamente.
 * - **Sobrescritura solo explícita**: `saveSceneDesign` sobre un id
 *   existente es el «Guardar» del diseño activo (el flujo de la UI
 *   obliga a «Guardar como» con nombre para crear uno nuevo).
 * - **Sin mallas ni `KernelRef`**: se guarda SOLO el `SceneDocument`
 *   (el sobre v1 ya excluye geometría derivada e historial); la
 *   geometría se regenera al abrir por los circuitos existentes.
 * - **Storage inyectable** (funciones puras respecto al mundo): por
 *   defecto `globalThis.localStorage`; en tests, un doble en memoria.
 * - IDs deterministas (I4, sin UUID): `design-N` (máximo + 1).
 *
 * La regeneración de geometría, la instalación en el historial y los
 * diálogos (prompt/confirm) viven en la pantalla (`ModelerApp`); aquí
 * SOLO hay almacén puro.
 */

import {
  parseSceneEnvelope,
  serializeScene,
  type ParseSceneEnvelopeResult,
  type SceneDocument,
} from '@furniconfig/modeler-core';

/**
 * Prefijo de storage del modelador (aislado del configurador:
 * `furniconfig.designs` / `furniconfig.session` NO se tocan).
 * Cada diseño vive en `<KEY>.<id>` con un `SceneEnvelope` completo.
 */
export const MODELER_DESIGNS_STORAGE_KEY = 'furniconfig.modeler.designs';

/** Subconjunto de `Storage` que necesitan estas funciones. */
export interface SceneDesignStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Resumen de listado (NO parsea documentos completos más allá del nombre). */
export type SceneDesignSummary =
  | {
      readonly id: string;
      readonly name: string;
      /** El sobre existe pero no puede leerse: visible, jamás silencioso. */
      readonly corrupted: false;
    }
  | {
      readonly id: string;
      readonly name: null;
      readonly corrupted: true;
      readonly message: string;
    };

/** Resultado discriminado de una operación de escritura/gestión. */
export type SceneDesignSaveResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** Resultado de apertura: documento validado o error tipado. */
export type SceneDesignOpenResult =
  | { readonly ok: true; readonly id: string; readonly document: SceneDocument }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** `localStorage` del entorno o `null` (SSR/tests sin DOM). */
export function getDefaultSceneDesignStorage(): SceneDesignStorage | null {
  return (
    (globalThis as { localStorage?: SceneDesignStorage }).localStorage ?? null
  );
}

function designKey(id: string): string {
  return `${MODELER_DESIGNS_STORAGE_KEY}.${id}`;
}

function failure(code: string, message: string): {
  ok: false;
  code: string;
  message: string;
} {
  return { ok: false, code, message };
}

/**
 * Lista los diseños guardados por prefijo. Una entrada corrupta se
 * lista COMO corrupta (el usuario la ve y puede eliminarla); el
 * problema de una entrada no contamina a las demás.
 */
export function listSceneDesigns(
  storage: SceneDesignStorage,
): readonly SceneDesignSummary[] {
  const summaries: SceneDesignSummary[] = [];
  const prefix = `${MODELER_DESIGNS_STORAGE_KEY}.`;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    if (id === '') continue;
    const text = storage.getItem(key);
    if (text === null) continue;
    const parsed = parseSceneEnvelope(text);
    if (parsed.ok) {
      summaries.push({ id, name: parsed.document.name, corrupted: false });
    } else {
      summaries.push({
        id,
        name: null,
        corrupted: true,
        message: parsed.message,
      });
    }
  }
  // Orden determinista por id (`design-10` tras `design-2` no importa:
  // los ids se emiten por máximo creciente; aquí se ordena por longitud
  // y texto para que el listado sea estable entre renderizados).
  summaries.sort((a, b) =>
    a.id.length === b.id.length
      ? a.id.localeCompare(b.id)
      : a.id.length - b.id.length,
  );
  return summaries;
}

/**
 * Siguiente id determinista `design-N` (máximo numérico + 1; los ids
 * ajenos al patrón se ignoran y un id ya usado no colisiona nunca).
 */
export function nextSceneDesignId(storage: SceneDesignStorage): string {
  const prefix = `${MODELER_DESIGNS_STORAGE_KEY}.design-`;
  let max = 0;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(prefix)) continue;
    const digits = key.slice(prefix.length);
    if (!/^\d+$/.test(digits)) continue;
    const value = Number(digits);
    if (Number.isSafeInteger(value) && value > max) max = value;
  }
  return `design-${max + 1}`;
}

/** Diseño existente con id dado (o `null`). */
export function readSceneDesign(
  storage: SceneDesignStorage,
  id: string,
): SceneDesignOpenResult {
  if (id === '' || /[/\\.\s]/.test(id)) {
    return failure('ERR_DESIGN_INVALID_ID', `Id de diseño inválido: «${id}».`);
  }
  const text = storage.getItem(designKey(id));
  if (text === null) {
    return failure('ERR_DESIGN_NOT_FOUND', `No existe el diseño «${id}».`);
  }
  const parsed = parseSceneEnvelope(text);
  if (!parsed.ok) {
    return failure(
      parsed.code,
      `El diseño «${id}» está dañado o es incompatible: ${parsed.message}`,
    );
  }
  return { ok: true, id, document: parsed.document };
}

/**
 * Guarda `document` bajo `id` (creación o sobrescrita EXPLÍCITA del
 * mismo diseño). `serializeScene` valida: documento inválido → error
 * sin escribir NADA.
 */
export function saveSceneDesign(
  storage: SceneDesignStorage,
  id: string,
  document: SceneDocument,
): SceneDesignSaveResult {
  if (id === '' || /[/\\.\s]/.test(id)) {
    return failure('ERR_DESIGN_INVALID_ID', `Id de diseño inválido: «${id}».`);
  }
  let envelope: string;
  try {
    envelope = serializeScene(document);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'documento no serializable';
    return failure('ERR_DESIGN_SAVE_INVALID', `No se guardó nada: ${message}`);
  }
  try {
    storage.setItem(designKey(id), envelope);
  } catch (error) {
    // Cuota u otro fallo de storage: expuesto, nunca silencioso.
    const message = error instanceof Error ? error.message : 'storage fallo';
    return failure('ERR_DESIGN_STORAGE', `No se pudo escribir: ${message}`);
  }
  return { ok: true, id };
}

/**
 * Crea un diseño NUEVO con id determinista `design-N` (el nombre del
 * diseño es `document.name`, la fuente única para el listado).
 */
export function createSceneDesign(
  storage: SceneDesignStorage,
  document: SceneDocument,
): SceneDesignSaveResult {
  return saveSceneDesign(storage, nextSceneDesignId(storage), document);
}

/**
 * Renombra un diseño (solo el `name` del documento almacenado; el id
 * y el resto del documento quedan intactos). Sin diseño → error.
 */
export function renameSceneDesign(
  storage: SceneDesignStorage,
  id: string,
  nextName: string,
): SceneDesignSaveResult {
  const trimmed = nextName.trim();
  if (trimmed === '') {
    return failure('ERR_DESIGN_EMPTY_NAME', 'El nombre no puede estar vacío.');
  }
  const current = readSceneDesign(storage, id);
  if (!current.ok) return current;
  if (current.document.name === trimmed) return { ok: true, id };
  return saveSceneDesign(storage, id, { ...current.document, name: trimmed });
}

/**
 * Duplica un diseño a un id determinista nuevo con «(copia)» en el
 * nombre. El original queda intacto.
 */
export function duplicateSceneDesign(
  storage: SceneDesignStorage,
  id: string,
): SceneDesignSaveResult {
  const current = readSceneDesign(storage, id);
  if (!current.ok) return current;
  const newId = nextSceneDesignId(storage);
  const copy: SceneDocument = {
    ...current.document,
    name: `${current.document.name} (copia)`,
  };
  return saveSceneDesign(storage, newId, copy);
}

/** Elimina un diseño (la UI exige confirmación previa). */
export function deleteSceneDesign(
  storage: SceneDesignStorage,
  id: string,
): SceneDesignSaveResult {
  if (storage.getItem(designKey(id)) === null) {
    return failure('ERR_DESIGN_NOT_FOUND', `No existe el diseño «${id}».`);
  }
  storage.removeItem(designKey(id));
  return { ok: true, id };
}

/* ------------------------------------------------------------------ *
 * WAVE-02 BLOQUE 3 — borrador de sesión y metadatos de sesión.
 *
 * El borrador es la COPIA DE TRABAJO automática del documento que se
 * está editando (clave `furniconfig.modeler.draft`, un `SceneEnvelope`
 * igual que los diseños). Diferencias deliberadas con un diseño
 * guardado:
 *
 * - **Nunca sobrescribe un diseño guardado**: vive en su propia clave;
 *   escribir el borrador jamás toca `<KEY>.<id>` de diseños.
 * - **Recuperación segura al recargar**: `readSceneDraft` valida con
 *   `parseSceneEnvelope` (trata la entrada como hostil); un borrador
 *   dañado se reporta y NUNCA se borra automáticamente (solo la UI
 *   puede borrarlo con confirmación explícita del usuario).
 * - **Metadatos de sesión** en `furniconfig.modeler.session`: modo de
 *   presentación y diseño activo asociado al borrador (para saber qué
 *   diseño se continúa y poder calcular «Cambios sin guardar» contra su
 *   última versión guardada).
 * - JSON de metadatos hostil → modo cae a `simple` y `activeDesignId`
 *   a `null` (nunca un estado a medias; el documento solo llega validado).
 */

/** Clave del borrador de sesión (un `SceneEnvelope` completo). */
export const MODELER_DRAFT_STORAGE_KEY = 'furniconfig.modeler.draft';

/** Clave de metadatos de sesión (JSON propio, sin mezclar con nada). */
export const MODELER_SESSION_STORAGE_KEY = 'furniconfig.modeler.session';

/** Metadatos de la sesión de trabajo del modelador. */
export interface SceneSessionMeta {
  /** Diseño guardado al que pertenece el borrador (si lo hay). */
  readonly activeDesignId: string | null;
  /** Modo de presentación preferido del usuario. */
  readonly mode: 'simple' | 'advanced';
  /** Marca de tiempo (ms) de la última escritura del borrador. */
  readonly updatedAt: number;
}

/** Lectura discriminada del borrador. */
export type SceneDraftReadResult =
  | { readonly ok: true; readonly document: SceneDocument; readonly meta: SceneSessionMeta }
  | { readonly ok: false; readonly code: string; readonly message: string };

const MISSING_DRAFT_CODE = 'ERR_DRAFT_MISSING';

function defaultSessionMeta(): SceneSessionMeta {
  return { activeDesignId: null, mode: 'simple', updatedAt: 0 };
}

/**
 * Escribe el borrador (sobre validado) y sus metadatos. El sobre se
 * serializa ANTES de tocar storage: documento inválido → nada escrito.
 * Un fallo de escritura queda expuesto como resultado (nada silencioso).
 */
export function saveSceneDraft(
  storage: SceneDesignStorage,
  document: SceneDocument,
  meta: {
    readonly activeDesignId: string | null;
    readonly mode: 'simple' | 'advanced';
  },
): SceneDraftSaveResult {
  let envelope: string;
  try {
    envelope = serializeScene(document);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'documento no serializable';
    return failure('ERR_DRAFT_SAVE_INVALID', `No se guardó el borrador: ${message}`);
  }
  const session: SceneSessionMeta = {
    activeDesignId: meta.activeDesignId,
    mode: meta.mode,
    updatedAt: Date.now(),
  };
  try {
    storage.setItem(MODELER_DRAFT_STORAGE_KEY, envelope);
    storage.setItem(MODELER_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'storage fallo';
    return failure('ERR_DRAFT_STORAGE', `No se pudo escribir el borrador: ${message}`);
  }
  return { ok: true };
}

/** Resultado del guardado del borrador (sin id: es único por sesión). */
export type SceneDraftSaveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Lee el borrador. Ausente → `ERR_DRAFT_MISSING`; dañado/incompatible
 * → error con el código del parseo (el registro NO se elimina; la UI
 * ofrecerá «Descartar borrador» como acción explícita del usuario).
 */
export function readSceneDraft(storage: SceneDesignStorage): SceneDraftReadResult {
  const text = storage.getItem(MODELER_DRAFT_STORAGE_KEY);
  if (text === null) {
    return failure(MISSING_DRAFT_CODE, 'No hay borrador de sesión.');
  }
  const parsed = parseSceneEnvelope(text);
  if (!parsed.ok) {
    return failure(
      parsed.code,
      `El borrador de sesión está dañado o es incompatible: ${parsed.message}`,
    );
  }
  return {
    ok: true,
    document: parsed.document,
    meta: readSessionMeta(storage),
  };
}

/**
 * Metadatos de sesión tolerantes a fallos: JSON ausente o corrupto →
 * valores por defecto (el borrador sigue siendo usable; nada se borra).
 */
export function readSessionMeta(
  storage: SceneDesignStorage,
): SceneSessionMeta {
  const text = storage.getItem(MODELER_SESSION_STORAGE_KEY);
  if (text === null) return defaultSessionMeta();
  try {
    const raw: unknown = JSON.parse(text);
    if (raw === null || typeof raw !== 'object') return defaultSessionMeta();
    const record = raw as Record<string, unknown>;
    const activeDesignId =
      typeof record['activeDesignId'] === 'string' &&
      record['activeDesignId'] !== ''
        ? record['activeDesignId']
        : null;
    const mode = record['mode'] === 'advanced' ? 'advanced' : 'simple';
    const updatedAt =
      typeof record['updatedAt'] === 'number' &&
      Number.isFinite(record['updatedAt'])
        ? record['updatedAt']
        : 0;
    return { activeDesignId, mode, updatedAt };
  } catch {
    return defaultSessionMeta();
  }
}

/**
 * Borra borrador y metadatos (SOLO bajo confirmación explícita del
 * usuario: «Descartar borrador»). Un borrador dañado también puede
 * descartarse con esta misma acción.
 */
export function clearSceneDraft(storage: SceneDesignStorage): void {
  storage.removeItem(MODELER_DRAFT_STORAGE_KEY);
  storage.removeItem(MODELER_SESSION_STORAGE_KEY);
}

/** Reexporta el tipo de parseo para que la pantalla maneje códigos. */
export type { ParseSceneEnvelopeResult };
