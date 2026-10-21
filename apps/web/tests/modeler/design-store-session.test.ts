/**
 * WAVE-02 BLOQUE 3 — borrador de sesión y metadatos
 * (`lib/modeler/design-store.ts`: `saveSceneDraft` / `readSceneDraft` /
 * `clearSceneDraft` / `readSessionMeta`).
 *
 * Verifica: escritura como `SceneEnvelope` VALIDADO, aislamiento del
 * configurador y de los diseños guardados (nunca se sobrescribe un
 * diseño), recuperación segura (corrupción expuesta, jamás borrada),
 * metadatos tolerantes a JSON hostil y descarte explícito.
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptySceneDocument,
  serializeScene,
  type SceneDocument,
} from '@furniconfig/modeler-core';

import {
  MODELER_DESIGNS_STORAGE_KEY,
  MODELER_DRAFT_STORAGE_KEY,
  MODELER_SESSION_STORAGE_KEY,
  clearSceneDraft,
  readSceneDraft,
  readSessionMeta,
  saveSceneDesign,
  saveSceneDraft,
  type SceneDesignStorage,
} from '../../src/lib/modeler/design-store.js';

function fakeStorage(initial: Record<string, string> = {}): SceneDesignStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length(): number {
      return map.size;
    },
    key(index: number): string | null {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string): string | null {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    },
  };
}

function sceneNamed(name: string): SceneDocument {
  return { ...createEmptySceneDocument(), name };
}

describe('guardado del borrador de sesión', () => {
  it('escribe sobre validado (SceneEnvelope) y metadatos coherentes', () => {
    const storage = fakeStorage();
    const result = saveSceneDraft(storage, sceneNamed('Boceto'), {
      activeDesignId: null,
      mode: 'simple',
    });
    expect(result.ok).toBe(true);
    const text = storage.getItem(MODELER_DRAFT_STORAGE_KEY);
    expect(text).not.toBeNull();
    const read = readSceneDraft(storage);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error('esperaba borrador legible');
    expect(read.document.name).toBe('Boceto');
    expect(read.meta.mode).toBe('simple');
    expect(read.meta.activeDesignId).toBeNull();
    expect(read.meta.updatedAt).toBeGreaterThan(0);
  });

  it('un documento inválido NO llega a storage (validación en origen)', () => {
    const storage = fakeStorage();
    const broken = {
      ...createEmptySceneDocument(),
      objects: 'no-es-una-lista',
    } as unknown as SceneDocument;
    const result = saveSceneDraft(storage, broken, {
      activeDesignId: null,
      mode: 'advanced',
    });
    expect(result.ok).toBe(false);
    expect(storage.getItem(MODELER_DRAFT_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(MODELER_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('el borrador NO toca los diseños guardados ni las claves del configurador', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', sceneNamed('Cocina norte'));
    const original = storage.getItem(
      `${MODELER_DESIGNS_STORAGE_KEY}.design-1`,
    );
    saveSceneDraft(storage, sceneNamed('Borrador'), {
      activeDesignId: 'design-1',
      mode: 'advanced',
    });
    expect(storage.getItem(`${MODELER_DESIGNS_STORAGE_KEY}.design-1`)).toBe(
      original,
    );
    expect(storage.getItem('furniconfig.designs')).toBeNull();
    expect(storage.getItem('furniconfig.session')).toBeNull();
    expect(storage.getItem('furniconfig.modeler.designs')).toBeNull();
  });
});

describe('lectura segura del borrador', () => {
  it('sin borrador → ERR_DRAFT_MISSING con mensaje claro', () => {
    const read = readSceneDraft(fakeStorage());
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error('esperaba ausencia');
    expect(read.code).toBe('ERR_DRAFT_MISSING');
  });

  it('borrador corrupto → error expuesto y registro CONSERVADO', () => {
    const storage = fakeStorage({ [MODELER_DRAFT_STORAGE_KEY]: '{basura' });
    const read = readSceneDraft(storage);
    expect(read.ok).toBe(false);
    if (read.ok) throw new Error('esperaba corrupción');
    expect(read.message).toContain('dañado');
    // Nunca se borra automáticamente.
    expect(storage.getItem(MODELER_DRAFT_STORAGE_KEY)).toBe('{basura');
  });

  it('borrador de versión incompatible → error tipado, jamás restaurado', () => {
    const envelope = JSON.parse(serializeScene(sceneNamed('Vieja'))) as {
      readonly version: number;
    };
    const foreign = JSON.stringify({ ...envelope, version: 999 });
    const storage = fakeStorage({ [MODELER_DRAFT_STORAGE_KEY]: foreign });
    const read = readSceneDraft(storage);
    expect(read.ok).toBe(false);
    expect(storage.getItem(MODELER_DRAFT_STORAGE_KEY)).toBe(foreign);
  });
});

describe('metadatos de sesión (JSON hostil)', () => {
  it('JSON ausente o corrupto → valores por defecto sin lanzar', () => {
    expect(readSessionMeta(fakeStorage())).toEqual({
      activeDesignId: null,
      mode: 'simple',
      updatedAt: 0,
    });
    const corrupt = fakeStorage({
      [MODELER_SESSION_STORAGE_KEY]: 'no-json',
    });
    expect(readSessionMeta(corrupt).mode).toBe('simple');
    const hostile = fakeStorage({
      [MODELER_SESSION_STORAGE_KEY]: JSON.stringify({
        activeDesignId: 42,
        mode: 'gigante',
        updatedAt: 'ayer',
      }),
    });
    expect(readSessionMeta(hostile)).toEqual({
      activeDesignId: null,
      mode: 'simple',
      updatedAt: 0,
    });
  });

  it('modo inesperado normaliza a «simple» (experiencia por defecto)', () => {
    const storage = fakeStorage({
      [MODELER_SESSION_STORAGE_KEY]: JSON.stringify({ mode: 'otro' }),
    });
    expect(readSessionMeta(storage).mode).toBe('simple');
  });
});

describe('descarte explícito del borrador', () => {
  it('clearSceneDraft elimina borrador y metadatos (y nada más)', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', sceneNamed('Cocina norte'));
    saveSceneDraft(storage, sceneNamed('Borrador'), {
      activeDesignId: 'design-1',
      mode: 'advanced',
    });
    clearSceneDraft(storage);
    expect(storage.getItem(MODELER_DRAFT_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(MODELER_SESSION_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(`${MODELER_DESIGNS_STORAGE_KEY}.design-1`)).not.toBeNull();
    expect(readSceneDraft(storage).ok).toBe(false);
  });
});
