/**
 * Pruebas de `createEmptySceneDocument` y `nextSceneId` (FASE-4B-A).
 *
 * Cubre: documento vacío válido, determinismo (I4), inmutabilidad (I3) y
 * generación de IDs estables sin UUID.
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptySceneDocument,
  DEFAULT_GRID_STEP_MM,
  DEFAULT_SCENE_NAME,
  nextSceneId,
} from '../src/document.js';
import { SceneError } from '../src/errors.js';
import { validateSceneDocument } from '../src/validate.js';

describe('createEmptySceneDocument', () => {
  it('produce un documento vacío válido para el validador', () => {
    const document = createEmptySceneDocument();
    const result = validateSceneDocument(document);
    expect(result.ok).toBe(true);
  });

  it('usa los valores por defecto documentados', () => {
    const document = createEmptySceneDocument();
    expect(document.documentVersion).toBe(1);
    expect(document.id).toBe('scene-1');
    expect(document.name).toBe(DEFAULT_SCENE_NAME);
    expect(document.gridStepMm).toBe(DEFAULT_GRID_STEP_MM);
    expect(document.originMm).toEqual([0, 0, 0]);
    expect(document.objects).toEqual([]);
    expect(document.materials).toEqual([]);
  });

  it('admite id y nombre explícitos', () => {
    const document = createEmptySceneDocument('scene-42', 'Biblioteca');
    expect(document.id).toBe('scene-42');
    expect(document.name).toBe('Biblioteca');
  });

  it('es determinista: dos llamadas con la misma entrada producen lo mismo', () => {
    const a = createEmptySceneDocument('scene-7', 'Estudio');
    const b = createEmptySceneDocument('scene-7', 'Estudio');
    expect(a).toEqual(b);
  });

  it('devuelve el documento congelado en profundidad (I3)', () => {
    const document = createEmptySceneDocument();
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.objects)).toBe(true);
    expect(Object.isFrozen(document.originMm)).toBe(true);
  });

  it('rechaza id vacío con SceneError de código estable', () => {
    expect(() => createEmptySceneDocument('')).toThrowError(SceneError);
    try {
      createEmptySceneDocument('   ');
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).code).toBe('ERR_SCENE_INVALID_OBJECT');
    }
  });

  it('rechaza nombre vacío con SceneError de código estable', () => {
    try {
      createEmptySceneDocument('scene-1', '');
      expect.unreachable('debía lanzar SceneError');
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).code).toBe('ERR_SCENE_INVALID_OBJECT');
    }
  });
});

describe('nextSceneId', () => {
  it('devuelve scene-1 sin documentos existentes', () => {
    expect(nextSceneId([])).toBe('scene-1');
  });

  it('devuelve el siguiente al máximo, no al último de la lista', () => {
    // Orden no monótono: el máximo manda (I4 determinista).
    expect(
      nextSceneId([{ id: 'scene-3' }, { id: 'scene-1' }]),
    ).toBe('scene-4');
  });

  it('ignora ids que no siguen el patrón scene-N', () => {
    expect(nextSceneId([{ id: 'otra-escena' }, { id: 'scene-2' }])).toBe(
      'scene-3',
    );
    expect(nextSceneId([{ id: 'escena-99' }])).toBe('scene-1');
  });

  it('dos documentos creados en cadena no comparten id (límite POC paso 1)', () => {
    const first = createEmptySceneDocument();
    const second = createEmptySceneDocument(nextSceneId([first]));
    expect(second.id).not.toBe(first.id);
    expect(second.id).toBe('scene-2');

    const third = createEmptySceneDocument(nextSceneId([first, second]));
    expect(third.id).toBe('scene-3');
  });

  it('es determinista: misma colección → mismo id', () => {
    const existing = [{ id: 'scene-1' }, { id: 'scene-5' }];
    expect(nextSceneId(existing)).toBe(nextSceneId(existing));
  });

  // --- Auditoría FASE-4B-A: unicidad tras importaciones y eliminaciones ---

  it('importación: respeta un id importado de mayor rango (scene-99 → scene-100)', () => {
    expect(nextSceneId([{ id: 'scene-1' }, { id: 'scene-99' }])).toBe(
      'scene-100',
    );
  });

  it('eliminación: el id de la escena máxima borrada queda libre (reuso seguro)', () => {
    // Borrada scene-3 de [1,2,3]: scene-3 ya no está en la colección, puede
    // reutilizarse sin colisión con NADA existente (I4).
    expect(nextSceneId([{ id: 'scene-1' }, { id: 'scene-2' }])).toBe(
      'scene-3',
    );
  });

  it('eliminación intermedia: no reutiliza el hueco, sigue el máximo', () => {
    // Borrada scene-2 de [1,3]: el máximo es 3 → scene-4 (determinista,
    // nunca un id presente en la colección).
    expect(nextSceneId([{ id: 'scene-1' }, { id: 'scene-3' }])).toBe(
      'scene-4',
    );
  });

  it('regresión: id importado ≥ 2⁵³ no produce colisión ni pérdida de precisión', () => {
    // Con aritmética Number, max + 1 se redondeaba al propio id existente
    // y el resultado ERA un id ya presente. Con BigInt es exacto.
    const twoPow53 = '9007199254740992';
    const result = nextSceneId([{ id: `scene-${twoPow53}` }]);
    expect(result).not.toBe(`scene-${twoPow53}`);
    expect(result).toBe('scene-9007199254740993');
    expect(result).toMatch(/^scene-\d+$/);
  });

  it('regresión: id importado gigante no sale en notación científica', () => {
    // Con Number, 10²⁴ convertía la salida a "scene-1e+24", fuera del
    // patrón scene-N: el id qued invisible para futuras llamadas.
    const result = nextSceneId([{ id: 'scene-999999999999999999999999' }]);
    expect(result).toMatch(/^scene-\d+$/);
    expect(result).toBe('scene-1000000000000000000000000');
  });

  it('propiedad: el resultado NUNCA está en la colección de entrada', () => {
    const collections: Array<Array<{ id: string }>> = [
      [],
      [{ id: 'scene-1' }],
      [{ id: 'scene-0' }, { id: 'scene-1' }],
      [{ id: 'scene-007' }],
      [{ id: 'scene-9007199254740992' }, { id: 'scene-1' }],
      [{ id: 'scene-999999999999999999999999' }],
      [{ id: 'scene-1' }, { id: 'otra' }, { id: 'scene-5' }],
    ];
    for (const existing of collections) {
      const next = nextSceneId(existing);
      expect(existing.some((doc) => doc.id === next)).toBe(false);
      expect(next).toMatch(/^scene-\d+$/);
    }
  });
});
