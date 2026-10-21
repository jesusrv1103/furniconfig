/**
 * WAVE-01 BLOQUE 3 — almacén local de diseños del modelador
 * (`lib/modeler/design-store.ts`).
 *
 * Verifica: namespace AISLADO del configurador, ida y vuelta
 * `SceneEnvelope` con validación en origen, corruptos expuestos sin
 * pérdida silenciosa, ids deterministas, renombrar/duplicar/eliminar
 * sin tocar a los demás, y sobrescrita solo por la ruta explícita.
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptySceneDocument,
  type SceneDocument,
} from '@furniconfig/modeler-core';

import {
  MODELER_DESIGNS_STORAGE_KEY,
  createSceneDesign,
  deleteSceneDesign,
  duplicateSceneDesign,
  getDefaultSceneDesignStorage,
  listSceneDesigns,
  nextSceneDesignId,
  readSceneDesign,
  renameSceneDesign,
  saveSceneDesign,
  type SceneDesignStorage,
} from '../../src/lib/modeler/design-store.js';

/** Doble de storage en memoria (interfaz estructural de `Storage`). */
function fakeStorage(
  initial: Record<string, string> = {},
): SceneDesignStorage {
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

/** Documento de prueba con nombre propio. */
function designDocument(name: string): SceneDocument {
  const base = createEmptySceneDocument();
  return { ...base, name };
}

describe('namespace aislado del configurador', () => {
  it('usa el prefijo del modelador y jamás claves del configurador', () => {
    expect(MODELER_DESIGNS_STORAGE_KEY).toBe('furniconfig.modeler.designs');
    expect(MODELER_DESIGNS_STORAGE_KEY).not.toBe('furniconfig.designs');
    const storage = fakeStorage({
      'furniconfig.designs': '{"del":"configurador"}',
      'furniconfig.session': '{"del":"configurador"}',
    });
    const saved = saveSceneDesign(storage, 'design-1', designDocument('Mía'));
    expect(saved.ok).toBe(true);
    // La clave del modelador existe; las del configurador NO cambian.
    expect(storage.getItem('furniconfig.modeler.designs.design-1')).not.toBeNull();
    expect(storage.getItem('furniconfig.designs')).toBe('{"del":"configurador"}');
    expect(storage.getItem('furniconfig.session')).toBe('{"del":"configurador"}');
    // El listado ignora las claves ajenas.
    expect(listSceneDesigns(storage).map((entry) => entry.id)).toEqual([
      'design-1',
    ]);
  });
});

describe('guardar y abrir (ida y vuelta SceneEnvelope)', () => {
  it('guarda, lista y reabre el documento ÍNTEGRO', () => {
    const storage = fakeStorage();
    const document = designDocument('Dormitorio');
    const saved = saveSceneDesign(storage, 'design-1', document);
    expect(saved).toEqual({ ok: true, id: 'design-1' });

    const summaries = listSceneDesigns(storage);
    expect(summaries).toEqual([
      { id: 'design-1', name: 'Dormitorio', corrupted: false },
    ]);

    const opened = readSceneDesign(storage, 'design-1');
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.document.name).toBe('Dormitorio');
      expect(opened.document.documentVersion).toBe(1);
      expect(opened.document.objects).toEqual(document.objects);
      expect(opened.document.gridStepMm).toBe(document.gridStepMm);
    }
  });

  it('documento inválido → error en ORIGEN y storage intacto', () => {
    const storage = fakeStorage();
    const broken = {
      ...designDocument('Roto'),
      gridStepMm: 0.5, // no entero: el validador lo rechaza
    } as SceneDocument;
    const saved = saveSceneDesign(storage, 'design-1', broken);
    expect(saved.ok).toBe(false);
    if (!saved.ok) expect(saved.code).toBe('ERR_DESIGN_SAVE_INVALID');
    expect(storage.length).toBe(0);
  });

  it('sobrescrita solo por la ruta explícita (mismo id = último gana)', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', designDocument('V1'));
    saveSceneDesign(storage, 'design-1', designDocument('V2'));
    const opened = readSceneDesign(storage, 'design-1');
    expect(opened.ok && opened.document.name).toBe('V2');
    expect(listSceneDesigns(storage)).toHaveLength(1);
  });

  it('id vacío o con separadores → ERR_DESIGN_INVALID_ID', () => {
    const storage = fakeStorage();
    for (const id of ['', 'a/b', 'a.b', 'a b']) {
      const saved = saveSceneDesign(storage, id, designDocument('X'));
      expect(saved.ok).toBe(false);
      if (!saved.ok) expect(saved.code).toBe('ERR_DESIGN_INVALID_ID');
    }
  });
});

describe('apertura con problemas (nunca pérdida silenciosa)', () => {
  it('diseño inexistente → ERR_DESIGN_NOT_FOUND', () => {
    const opened = readSceneDesign(fakeStorage(), 'design-9');
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.code).toBe('ERR_DESIGN_NOT_FOUND');
  });

  it('sobre corrupto (JSON basura) → error tipado; nada se borra', () => {
    const storage = fakeStorage({
      'furniconfig.modeler.designs.design-1': 'esto no es json {{{',
    });
    const opened = readSceneDesign(storage, 'design-1');
    expect(opened.ok).toBe(false);
    if (!opened.ok) {
      expect(opened.code).toBe('ERR_SCENE_ENVELOPE_INVALID');
      expect(opened.message).toContain('dañado');
    }
    // El registro sigue presente (visible en el listado, recuperable).
    expect(storage.length).toBe(1);
    expect(listSceneDesigns(storage)).toEqual([
      {
        id: 'design-1',
        name: null,
        corrupted: true,
        message: expect.any(String),
      },
    ]);
  });

  it('versión de sobre desconocida → rechazo explícito (sin migración)', () => {
    const storage = fakeStorage({
      'furniconfig.modeler.designs.design-1': JSON.stringify({
        format: 'furniconfig-scene',
        version: 99,
        document: {},
      }),
    });
    const opened = readSceneDesign(storage, 'design-1');
    expect(opened.ok).toBe(false);
    if (!opened.ok) expect(opened.code).toBe('ERR_SCENE_ENVELOPE_VERSION');
  });

  it('un corrupto no contamina a los vecinos del listado', () => {
    const storage = fakeStorage({
      'furniconfig.modeler.designs.design-1': '%%%corrupto%%%',
    });
    saveSceneDesign(storage, 'design-2', designDocument('Sana'));
    const summaries = listSceneDesigns(storage);
    expect(summaries).toEqual([
      {
        id: 'design-1',
        name: null,
        corrupted: true,
        message: expect.any(String),
      },
      { id: 'design-2', name: 'Sana', corrupted: false },
    ]);
  });
});

describe('ids deterministas', () => {
  it('design-1 en vacío; máximo existente + 1; ajenos ignorados', () => {
    const empty = fakeStorage();
    expect(nextSceneDesignId(empty)).toBe('design-1');

    const storage = fakeStorage({
      'furniconfig.modeler.designs.design-2': '{}',
      'furniconfig.modeler.designs.design-7': '{}',
      'furniconfig.modeler.designs.design-abc': '{}',
      'furniconfig.modeler.designs.otra-cosa': '{}',
      'furniconfig.designs': '{}',
    });
    expect(nextSceneDesignId(storage)).toBe('design-8');
  });

  it('createSceneDesign emite el siguiente id y lo lista', () => {
    const storage = fakeStorage();
    const first = createSceneDesign(storage, designDocument('Uno'));
    expect(first).toEqual({ ok: true, id: 'design-1' });
    const second = createSceneDesign(storage, designDocument('Dos'));
    expect(second).toEqual({ ok: true, id: 'design-2' });
    expect(listSceneDesigns(storage).map((entry) => entry.name)).toEqual([
      'Uno',
      'Dos',
    ]);
  });
});

describe('renombrar / duplicar / eliminar', () => {
  it('renombra sin tocar id ni el resto del documento', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', designDocument('Antes'));
    const renamed = renameSceneDesign(storage, 'design-1', '  Después  ');
    expect(renamed.ok).toBe(true);
    const opened = readSceneDesign(storage, 'design-1');
    expect(opened.ok && opened.document.name).toBe('Después');
    expect(listSceneDesigns(storage)[0]?.id).toBe('design-1');
  });

  it('renombrar: vacío → error; inexistente → error; mismo nombre → ok sin escritura', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', designDocument('Nombre'));
    const empty = renameSceneDesign(storage, 'design-1', '   ');
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('ERR_DESIGN_EMPTY_NAME');
    const missing = renameSceneDesign(storage, 'design-9', 'X');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('ERR_DESIGN_NOT_FOUND');
    expect(renameSceneDesign(storage, 'design-1', 'Nombre').ok).toBe(true);
  });

  it('duplica con id nuevo y «(copia)»; el original queda intacto', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', designDocument('Original'));
    const duplicated = duplicateSceneDesign(storage, 'design-1');
    expect(duplicated).toEqual({ ok: true, id: 'design-2' });
    const original = readSceneDesign(storage, 'design-1');
    const copy = readSceneDesign(storage, 'design-2');
    expect(original.ok && original.document.name).toBe('Original');
    expect(copy.ok && copy.document.name).toBe('Original (copia)');
    if (original.ok && copy.ok) {
      expect(copy.document.objects).toEqual(original.document.objects);
    }
    expect(listSceneDesigns(storage)).toHaveLength(2);
  });

  it('eliminar retira SOLO ese diseño; inexistente → error', () => {
    const storage = fakeStorage();
    saveSceneDesign(storage, 'design-1', designDocument('Va'));
    saveSceneDesign(storage, 'design-2', designDocument('Se queda'));
    const deleted = deleteSceneDesign(storage, 'design-1');
    expect(deleted).toEqual({ ok: true, id: 'design-1' });
    expect(listSceneDesigns(storage).map((entry) => entry.id)).toEqual([
      'design-2',
    ]);
    const missing = deleteSceneDesign(storage, 'design-1');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('ERR_DESIGN_NOT_FOUND');
  });
});

describe('getDefaultSceneDesignStorage', () => {
  it('devuelve el localStorage global cuando existe (o null sin él)', () => {
    const storage = getDefaultSceneDesignStorage();
    // Entorno de pruebas node: sin DOM → null (la pantalla degrada
    // con mensaje, nunca con un crash).
    expect(storage === null || typeof storage.setItem === 'function').toBe(
      true,
    );
  });
});
