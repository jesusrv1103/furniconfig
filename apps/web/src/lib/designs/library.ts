import type { WardrobeConfig } from '@furniconfig/geometry-core';
import { DesignStorageError } from './errors.js';
import { nextDesignId } from './ids.js';
import type { DesignRepository } from './repository.js';
import { parseDesignExport, serializeDesign } from './transfer.js';
import {
  DESIGN_STORAGE_VERSION,
  type DesignRecord,
  type DesignSummary,
} from './types.js';
import { validateDesignName, validateDesignRecord } from './validate.js';

export interface DesignLibraryDeps {
  repository: DesignRepository;
  /** Reloj inyectable (pruebas deterministas). */
  now?: () => Date;
  /** Generador de ids inyectable (pruebas deterministas). */
  makeId?: (existingIds: readonly string[]) => string;
}

/**
 * Casos de uso de la biblioteca de diseños sobre un `DesignRepository`.
 *
 * Toda operación valida antes de calcular/escribir, no muta las
 * configuraciones recibidas (usa copias) y comunica fallos con
 * `DesignStorageError`.
 */
export class DesignLibrary {
  private readonly repository: DesignRepository;
  private readonly now: () => Date;
  private readonly makeId: (existingIds: readonly string[]) => string;

  constructor(deps: DesignLibraryDeps) {
    this.repository = deps.repository;
    this.now = deps.now ?? (() => new Date());
    this.makeId = deps.makeId ?? nextDesignId;
  }

  private timestamp(): string {
    return this.now().toISOString();
  }

  private async existingIds(): Promise<string[]> {
    return (await this.repository.list()).map((summary) => summary.id);
  }

  /** Listado completo, más reciente primero. */
  async list(): Promise<DesignSummary[]> {
    return this.repository.list();
  }

  async get(id: string): Promise<DesignRecord | null> {
    return this.repository.get(id);
  }

  /** Crea un diseño nuevo con la configuración actual. */
  async create(name: string, config: WardrobeConfig): Promise<DesignRecord> {
    const cleanName = validateDesignName(name);
    const timestamp = this.timestamp();
    const record = validateDesignRecord({
      id: this.makeId(await this.existingIds()),
      name: cleanName,
      createdAt: timestamp,
      updatedAt: timestamp,
      storageVersion: DESIGN_STORAGE_VERSION,
      config,
    });
    await this.repository.put(record);
    return record;
  }

  /** Guarda la configuración en el diseño activo (actualiza `updatedAt`). */
  async saveActive(id: string, config: WardrobeConfig): Promise<DesignRecord> {
    const current = await this.repository.get(id);
    if (!current) {
      throw new DesignStorageError('not-found', 'El diseño ya no existe.');
    }
    const validation = validateDesignRecord({
      ...current,
      config,
      updatedAt: this.timestamp(),
    });
    await this.repository.put(validation);
    return validation;
  }

  /** Renombra el diseño (conserva su configuración y fechas salvo `updatedAt`). */
  async rename(id: string, name: string): Promise<DesignRecord> {
    const cleanName = validateDesignName(name);
    const current = await this.repository.get(id);
    if (!current) {
      throw new DesignStorageError('not-found', 'El diseño ya no existe.');
    }
    const updated: DesignRecord = {
      ...current,
      name: cleanName,
      updatedAt: this.timestamp(),
    };
    await this.repository.put(updated);
    return updated;
  }

  /**
   * Duplica un diseño con identidad propia: la copia es independiente
   * (copia profunda) y no comparte referencias con el original.
   */
  async duplicate(id: string): Promise<DesignRecord> {
    const current = await this.repository.get(id);
    if (!current) {
      throw new DesignStorageError('not-found', 'El diseño ya no existe.');
    }
    const timestamp = this.timestamp();
    const copy = validateDesignRecord({
      id: this.makeId(await this.existingIds()),
      name: `${current.name} (copia)`,
      createdAt: timestamp,
      updatedAt: timestamp,
      storageVersion: DESIGN_STORAGE_VERSION,
      config: structuredClone(current.config),
    });
    await this.repository.put(copy);
    return copy;
  }

  /** Elimina un diseño. Idempotente: un id inexistente no falla. */
  async remove(id: string): Promise<void> {
    await this.repository.remove(id);
  }

  /** Exporta el diseño a un archivo JSON versionado. */
  async exportJson(id: string): Promise<string> {
    const record = await this.repository.get(id);
    if (!record) {
      throw new DesignStorageError('not-found', 'El diseño ya no existe.');
    }
    return serializeDesign(record);
  }

  /**
   * Importa un diseño desde JSON validado. Recibe SIEMPRE un id nuevo:
   * así un archivo jamás sobrescribe un diseño existente.
   */
  async importJson(text: string): Promise<DesignRecord> {
    const parsed = parseDesignExport(text);
    const id = this.makeId(await this.existingIds());
    const record = validateDesignRecord({ ...parsed, id });
    await this.repository.put(record);
    return record;
  }
}
