/**
 * Errores de la capa de persistencia de diseños.
 *
 * Son propios de la aplicación web: no tienen relación con
 * `GeometryError` del motor geométrico.
 */
export type DesignStorageErrorCode =
  | 'storage-unavailable'
  | 'storage-full'
  | 'invalid-data'
  | 'incompatible-version'
  | 'not-found'
  | 'invalid-name';

export class DesignStorageError extends Error {
  readonly code: DesignStorageErrorCode;

  constructor(code: DesignStorageErrorCode, message: string) {
    super(message);
    this.name = 'DesignStorageError';
    this.code = code;
  }
}

/** Detecta el error de cuota del navegador (nombres y códigos históricos). */
export function isQuotaExceeded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name === 'QuotaExceededError') {
    return true;
  }
  return candidate.code === 22 || candidate.code === 1014;
}

/**
 * Mensaje comprensible para la interfaz a partir de cualquier error.
 * Nunca se muestra un stack ni contenido crudo del dato recibido.
 */
export function describeDesignError(error: unknown): string {
  if (error instanceof DesignStorageError) {
    switch (error.code) {
      case 'storage-unavailable':
        return 'El almacenamiento local no está disponible (modo privado o bloqueado). Los cambios no se conservarán al recargar.';
      case 'storage-full':
        return 'El almacenamiento local está lleno: libera espacio en el navegador para seguir guardando diseños.';
      case 'incompatible-version':
        return error.message;
      case 'invalid-name':
        return error.message;
      case 'not-found':
        return 'El diseño ya no existe.';
      case 'invalid-data':
        return error.message;
    }
  }
  if (error instanceof Error && error.message.trim() !== '') {
    return `No se pudo completar la operación: ${error.message}`;
  }
  return 'No se pudo completar la operación.';
}
