import { DesignStorageError } from './errors.js';
import { DESIGN_STORAGE_VERSION, type DesignRecord } from './types.js';
import { validateDesignRecord } from './validate.js';

/** Marcador de formato de los archivos exportados de diseños. */
export const DESIGN_EXPORT_FORMAT = 'furniconfig-design';

/** Envoltorio del archivo exportado (JSON legible y versionado). */
export interface DesignExportEnvelope {
  format: typeof DESIGN_EXPORT_FORMAT;
  storageVersion: number;
  design: DesignRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Serializa un diseño al formato de archivo versionado. */
export function serializeDesign(record: DesignRecord): string {
  const envelope: DesignExportEnvelope = {
    format: DESIGN_EXPORT_FORMAT,
    storageVersion: DESIGN_STORAGE_VERSION,
    design: record,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parsea y valida un archivo de diseño importado.
 *
 * Todo el contenido se considera hostil: JSON bien formado, marcador de
 * formato, versión conocida y `validateDesignRecord` completo. Las
 * versiones desconocidas se rechazan como incompatibles (sin migración
 * silenciosa) y cualquier problema lanza `DesignStorageError`.
 */
export function parseDesignExport(text: string): DesignRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new DesignStorageError('invalid-data', 'El archivo no es JSON válido.');
  }
  if (!isRecord(parsed)) {
    throw new DesignStorageError('invalid-data', 'El archivo no contiene un diseño.');
  }
  if (parsed.format !== DESIGN_EXPORT_FORMAT) {
    throw new DesignStorageError('invalid-data', 'El archivo no es un diseño de FurniConfig.');
  }
  if (parsed.storageVersion !== DESIGN_STORAGE_VERSION) {
    throw new DesignStorageError(
      'incompatible-version',
      `Versión de archivo no compatible: ${String(parsed.storageVersion)} (se espera ${DESIGN_STORAGE_VERSION}). Sin migración automática.`,
    );
  }
  return validateDesignRecord(parsed.design);
}
