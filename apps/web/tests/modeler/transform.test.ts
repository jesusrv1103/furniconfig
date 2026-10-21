/**
 * WAVE-01 BLOQUE 2 — transformaciones espaciales (módulo puro
 * `lib/modeler/transform.ts`).
 *
 * Verifica: parseo de campos con signo, snap a rejilla, posición
 * autoritativa por tipo de objeto, traslación pura del croquis
 * (forma y dimensiones intactas), UNA entrada de historial por
 * gesto con undo/redo exacto, no-op sin entrada, y que el
 * movimiento de un objeto NUNCA altera a otro.
 */

import { describe, expect, it } from 'vitest';
import {
  SceneError,
  createCommandHistory,
  createEmptySceneDocument,
  executeCommand,
  undoCommand,
  redoCommand,
  sketchDimensionMm,
  type CommandHistory,
  type SceneDocument,
  type Sketch2D,
} from '@furniconfig/modeler-core';

import {
  DEFAULT_SCENE_MATERIAL,
  applySceneAction,
  buildWardrobeAddCommand,
} from '../../src/lib/modeler/document-actions.js';
import {
  buildObjectMoveCommand,
  getObjectPositionMm,
  offsetPositionMm,
  parsePositionMm,
  snapPositionMm,
  translateSketch,
} from '../../src/lib/modeler/transform.js';

/** Croquis válido de 1200×600 mm en el origen. */
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

/**
 * Documento base con el material por defecto (los objetos lo
 * referencian; el validador del comando lo exige presente, igual
 * que la semilla de `ModelerApp`).
 */
function sceneWithDefaults(): SceneDocument {
  const base = createEmptySceneDocument();
  if (base.materials.some((material) => material.id === DEFAULT_SCENE_MATERIAL.id)) {
    return base;
  }
  return { ...base, materials: [...base.materials, DEFAULT_SCENE_MATERIAL] };
}

/** Documento con un único sólido en el origen. */
function documentWithSolid(sketch: Sketch2D = SKETCH): SceneDocument {
  const base = applySceneAction(createEmptySceneDocument(), {
    type: 'add-solid',
    sketch,
    extrusionMm: 100,
  });
  if (base === null) throw new Error('fixture inválida: add-solid rechazado');
  return base;
}

/** Documento con un único clóset (component-1). */
function documentWithWardrobe(): SceneDocument {
  const history = createCommandHistory(sceneWithDefaults(), 10);
  const next = executeCommand(history, buildWardrobeAddCommand(history.present));
  return next.present;
}

/** Documento con DOS clósets (component-1 y component-2). */
function documentWithTwoWardrobes(): SceneDocument {
  const first = createCommandHistory(sceneWithDefaults(), 10);
  const afterFirst = executeCommand(
    first,
    buildWardrobeAddCommand(first.present),
  );
  const second = executeCommand(
    afterFirst,
    buildWardrobeAddCommand(afterFirst.present),
  );
  if (second.present.objects.length !== 2) {
    throw new Error('fixture inválida: se esperaban dos clósets');
  }
  return second.present;
}

/** Aplica un comando como lo haría la UI (historial → execute). */
function applyCommand(
  document: SceneDocument,
  command: ReturnType<typeof buildObjectMoveCommand>,
): SceneDocument {
  const base = createCommandHistory(document, 10);
  return executeCommand(base, command).present;
}

describe('parsePositionMm', () => {
  it('acepta enteros con signo en rango razonable', () => {
    expect(parsePositionMm('0')).toBe(0);
    expect(parsePositionMm('1200')).toBe(1200);
    expect(parsePositionMm('-450')).toBe(-450);
    expect(parsePositionMm('  -7  ')).toBe(-7);
  });

  it('rechaza decimales, exponentes, signo plus suelto, vacíos y basura', () => {
    expect(parsePositionMm('12.5')).toBeNull();
    expect(parsePositionMm('1e3')).toBeNull();
    expect(parsePositionMm('+5')).toBeNull();
    expect(parsePositionMm('')).toBeNull();
    expect(parsePositionMm('abc')).toBeNull();
    expect(parsePositionMm('12 mm')).toBeNull();
    expect(parsePositionMm('12000000')).toBeNull(); // 8 dígitos
    expect(parsePositionMm('-12000000')).toBeNull();
  });
});

describe('snapPositionMm', () => {
  it('redondea X y Z al múltiplo más cercano de la rejilla', () => {
    expect(snapPositionMm([1234, 0, 567], 100)).toEqual([1200, 0, 600]);
    expect(snapPositionMm([-1234, 0, -567], 100)).toEqual([-1200, 0, -600]);
  });

  it('empates hacia arriba (Math.round) e Y siempre intacta', () => {
    expect(snapPositionMm([150, 40, 249], 100)).toEqual([200, 40, 200]);
    expect(snapPositionMm([149, -40, 99], 100)).toEqual([100, -40, 100]);
  });

  it('rejilla inválida (0, no entera o negativa) → sin cambios', () => {
    expect(snapPositionMm([1234, 0, 567], 0)).toEqual([1234, 0, 567]);
    expect(snapPositionMm([1234, 0, 567], 1.5)).toEqual([1234, 0, 567]);
    expect(snapPositionMm([1234, 0, 567], -10)).toEqual([1234, 0, 567]);
  });
});

describe('sketchPositionMm / getObjectPositionMm', () => {
  it('sólido en ground → esquina mínima del croquis', () => {
    const sketch: Sketch2D = {
      ...SKETCH,
      pointsMm: [
        [200, 300],
        [1400, 300],
        [1400, 900],
        [200, 900],
      ],
    };
    const document = documentWithSolid(sketch);
    expect(getObjectPositionMm(document, 'solid-1')).toEqual([200, 0, 300]);
  });

  it('clóset → transform.positionMm; id inexistente → null', () => {
    const document = documentWithWardrobe();
    const position = getObjectPositionMm(document, 'component-1');
    expect(position).toEqual([0, 0, 0]);
    expect(getObjectPositionMm(document, 'no-existe')).toBeNull();
  });

  it('croquis sin vértices → SceneError (sin posición derivable)', () => {
    // Un documento con croquis vacío es inconstructible vía
    // comandos (el validador lo rechaza): se arma a mano para
    // probar la defensa de la función pura.
    const document = documentWithSolid();
    const solid = document.objects[0];
    if (solid === undefined || solid.kind !== 'solid') {
      throw new Error('fixture inesperada');
    }
    if (solid.geometry.source !== 'sketch') {
      throw new Error('fixture inesperada: sin croquis');
    }
    const broken: SceneDocument = {
      ...document,
      objects: [
        {
          ...solid,
          geometry: {
            ...solid.geometry,
            sketch: { ...SKETCH, pointsMm: [] },
          },
        },
      ],
    };
    expect(() => getObjectPositionMm(broken, 'solid-1')).toThrow(SceneError);
  });
});

describe('translateSketch', () => {
  it('traslada puntos y origen del plano conservando forma y closed', () => {
    const moved = translateSketch(SKETCH, 250, -120);
    expect(moved.pointsMm).toEqual([
      [250, -120],
      [1450, -120],
      [1450, 480],
      [250, 480],
    ]);
    expect(moved.planeOriginMm).toEqual([250, 0, -120]);
    expect(moved.closed).toBe(true);
    expect(moved.plane).toBe('ground');
    // Dimensiones intactas (traslación pura, sin deformación).
    expect(sketchDimensionMm(moved, 'widthMm')).toBe(
      sketchDimensionMm(SKETCH, 'widthMm'),
    );
    expect(sketchDimensionMm(moved, 'depthMm')).toBe(
      sketchDimensionMm(SKETCH, 'depthMm'),
    );
  });

  it('desplazamiento con no enteros → SceneError', () => {
    expect(() => translateSketch(SKETCH, 10.5, 0)).toThrow(SceneError);
    expect(() => translateSketch(SKETCH, 0, Number.NaN)).toThrow(SceneError);
  });
});

describe('buildObjectMoveCommand — sólido (set-sketch)', () => {
  it('mueve la esquina mínima al objetivo con UNA entrada y undo exacto', () => {
    const document = documentWithSolid();
    const command = buildObjectMoveCommand(document, 'solid-1', [500, 0, 300]);
    expect(command.kind).toBe('set-sketch');

    const base = createCommandHistory(document, 10);
    const moved = executeCommand(base, command);
    expect(moved).not.toBe(base); // UNA entrada por gesto
    expect(getObjectPositionMm(moved.present, 'solid-1')).toEqual([500, 0, 300]);

    const solid = moved.present.objects[0];
    if (solid === undefined || solid.kind !== 'solid') {
      throw new Error('objeto inesperado');
    }
    if (solid.geometry.source !== 'sketch') {
      throw new Error('objeto inesperado: sin croquis');
    }
    // Traslación pura: dimensiones y extrusión intactas.
    expect(solid.geometry.extrusionMm).toBe(100);
    expect(sketchDimensionMm(solid.geometry.sketch, 'widthMm')).toBe(1200);
    expect(sketchDimensionMm(solid.geometry.sketch, 'depthMm')).toBe(600);

    const undone = undoCommand(moved);
    expect(getObjectPositionMm(undone.present, 'solid-1')).toEqual([0, 0, 0]);
    const redone = redoCommand(undone);
    expect(getObjectPositionMm(redone.present, 'solid-1')).toEqual([500, 0, 300]);
  });

  it('no-op (misma posición) → el historial no cambia (misma referencia)', () => {
    const document = documentWithSolid();
    const command = buildObjectMoveCommand(document, 'solid-1', [0, 0, 0]);
    const base = createCommandHistory(document, 10);
    expect(executeCommand(base, command)).toBe(base);
  });

  it('mover un sólido no altera a otro (croquis ajeno intacto)', () => {
    const first = documentWithSolid();
    const second = applySceneAction(first, {
      type: 'add-solid',
      sketch: { ...SKETCH, pointsMm: [[2000, 0], [2600, 0], [2600, 400], [2000, 400]] },
      extrusionMm: 50,
    });
    if (second === null) throw new Error('fixture inválida');
    const otherBefore = second.objects[1];

    const moved = applyCommand(
      second,
      buildObjectMoveCommand(second, 'solid-1', [100, 0, 100]),
    );
    expect(moved.objects[1]).toEqual(otherBefore); // intacto (validador re-congela)
    expect(getObjectPositionMm(moved, 'solid-2')).toEqual([2000, 0, 0]);
  });
});

describe('buildObjectMoveCommand — clóset (set-transform)', () => {
  it('actualiza transform sin tocar params y con undo exacto', () => {
    const document = documentWithWardrobe();
    const before = document.objects[0];
    if (before === undefined || before.kind !== 'component') {
      throw new Error('fixture inesperada');
    }
    const command = buildObjectMoveCommand(document, 'component-1', [800, 0, 400]);
    expect(command.kind).toBe('set-transform');

    const base = createCommandHistory(document, 10);
    const moved = executeCommand(base, command);
    const after = moved.present.objects[0];
    if (after === undefined || after.kind !== 'component') {
      throw new Error('objeto inesperado');
    }
    expect(after.transform.positionMm).toEqual([800, 0, 400]);
    expect(after.params).toEqual(before.params); // intactos (validador re-congela)

    const undone = undoCommand(moved);
    const restored = undone.present.objects[0];
    if (restored === undefined || restored.kind !== 'component') {
      throw new Error('objeto inesperado');
    }
    expect(restored.transform.positionMm).toEqual([0, 0, 0]);
  });

  it('mover un clóset no altera al otro (posición y params)', () => {
    const document = documentWithTwoWardrobes();
    const firstBefore = document.objects[0];

    const moved = applyCommand(
      document,
      buildObjectMoveCommand(document, 'component-2', [5000, 0, 2500]),
    );
    expect(moved.objects[0]).toEqual(firstBefore); // el otro, intacto
    expect(getObjectPositionMm(moved, 'component-1')).toEqual(
      getObjectPositionMm(document, 'component-1'),
    );
    expect(getObjectPositionMm(moved, 'component-2')).toEqual([5000, 0, 2500]);
  });
});

describe('buildObjectMoveCommand — validación', () => {
  it('id inexistente → ERR_SCENE_OBJECT_NOT_FOUND', () => {
    const document = documentWithSolid();
    try {
      buildObjectMoveCommand(document, 'no-existe', [0, 0, 0]);
      expect.unreachable('debió lanzar SceneError');
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).code).toBe('ERR_SCENE_OBJECT_NOT_FOUND');
    }
  });

  it('posición con no enteros → ERR_SCENE_TRANSFORM_INVALID', () => {
    const document = documentWithSolid();
    try {
      buildObjectMoveCommand(document, 'solid-1', [10.5, 0, 0]);
      expect.unreachable('debió lanzar SceneError');
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).code).toBe('ERR_SCENE_TRANSFORM_INVALID');
    }
  });

  it('el documento de entrada queda intacto (sin mutación, I3)', () => {
    const document = documentWithSolid();
    const before = JSON.stringify(document);
    buildObjectMoveCommand(document, 'solid-1', [900, 0, 900]);
    expect(JSON.stringify(document)).toBe(before);
  });
});

describe('offsetPositionMm', () => {
  it('suma dx/dz conservando Y (previsualización de arrastre)', () => {
    expect(offsetPositionMm([100, 0, 200], 50, -30)).toEqual([150, 0, 170]);
  });
});
