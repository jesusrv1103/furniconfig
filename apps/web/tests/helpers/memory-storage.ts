import type { StorageLike } from '../../src/lib/designs/local-storage.js';

/**
 * Almacenamiento en memoria compatible con `StorageLike` para pruebas.
 * Permite inyectar fallos de cuota y de acceso.
 */
export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();

  /** Si se establece, toda escritura lanza este error. */
  failWritesWith: Error | null = null;

  /** Si es `true`, las lecturas lanzan (almacenamiento bloqueado). */
  failReads = false;

  writes = 0;

  getItem(key: string): string | null {
    if (this.failReads) {
      throw new Error('SecurityError: acceso bloqueado');
    }
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWritesWith) {
      throw this.failWritesWith;
    }
    this.writes += 1;
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    if (this.failWritesWith) {
      throw this.failWritesWith;
    }
    this.map.delete(key);
  }

  /** Valor crudo actual de una clave. */
  raw(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  /** Semilla directa (para probar datos corruptos o de otra versión). */
  seed(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** Error de cuota realista (nombre + códigos históricos). */
export function quotaError(): Error {
  return Object.assign(new Error('QuotaExceededError: full'), {
    name: 'QuotaExceededError',
    code: 22,
  });
}
