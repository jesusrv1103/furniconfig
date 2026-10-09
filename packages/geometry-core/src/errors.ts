/**
 * Errores tipados del motor geométrico.
 *
 * Los códigos (`GeometryErrorCode`) son parte del contrato público del paquete:
 * son estables y deben documentarse cuando se añadan nuevos.
 */

export type GeometryErrorCode =
  | 'ERR_INVALID_CONFIG'
  | 'ERR_INVALID_SCHEMA_VERSION'
  | 'ERR_INVALID_DIMENSION'
  | 'ERR_INVALID_MODULE_COUNT'
  | 'ERR_INVALID_MODULE_KIND'
  | 'ERR_INVALID_SHELF_COUNT'
  | 'ERR_INVALID_DRAWER_COUNT'
  | 'ERR_DRAWER_DIMENSIONS'
  | 'ERR_INVALID_DOOR_LEAVES'
  | 'ERR_INVALID_HINGE_SIDE'
  | 'ERR_INVALID_DOOR_CLEARANCE'
  | 'ERR_DOOR_OPEN_ANGLE'
  | 'ERR_DOOR_WIDTH_INSUFFICIENT'
  | 'ERR_BACK_PANEL_DEPTH'
  | 'ERR_INVALID_MATERIAL'
  | 'ERR_INVALID_THICKNESS'
  | 'ERR_HANGING_ROD_DIAMETER'
  | 'ERR_HANGING_ROD_HEIGHT'
  | 'ERR_WIDTH_INSUFFICIENT'
  | 'ERR_MODULE_WIDTH_TOO_SMALL';

export class GeometryError extends Error {
  readonly code: GeometryErrorCode;
  readonly details: Readonly<Record<string, number | string>>;

  constructor(
    code: GeometryErrorCode,
    message: string,
    details: Record<string, number | string> = {},
  ) {
    super(message);
    this.name = 'GeometryError';
    this.code = code;
    this.details = details;
  }
}
