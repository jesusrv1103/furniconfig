/**
 * Errores tipados del núcleo del modelador (FASE-4B-A).
 *
 * Los códigos (`SceneErrorCode`) son parte del contrato público del paquete:
 * son estables y deben documentarse cuando se añadan nuevos.
 *
 * UNION PROPIO Y SEPARADO: este paquete NO reutiliza `GeometryErrorCode` de
 * `geometry-core` (ni lo modifica). El motor del clóset y el documento de
 * escena son contratos distintos con ciclos de vida distintos
 * (`SCENE_DOCUMENT.md` §4).
 */

/** Códigos estables de error del documento de escena. */
export type SceneErrorCode =
  | 'ERR_SCENE_INVALID_VERSION'
  | 'ERR_SCENE_INVALID_OBJECT'
  | 'ERR_SCENE_DUPLICATE_ID'
  | 'ERR_SCENE_DEGENERATE_SKETCH'
  | 'ERR_SCENE_INVALID_EXTRUSION'
  | 'ERR_SCENE_UNKNOWN_MATERIAL'
  | 'ERR_SCENE_UNKNOWN_COMPONENT'
  | 'ERR_SCENE_PARAMS_OUT_OF_RANGE'
  | 'ERR_SCENE_TRANSFORM_INVALID'
  // --- Añadidos en FASE-4B-B (comandos y serialización) ---
  /** Un comando apunta a un objeto que no existe en el documento. */
  | 'ERR_SCENE_OBJECT_NOT_FOUND'
  /**
   * Conflicto de precondiciones de un comando: el estado capturado al
   * crearlo ya no coincide con el documento (comando obsoleto o edición
   * concurrente). El historial no se altera.
   */
  | 'ERR_SCENE_COMMAND_CONFLICT'
  /** `SceneEnvelope` malformado: no es JSON, no es un registro, marcador o documento ausente/incorrecto. */
  | 'ERR_SCENE_ENVELOPE_INVALID'
  /** Versión de `SceneEnvelope` desconocida. Rechazo sin migración silenciosa. */
  | 'ERR_SCENE_ENVELOPE_VERSION'
  // --- Añadido en FASE-4B-D (conversión a componente paramétrico) ---
  /**
   * La conversión de sólido libre a componente paramétrico **no puede
   * demostrarse equivalente**: el croquis no es un rectángulo axial en el
   * plano `ground`, la construcción del componente no produce una única
   * caja comprobable, o las geometrías canónicas no coinciden exactamente
   * (mm enteros). La conversión se rechaza sin aproximarse nunca
   * (documentado en `SCENE_DOCUMENT.md` §3.7).
   */
  | 'ERR_SCENE_CONVERSION_INCOMPATIBLE';

/**
 * Error con código estable del núcleo del modelador, siguiendo el patrón de
 * `GeometryError` (clase con `code` del union propio y `details`
 * estructurados). La validación de entrada (`validateSceneDocument`) NO
 * lanza: devuelve un resultado discriminado; esta clase queda para las capas
 * que operan sobre un documento ya validado (comandos, conversión).
 */
export class SceneError extends Error {
  readonly code: SceneErrorCode;
  readonly details: Readonly<Record<string, number | string>>;

  constructor(
    code: SceneErrorCode,
    message: string,
    details: Record<string, number | string> = {},
  ) {
    super(message);
    this.name = 'SceneError';
    this.code = code;
    this.details = details;
  }
}

/** Un hallazgo de validación: código estable, campo y mensaje legible. */
export interface SceneIssue {
  code: SceneErrorCode;
  /** Ruta del campo con el problema, p. ej. `objects[0].transform.positionMm`. */
  field: string;
  message: string;
}
