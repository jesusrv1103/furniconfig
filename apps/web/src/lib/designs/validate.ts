import { validateWardrobeConfig } from '@furniconfig/geometry-core';
import { DesignStorageError } from './errors.js';
import {
  DESIGN_SESSION_VERSION,
  DESIGN_STORAGE_VERSION,
  type DesignRecord,
  type DesignSessionData,
} from './types.js';

/** Longitud máxima del nombre de un diseño (entrada de usuario e importada). */
export const MAX_DESIGN_NAME_LENGTH = 120;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

/**
 * Valida y normaliza el nombre de un diseño.
 * Lanza `DesignStorageError('invalid-name')` si no es utilizable.
 */
export function validateDesignName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new DesignStorageError('invalid-name', 'El nombre del diseño debe ser texto.');
  }
  const name = input.trim();
  if (name === '') {
    throw new DesignStorageError('invalid-name', 'El nombre del diseño no puede estar vacío.');
  }
  if (name.length > MAX_DESIGN_NAME_LENGTH) {
    throw new DesignStorageError(
      'invalid-name',
      `El nombre del diseño no puede superar los ${MAX_DESIGN_NAME_LENGTH} caracteres.`,
    );
  }
  return name;
}

/**
 * Valida un registro de diseño recibido de cualquier origen
 * (almacenamiento local, archivo importado, datos manipulados).
 *
 * Nunca confía en el JSON: forma, versión, fechas y —de forma
 * obligatoria— la configuración completa mediante el validador del
 * motor (`validateWardrobeConfig`). Los registros no utilizables se
 * rechazan con `DesignStorageError`; jamás se ejecuta su contenido.
 */
export function validateDesignRecord(input: unknown): DesignRecord {
  if (!isRecord(input)) {
    throw new DesignStorageError('invalid-data', 'El diseño debe ser un objeto JSON.');
  }
  if (input.storageVersion !== DESIGN_STORAGE_VERSION) {
    throw new DesignStorageError(
      'incompatible-version',
      `Versión de diseño no compatible: ${String(input.storageVersion)} (se espera ${DESIGN_STORAGE_VERSION}). Sin migración automática.`,
    );
  }
  const id = input.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new DesignStorageError('invalid-data', 'El diseño no tiene un identificador válido.');
  }
  const name = validateDesignName(input.name);
  if (!isIsoDate(input.createdAt) || !isIsoDate(input.updatedAt)) {
    throw new DesignStorageError('invalid-data', 'El diseño tiene fechas inválidas.');
  }
  const validation = validateWardrobeConfig(input.config);
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new DesignStorageError(
      'invalid-data',
      `La configuración del diseño es inválida${first ? `: ${first.message}` : '.'}`,
    );
  }
  return {
    id,
    name,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    storageVersion: DESIGN_STORAGE_VERSION,
    config: validation.config,
  };
}

/** Valida la sesión de trabajo recibida del almacenamiento. */
export function validateSessionData(input: unknown): DesignSessionData {
  if (!isRecord(input)) {
    throw new DesignStorageError('invalid-data', 'La sesión debe ser un objeto JSON.');
  }
  if (input.storageVersion !== DESIGN_SESSION_VERSION) {
    throw new DesignStorageError(
      'incompatible-version',
      `Versión de sesión no compatible: ${String(input.storageVersion)} (se espera ${DESIGN_SESSION_VERSION}).`,
    );
  }
  if (input.activeId !== null && typeof input.activeId !== 'string') {
    throw new DesignStorageError('invalid-data', 'La sesión tiene un diseño activo inválido.');
  }
  if (typeof input.dirty !== 'boolean') {
    throw new DesignStorageError('invalid-data', 'La sesión tiene un estado de cambios inválido.');
  }
  const validation = validateWardrobeConfig(input.config);
  if (!validation.ok) {
    throw new DesignStorageError('invalid-data', 'La sesión contiene una configuración inválida.');
  }
  return {
    storageVersion: DESIGN_SESSION_VERSION,
    config: validation.config,
    activeId: input.activeId,
    dirty: input.dirty,
  };
}
