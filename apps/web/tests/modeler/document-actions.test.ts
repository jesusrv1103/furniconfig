/**
 * FASE-4C-B — `document-actions` (acciones puras sobre comandos).
 *
 * Verifica: ids deterministas `solid-N`, alta con material por
 * defecto sin mutar la entrada, ediciones de croquis/extrusión,
 * eliminación, paso de rejilla, y `null` en todas las entradas
 * inválidas (precondición de comando o validador del documento).
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptySceneDocument,
  validateSceneDocument,
  type SceneDocument,
  type SceneObject,
  type Sketch2D,
  type SolidObject,
} from '@furniconfig/modeler-core';

import {
  DEFAULT_SCENE_MATERIAL,
  applySceneAction,
  buildDuplicateObjectCommand,
  buildWardrobeSeedDocument,
  nextSolidId,
} from '../../src/lib/modeler/document-actions.js';

/** Croquis válido de 1200×600 mm en planta (rectángulo axial). */
const SKETCH: Sketch2D = {
  plane: 'ground',
  planeOriginMm: [0, 0, 0],
  pointsMm: [
    [0, 0],
    [1200, 0],
    [1200, 600],
    [0, 600],
  ],
  closed: true,
};

/** Croquis de área nula (todos los vértices colineales). */
const DEGENERATE_SKETCH: Sketch2D = {
  ...SKETCH,
  pointsMm: [
    [0, 0],
    [600, 0],
    [1200, 0],
  ],
};

/** Documento con un único sólido válido. */
function documentWithSolid(): SceneDocument {
  const base = applySceneAction(createEmptySceneDocument(), {
    type: 'add-solid',
    sketch: SKETCH,
    extrusionMm: 100,
  });
  if (base === null) throw new Error('fixture inválida: add-solid rechazado');
  return base;
}

/** Devuelve el sólido en `index` (estrecha la unión `SceneObject`). */
function solidAt(document: SceneDocument, index = 0): SolidObject {
  const object = document.objects[index];
  if (object === undefined || object.kind !== 'solid') {
    throw new Error('fixture inesperada: se esperaba un sólido');
  }
  return object;
}

describe('nextSolidId', () => {
  it('devuelve solid-1 en un documento vacío', () => {
    expect(nextSolidId(createEmptySceneDocument())).toBe('solid-1');
  });

  it('devuelve máximo existente + 1 e ignora ids que no siguen el patrón', () => {
    const document = documentWithSolid();
    const withOthers = {
      ...document,
      objects: [
        ...document.objects,
        { ...document.objects[0]!, id: 'solid-7' },
        { ...document.objects[0]!, id: 'panel-x' },
      ],
    };
    expect(nextSolidId(withOthers)).toBe('solid-8');
  });
});

describe('applySceneAction', () => {
  it('add-solid crea el objeto con material por defecto y no muta la entrada', () => {
    const before = createEmptySceneDocument();
    const next = applySceneAction(before, {
      type: 'add-solid',
      sketch: SKETCH,
      extrusionMm: 100,
    });

    expect(next).not.toBeNull();
    const document = next!;
    expect(document.objects).toHaveLength(1);
    const object = solidAt(document);
    expect(object.id).toBe('solid-1');
    expect(object.name).toBe('Sólido 1');
    expect(object.geometry).toEqual({
      source: 'sketch',
      sketch: SKETCH,
      extrusionMm: 100,
    });
    expect(document.materials.map((material) => material.id)).toEqual([
      DEFAULT_SCENE_MATERIAL.id,
    ]);
    // Entrada intacta (pura).
    expect(before.objects).toHaveLength(0);
    expect(before.materials).toHaveLength(0);
  });

  it('add-solid sucesivos asignan ids secuenciales deterministas', () => {
    const first = applySceneAction(createEmptySceneDocument(), {
      type: 'add-solid',
      sketch: SKETCH,
      extrusionMm: 100,
    })!;
    const second = applySceneAction(first, {
      type: 'add-solid',
      sketch: SKETCH,
      extrusionMm: 250,
    })!;
    expect(second.objects.map((object) => object.id)).toEqual([
      'solid-1',
      'solid-2',
    ]);
    // El material por defecto no se duplica.
    expect(second.materials).toHaveLength(1);
  });

  it('add-solid con croquis degenerado devuelve null (validador)', () => {
    const next = applySceneAction(createEmptySceneDocument(), {
      type: 'add-solid',
      sketch: DEGENERATE_SKETCH,
      extrusionMm: 100,
    });
    expect(next).toBeNull();
  });

  it('set-sketch actualiza el croquis del objeto y conserva el resto', () => {
    const document = documentWithSolid();
    const resized: Sketch2D = {
      ...SKETCH,
      pointsMm: [
        [0, 0],
        [900, 0],
        [900, 600],
        [0, 600],
      ],
    };
    const next = applySceneAction(document, {
      type: 'set-sketch',
      objectId: 'solid-1',
      sketch: resized,
    });

    expect(next).not.toBeNull();
    const geometry = solidAt(next!).geometry;
    expect(geometry.source).toBe('sketch');
    if (geometry.source !== 'sketch') throw new Error('fuente inesperada');
    expect(geometry.sketch.pointsMm).toEqual(resized.pointsMm);
    // Entrada intacta.
    const original = solidAt(document).geometry;
    if (original.source !== 'sketch') throw new Error('fuente inesperada');
    expect(original.sketch.pointsMm).toEqual(SKETCH.pointsMm);
  });

  it('set-sketch sobre objeto inexistente devuelve null (precondición)', () => {
    const document = documentWithSolid();
    expect(
      applySceneAction(document, {
        type: 'set-sketch',
        objectId: 'solid-99',
        sketch: SKETCH,
      }),
    ).toBeNull();
  });

  it('set-extrusion acepta valores en límite y rechaza los que los exceden', () => {
    const document = documentWithSolid();

    const min = applySceneAction(document, {
      type: 'set-extrusion',
      objectId: 'solid-1',
      extrusionMm: 1,
    });
    expect(min).not.toBeNull();

    const max = applySceneAction(document, {
      type: 'set-extrusion',
      objectId: 'solid-1',
      extrusionMm: 1_000_000,
    });
    expect(max).not.toBeNull();

    expect(
      applySceneAction(document, {
        type: 'set-extrusion',
        objectId: 'solid-1',
        extrusionMm: 0,
      }),
    ).toBeNull();
    expect(
      applySceneAction(document, {
        type: 'set-extrusion',
        objectId: 'solid-1',
        extrusionMm: 1_000_001,
      }),
    ).toBeNull();
  });

  it('remove-object elimina el objeto sin tocar el material', () => {
    const document = documentWithSolid();
    const next = applySceneAction(document, {
      type: 'remove-object',
      objectId: 'solid-1',
    });

    expect(next).not.toBeNull();
    expect(next!.objects).toHaveLength(0);
    expect(next!.materials).toHaveLength(1);
    expect(document.objects).toHaveLength(1); // entrada intacta
  });

  it('remove-object sobre objeto inexistente devuelve null', () => {
    const document = documentWithSolid();
    expect(
      applySceneAction(document, { type: 'remove-object', objectId: 'no-existe' }),
    ).toBeNull();
  });

  it('set-grid-step acepta el rango y rechaza pasos fuera de límite', () => {
    const document = createEmptySceneDocument();

    const valid = applySceneAction(document, {
      type: 'set-grid-step',
      gridStepMm: 50,
    });
    expect(valid).not.toBeNull();
    expect(valid!.gridStepMm).toBe(50);

    expect(
      applySceneAction(document, { type: 'set-grid-step', gridStepMm: 0 }),
    ).toBeNull();
    expect(
      applySceneAction(document, { type: 'set-grid-step', gridStepMm: 1001 }),
    ).toBeNull();
    expect(
      applySceneAction(document, { type: 'set-grid-step', gridStepMm: 10.5 }),
    ).toBeNull();
  });

  it('el resultado es un documento congelado (sin extensibilidad)', () => {
    const next = applySceneAction(createEmptySceneDocument(), {
      type: 'add-solid',
      sketch: SKETCH,
      extrusionMm: 100,
    })!;
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.objects)).toBe(true);
  });
});

describe('buildWardrobeSeedDocument (WAVE-02 BLOQUE 0)', () => {
  it('crea la semilla con UN clóset válido (component-1) en el origen', () => {
    const seed = applySceneAction(createEmptySceneDocument(), {
      type: 'set-grid-step',
      gridStepMm: 100,
    });
    if (seed === null) throw new Error('fixture de semilla inválida');
    const withMaterial: SceneDocument = seed.materials.some(
      (material) => material.id === DEFAULT_SCENE_MATERIAL.id,
    )
      ? seed
      : { ...seed, materials: [...seed.materials, DEFAULT_SCENE_MATERIAL] };
    const result = buildWardrobeSeedDocument(withMaterial);
    expect(result).not.toBeNull();
    if (result === null) throw new Error('esperaba documento inicial');
    expect(result.objects).toHaveLength(1);
    const object = result.objects[0];
    expect(object?.id).toBe('component-1');
    expect(object?.kind).toBe('component');
    if (object?.kind !== 'component') throw new Error('esperaba componente');
    expect(object.transform.positionMm).toEqual([0, 0, 0]);
    expect(object.type).toBe('furniconfig.wardrobe');
    // El documento VALIDA (nunca se instala algo inválido).
    expect(validateSceneDocument(result).ok).toBe(true);
  });

  it('es determinista: dos llamadas → mismo documento', () => {
    const seed = applySceneAction(createEmptySceneDocument(), {
      type: 'set-grid-step',
      gridStepMm: 100,
    });
    if (seed === null) throw new Error('fixture de semilla inválida');
    const withMaterial: SceneDocument = {
      ...seed,
      materials: [...seed.materials, DEFAULT_SCENE_MATERIAL],
    };
    const a = buildWardrobeSeedDocument(withMaterial);
    const b = buildWardrobeSeedDocument(withMaterial);
    expect(a).toEqual(b);
  });

  it('la entrada NO se muta', () => {
    const seed = applySceneAction(createEmptySceneDocument(), {
      type: 'set-grid-step',
      gridStepMm: 100,
    });
    if (seed === null) throw new Error('fixture de semilla inválida');
    const withMaterial: SceneDocument = {
      ...seed,
      materials: [...seed.materials, DEFAULT_SCENE_MATERIAL],
    };
    const before = JSON.stringify(withMaterial);
    buildWardrobeSeedDocument(withMaterial);
    expect(JSON.stringify(withMaterial)).toBe(before);
  });
});

/** Documento semilla con UN clóset válido (material incluido). */
function documentWithWardrobe(): SceneDocument {
  const seed = applySceneAction(createEmptySceneDocument(), {
    type: 'set-grid-step',
    gridStepMm: 100,
  });
  if (seed === null) throw new Error('fixture de semilla inválida');
  const withMaterial: SceneDocument = {
    ...seed,
    materials: [...seed.materials, DEFAULT_SCENE_MATERIAL],
  };
  const result = buildWardrobeSeedDocument(withMaterial);
  if (result === null) throw new Error('fixture: semilla rechazada');
  return result;
}

describe('buildDuplicateObjectCommand (WAVE-02 BLOQUE 2)', () => {
  it('sólido de croquis: UNA entrada con la copia trasladada a la derecha', () => {
    const document = documentWithSolid();
    const command = buildDuplicateObjectCommand(document, 'solid-1');
    expect(command).not.toBeNull();
    if (command === null) throw new Error('esperaba comando');
    const next = command.apply(document);
    expect(next.objects).toHaveLength(2);
    const copy = next.objects[1];
    expect(copy?.id).toBe('solid-2');
    expect(copy?.name).toBe('Sólido 1 (copia)');
    if (copy?.kind !== 'solid' || copy.geometry.source !== 'sketch') {
      throw new Error('esperaba sólido de croquis');
    }
    // Ancho 1200 + hueco 200 = 1400 de desplazamiento en X.
    expect(copy.geometry.sketch.pointsMm[0]).toEqual([1400, 0]);
    expect(copy.geometry.sketch.pointsMm[2]).toEqual([2600, 600]);
    // Misma extrusión y material que el original.
    expect(copy.geometry.extrusionMm).toBe(100);
    expect(copy.materialId).toBe(solidAt(document).materialId);
    // Documento resultante VÁLIDO y original intacto.
    expect(validateSceneDocument(next).ok).toBe(true);
    expect(document.objects).toHaveLength(1);
  });

  it('clóset: copia con los MISMOS params en la siguiente posición libre', () => {
    const document = documentWithWardrobe();
    const original = document.objects[0];
    const command = buildDuplicateObjectCommand(document, 'component-1');
    expect(command).not.toBeNull();
    if (command === null) throw new Error('esperaba comando');
    const next = command.apply(document);
    expect(next.objects).toHaveLength(2);
    const copy = next.objects[1];
    expect(copy?.id).toBe('component-2');
    expect(copy?.name).toBe('Clóset 1 (copia)');
    if (copy?.kind !== 'component') throw new Error('esperaba componente');
    expect(copy.type).toBe('furniconfig.wardrobe');
    // Mismos params (config intacta) y posición a la derecha del
    // original (2400 mm de ancho + hueco de 200 mm, determinista).
    expect(copy.params).toEqual(original?.kind === 'component' ? original.params : null);
    expect(copy.transform.positionMm).toEqual([2600, 0, 0]);
    expect(validateSceneDocument(next).ok).toBe(true);
  });

  it('devuelve null para id inexistente, sólido fuera del suelo y componente ajeno', () => {
    const document = documentWithSolid();
    expect(buildDuplicateObjectCommand(document, 'no-existe')).toBeNull();

    const solid = solidAt(document);
    if (solid.geometry.source !== 'sketch') {
      throw new Error('fixture: se esperaba sólido de croquis');
    }
    const wallSolid: SceneDocument = {
      ...document,
      objects: [
        {
          ...solid,
          geometry: {
            ...solid.geometry,
            sketch: { ...solid.geometry.sketch, plane: 'front' as const },
          },
        },
      ],
    };
    expect(buildDuplicateObjectCommand(wallSolid, 'solid-1')).toBeNull();

    const foreign: SceneObject = {
      id: 'component-9',
      kind: 'component',
      name: 'Componente ajeno',
      transform: { positionMm: [0, 0, 0] },
      type: 'test.foo',
      version: 1,
      params: {},
      materialId: 'test-material',
    };
    const withForeign: SceneDocument = {
      ...document,
      objects: [...document.objects, foreign],
    };
    expect(
      buildDuplicateObjectCommand(withForeign, 'component-9'),
    ).toBeNull();
  });

  it('la duplicación es determinista y no muta la entrada', () => {
    const document = documentWithSolid();
    const before = JSON.stringify(document);
    const a = buildDuplicateObjectCommand(document, 'solid-1');
    const b = buildDuplicateObjectCommand(document, 'solid-1');
    expect(a?.id).toBe(b?.id);
    expect(a?.apply(document)).toEqual(b?.apply(document));
    expect(JSON.stringify(document)).toBe(before);
  });
});
