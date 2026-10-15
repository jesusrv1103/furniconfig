/**
 * Pruebas de `resolveObjectSelection` (FASE-4B-A).
 *
 * Cubre los criterios del `POC_PLAN.md` paso 5: objeto válido → selección;
 * id inexistente → `null`; documento vacío → `null`; clic en vacío →
 * deselección. Más determinismo e inmutabilidad del estado.
 */

import { describe, expect, it } from 'vitest';
import { createEmptySceneDocument } from '../src/document.js';
import { isSelected, resolveObjectSelection } from '../src/selection.js';
import type { SceneDocument } from '../src/types/document.js';
import { validateSceneDocument } from '../src/validate.js';
import { boxComponentRegistry, solidDocumentInput } from './fixtures.js';

function validDocument(): SceneDocument {
  const result = validateSceneDocument(solidDocumentInput());
  if (!result.ok) {
    throw new Error(`fixture inválido: ${JSON.stringify(result.errors)}`);
  }
  return result.document;
}

describe('resolveObjectSelection', () => {
  it('selecciona el objeto existente que coincide con el pick', () => {
    const state = resolveObjectSelection(validDocument(), {
      objectId: 'object-1',
    });
    expect(state).toEqual({
      level: 'object',
      ids: ['object-1'],
      anchor: 'object-1',
    });
    expect(isSelected(state, 'object-1')).toBe(true);
  });

  it('un id inexistente → null (POC paso 5)', () => {
    expect(
      resolveObjectSelection(validDocument(), { objectId: 'object-999' }),
    ).toBeNull();
  });

  it('un clic en el vacío → null (deselección)', () => {
    expect(
      resolveObjectSelection(validDocument(), { objectId: null }),
    ).toBeNull();
  });

  it('documento vacío → null con cualquier pick (POC paso 5)', () => {
    const empty = createEmptySceneDocument();
    expect(resolveObjectSelection(empty, { objectId: 'object-1' })).toBeNull();
    expect(resolveObjectSelection(empty, { objectId: null })).toBeNull();
  });

  it('selecciona componentes tanto como sólidos', () => {
    const result = validateSceneDocument(
      {
        documentVersion: 1,
        id: 'scene-1',
        name: 'Escena',
        gridStepMm: 10,
        originMm: [0, 0, 0],
        materials: [
          { id: 'material-1', name: 'Roble', finish: 'mate', thicknessMm: 18 },
        ],
        objects: [
          {
            id: 'component-7',
            kind: 'component',
            name: 'Clóset',
            type: 'furniconfig.wardrobe',
            version: 1,
            transform: { positionMm: [0, 0, 0] },
            materialId: 'material-1',
            params: { config: { schemaVersion: 1 } },
          },
        ],
      },
      { components: { 'furniconfig.wardrobe': { version: 1 } } },
    );
    if (!result.ok) {
      throw new Error(JSON.stringify(result.errors));
    }
    const state = resolveObjectSelection(result.document, {
      objectId: 'component-7',
    });
    expect(state?.ids).toEqual(['component-7']);
  });

  it('es determinista: misma entrada → mismo resultado', () => {
    const document = validDocument();
    const a = resolveObjectSelection(document, { objectId: 'object-1' });
    const b = resolveObjectSelection(document, { objectId: 'object-1' });
    expect(b).toEqual(a);
    expect(
      resolveObjectSelection(document, { objectId: 'object-999' }),
    ).toBeNull();
  });

  it('no muta el documento ni el pick', () => {
    const document = validDocument();
    const before = structuredClone(document);
    const pick = { objectId: 'object-1' };
    resolveObjectSelection(document, pick);
    expect(structuredClone(document)).toEqual(before);
    expect(pick).toEqual({ objectId: 'object-1' });
  });

  it('devuelve estados congelados (la UI no puede alterarlos)', () => {
    const state = resolveObjectSelection(validDocument(), {
      objectId: 'object-1',
    });
    if (state === null) throw new Error('se esperaba una selección');
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.ids)).toBe(true);
    expect(() => {
      (state.ids as string[]).push('object-2');
    }).toThrow(TypeError);
  });

  it('el estado usa los ids deterministas del documento (patrón Studio)', () => {
    const document = validDocument();
    for (const object of document.objects) {
      const state = resolveObjectSelection(document, { objectId: object.id });
      expect(state?.anchor).toBe(object.id);
    }
  });

  it('el estado es serializable (POC paso 5: estado = lista de ids)', () => {
    const state = resolveObjectSelection(validDocument(), {
      objectId: 'object-1',
    });
    const json = JSON.parse(JSON.stringify(state)) as unknown;
    expect(json).toEqual({ level: 'object', ids: ['object-1'], anchor: 'object-1' });
  });
});

describe('isSelected', () => {
  it('refleja la lista de ids y tolera null', () => {
    const state = resolveObjectSelection(validDocument(), {
      objectId: 'object-1',
    });
    expect(isSelected(state, 'object-1')).toBe(true);
    expect(isSelected(state, 'object-2')).toBe(false);
    expect(isSelected(null, 'object-1')).toBe(false);
  });
});
