import type { WardrobeConfig } from '@furniconfig/geometry-core';

/**
 * Versión del FORMATO de almacenamiento de diseños.
 *
 * Independiente de `WARDROBE_CONFIG_SCHEMA_VERSION` (contrato del motor
 * geométrico): cada contrato evoluciona por separado y una versión nueva
 * de uno no implica la otra. Las versiones desconocidas se tratan como
 * incompatibles, sin migración silenciosa.
 */
export const DESIGN_STORAGE_VERSION = 1;

/** Versión del formato de la sesión de trabajo (borrador activo). */
export const DESIGN_SESSION_VERSION = 1;

/**
 * Diseño persistido: identidad, metadatos temporales y la configuración
 * COMPLETA del motor. No se almacenan mallas, geometrías derivadas ni
 * estado de presentación: todo lo demás se recalcula al abrir.
 */
export interface DesignRecord {
  /** Identificador estable y único dentro del almacén. */
  id: string;
  /** Nombre visible (sin ejecutar: siempre texto plano). */
  name: string;
  /** Fecha de creación en ISO 8601. */
  createdAt: string;
  /** Fecha de la última escritura en ISO 8601. */
  updatedAt: string;
  /** Versión del formato de almacenamiento del propio registro. */
  storageVersion: number;
  /** Configuración completa validada. */
  config: WardrobeConfig;
}

/** Resumen ligero para listados (sin la configuración). */
export interface DesignSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Sesión de trabajo: recupera el borrador tras recargar la página.
 * Se guarda en una clave propia, separada de la colección de diseños.
 */
export interface DesignSessionData {
  storageVersion: number;
  config: WardrobeConfig;
  /** Diseño activo o `null` si es un proyecto sin guardar. */
  activeId: string | null;
  /** `true` cuando la configuración difiere de la última escritura. */
  dirty: boolean;
}
