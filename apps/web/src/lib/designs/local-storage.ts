import { DesignStorageError, isQuotaExceeded } from './errors.js';
import type { DesignStorage } from './repository.js';
import {
  DESIGN_STORAGE_VERSION,
  type DesignRecord,
} from './types.js';
import { validateDesignRecord, validateSessionData } from './validate.js';

/** Clave de la colección de diseños. */
export const DESIGNS_STORAGE_KEY = 'furniconfig.designs';
/** Clave de la sesión de trabajo (borrador). */
export const SESSION_STORAGE_KEY = 'furniconfig.session';

/** Subconjunto de `Storage` que necesita el adaptador (inyectable en pruebas). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Sobre de la colección: versión del formato + registros crudos. */
interface DesignsEnvelope {
  storageVersion: number;
  designs: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Obtiene `localStorage` sin lanzar en el momento de la fábrica:
 * un acceso bloqueado (modo privado estricto) degrada a
 * `storage-unavailable` en cada operación, sin romper la aplicación.
 */
function resolveDefaultStorage(): StorageLike | null {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
  } catch {
    return null;
  }
}

function readRaw(storage: StorageLike | null, key: string): string | null {
  if (!storage) {
    throw new DesignStorageError(
      'storage-unavailable',
      'El almacenamiento local no está disponible.',
    );
  }
  try {
    return storage.getItem(key);
  } catch {
    throw new DesignStorageError(
      'storage-unavailable',
      'No se pudo leer el almacenamiento local.',
    );
  }
}

function writeRaw(storage: StorageLike | null, key: string, value: string): void {
  if (!storage) {
    throw new DesignStorageError(
      'storage-unavailable',
      'El almacenamiento local no está disponible.',
    );
  }
  try {
    storage.setItem(key, value);
  } catch (error) {
    if (isQuotaExceeded(error)) {
      throw new DesignStorageError(
        'storage-full',
        'El almacenamiento local está lleno.',
      );
    }
    throw new DesignStorageError(
      'storage-unavailable',
      'No se pudo escribir en el almacenamiento local.',
    );
  }
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DesignStorageError('invalid-data', `${what} no es JSON válido.`);
  }
}

/**
 * Lee el sobre de la colección. Un sobre con versión desconocida se
 * rechaza como incompatible ANTES de cualquier escritura, de modo que
 * los datos antiguos nunca se pisan sin migración explícita.
 */
function readEnvelope(storage: StorageLike | null): DesignsEnvelope {
  const raw = readRaw(storage, DESIGNS_STORAGE_KEY);
  if (raw === null) {
    return { storageVersion: DESIGN_STORAGE_VERSION, designs: [] };
  }
  const parsed = parseJson(raw, 'El almacén de diseños');
  if (!isRecord(parsed)) {
    throw new DesignStorageError('invalid-data', 'El almacén de diseños tiene un formato inválido.');
  }
  if (parsed.storageVersion !== DESIGN_STORAGE_VERSION) {
    throw new DesignStorageError(
      'incompatible-version',
      `Versión de almacén no compatible: ${String(parsed.storageVersion)} (se espera ${DESIGN_STORAGE_VERSION}). Sin migración automática.`,
    );
  }
  if (!Array.isArray(parsed.designs)) {
    throw new DesignStorageError('invalid-data', 'El almacén de diseños no contiene registros.');
  }
  return { storageVersion: DESIGN_STORAGE_VERSION, designs: parsed.designs };
}

/**
 * Adaptador local de `DesignStorage` sobre `localStorage`.
 *
 * Propiedades de integridad:
 * - `setItem` es atómico: si la escritura falla (cuota), el valor
 *   anterior queda intacto.
 * - Los registros corruptos se conservan en el sobre (cuarentena) y no
 *   se muestran; una escritura posterior no los elimina.
 * - Un sobre con versión desconocida bloquea escrituras (sin pisar).
 * - Toda configuración se revalida con el motor antes de persistirse.
 */
export function createLocalStorageDesignStorage(
  storage?: StorageLike,
): DesignStorage {
  const target = storage ?? resolveDefaultStorage();

  const readRawRecords = (): unknown[] => readEnvelope(target).designs;

  const readValidRecords = (): DesignRecord[] => {
    const valid: DesignRecord[] = [];
    for (const raw of readRawRecords()) {
      try {
        valid.push(validateDesignRecord(raw));
      } catch {
        // Registro ilegible o de versión desconocida: en cuarentena,
        // sin mostrar y sin eliminar.
      }
    }
    return valid;
  };

  const writeRecords = (records: unknown[]): void => {
    const envelope: DesignsEnvelope = {
      storageVersion: DESIGN_STORAGE_VERSION,
      designs: records,
    };
    writeRaw(target, DESIGNS_STORAGE_KEY, JSON.stringify(envelope));
  };

  return {
    async list() {
      return readValidRecords()
        .map(({ id, name, createdAt, updatedAt }) => ({
          id,
          name,
          createdAt,
          updatedAt,
        }))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    },

    async get(id) {
      return readValidRecords().find((record) => record.id === id) ?? null;
    },

    async put(record) {
      // Revalidación completa antes de escribir: nunca se persiste una
      // configuración que el motor rechace.
      const validated = validateDesignRecord(record);
      const rawRecords = readRawRecords();
      const next = rawRecords.filter((raw) => {
        try {
          return validateDesignRecord(raw).id !== validated.id;
        } catch {
          return true; // crudo en cuarentena: se conserva sin tocar
        }
      });
      next.push(validated);
      writeRecords(next);
    },

    async remove(id) {
      const rawRecords = readRawRecords();
      const remaining = rawRecords.filter((raw) => {
        try {
          return validateDesignRecord(raw).id !== id;
        } catch {
          return true;
        }
      });
      if (remaining.length === rawRecords.length) {
        return; // id inexistente: no hay nada que escribir
      }
      writeRecords(remaining);
    },

    async load() {
      const raw = readRaw(target, SESSION_STORAGE_KEY);
      if (raw === null) {
        return null;
      }
      return validateSessionData(parseJson(raw, 'La sesión de trabajo'));
    },

    async save(data) {
      const validated = validateSessionData(data);
      writeRaw(target, SESSION_STORAGE_KEY, JSON.stringify(validated));
    },

    async clear() {
      if (!target) {
        throw new DesignStorageError(
          'storage-unavailable',
          'El almacenamiento local no está disponible.',
        );
      }
      try {
        target.removeItem(SESSION_STORAGE_KEY);
      } catch {
        throw new DesignStorageError(
          'storage-unavailable',
          'No se pudo modificar el almacenamiento local.',
        );
      }
    },
  };
}
