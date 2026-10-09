import type {
  DesignRecord,
  DesignSessionData,
  DesignSummary,
} from './types.js';

/**
 * Contrato de almacenamiento de diseños.
 *
 * La aplicación depende SOLO de esta interfaz: el adaptador local
 * (localStorage) es una implementación intercambiable —en el futuro,
 * un repositorio remoto— sin tocar la lógica de negocio.
 *
 * Todas las operaciones son asíncronas para que un adaptador de red
 * encaje sin cambiar la interfaz. Los errores se comunican con
 * `DesignStorageError`.
 */
export interface DesignRepository {
  /** Resúmenes de todos los diseños válidos, más recientes primero. */
  list(): Promise<DesignSummary[]>;
  /** Registro completo o `null` si no existe / no es válido. */
  get(id: string): Promise<DesignRecord | null>;
  /** Inserta o reemplaza el registro con su `id`. */
  put(record: DesignRecord): Promise<void>;
  /** Elimina por id; eliminar un id inexistente no es un error. */
  remove(id: string): Promise<void>;
}

/**
 * Contrato de la sesión de trabajo (borrador + diseño activo),
 * separado de la colección de diseños.
 */
export interface SessionStore {
  load(): Promise<DesignSessionData | null>;
  save(data: DesignSessionData): Promise<void>;
  clear(): Promise<void>;
}

/** Adaptador local: colección de diseños + sesión, en un mismo soporte. */
export type DesignStorage = DesignRepository & SessionStore;
