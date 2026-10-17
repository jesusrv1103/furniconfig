/**
 * FASE-4C-A §5 — documento inicial del modelador.
 *
 * `createEmptySceneDocument()` produce un `SceneDocument` v1
 * vacío, validado y CONGELADO (estado inmutable). La pantalla
 * lo verifica con `validateSceneDocument()` antes de usarlo.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRID_STEP_MM,
  SCENE_DOCUMENT_VERSION,
  createEmptySceneDocument,
  validateSceneDocument,
} from '@furniconfig/modeler-core';

describe('SceneDocument inicial del modelador (4C-A)', () => {
  it('crea un documento v1 vacío con valores por defecto', () => {
    const document = createEmptySceneDocument();
    expect(document.documentVersion).toBe(SCENE_DOCUMENT_VERSION);
    expect(document.id).toBe('scene-1');
    expect(document.name).toBe('Escena sin título');
    expect(document.objects).toHaveLength(0);
    expect(document.gridStepMm).toBe(DEFAULT_GRID_STEP_MM);
    expect(document.originMm).toEqual([0, 0, 0]);
  });

  it('pasa la validación del contrato v1', () => {
    const document = createEmptySceneDocument();
    const result = validateSceneDocument(document);
    expect(result.ok).toBe(true);
  });

  it('está CONGELADO: la interfaz no puede mutarlo', () => {
    const document = createEmptySceneDocument();
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.objects)).toBe(true);
    expect(Object.isFrozen(document.materials)).toBe(true);
    expect(() => {
      (document as unknown as { objects: unknown[] }).objects.push({});
    }).toThrow();
  });

  it('dos documentos vacíos son independientes (sin estado compartido)', () => {
    const a = createEmptySceneDocument();
    const b = createEmptySceneDocument('scene-2', 'Otra escena');
    expect(a.id).not.toBe(b.id);
    expect(b.name).toBe('Otra escena');
    expect(Object.isFrozen(a) && Object.isFrozen(b)).toBe(true);
  });
});
