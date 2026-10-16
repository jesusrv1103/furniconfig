/**
 * Pruebas del Command System + Undo/Redo (FASE-4B-B).
 *
 * Cubre, según el pedido de la fase: los 7 tipos de comando, reversibilidad
 * exacta, determinismo, inmutabilidad (apply/revert no alteran los
 * documentos previos), conflictos de precondiciones, no-op explícito,
 * límite del historial, descarte de `future`, undo/redo repetidos sobre
 * secuencias largas y las tres situaciones (A) cambio válido, (B) no-op y
 * (C) operación inválida sin corromper el historial.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMAND_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createCommandHistory,
  deepEqual,
  executeCommand,
  redoCommand,
  undoCommand,
  type Command,
  type CommandKind,
} from '../src/command.js';
import {
  createAddObjectCommand,
  createRemoveObjectCommand,
  createRenameCommand,
  createSetExtrusionCommand,
  createSetParamsCommand,
  createSetSketchCommand,
  createSetTransformCommand,
} from '../src/commands.js';
import { SceneError, type SceneErrorCode } from '../src/errors.js';
import { validateSceneDocument } from '../src/validate.js';
import type {
  SceneDocument,
  Sketch2D,
} from '../src/types/document.js';
import {
  asDocument,
  baseComponent,
  baseSolid,
  boxComponentRegistry,
  componentDocumentInput,
  rectSketch,
  solidDocumentInput,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers locales
// ---------------------------------------------------------------------------

/** Documento validado (y congelado) a partir de una entrada arbitraria. */
function validated(input: unknown): SceneDocument {
  const result = validateSceneDocument(input);
  if (!result.ok) {
    throw new Error(
      `fixture de prueba inválida: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.document;
}

/** Documento nominal: material + sólido `object-1` + componente `component-1`. */
function mixedInput(): Record<string, unknown> {
  return {
    ...componentDocumentInput(),
    objects: [{ ...baseSolid }, { ...baseComponent }],
  };
}

function mixedDoc(): SceneDocument {
  return validated(mixedInput());
}

/** Documento nominal con el componente `component-1` (sin registro). */
function componentDoc(): SceneDocument {
  return validated(componentDocumentInput());
}

/** El documento del historial debe seguir siendo válido en cada estado. */
function expectValidDocument(document: SceneDocument): void {
  const result = validateSceneDocument(document);
  if (!result.ok) {
    throw new Error(
      `documento inválido en el historial: ${JSON.stringify(result.errors)}`,
    );
  }
}

/** Ejecuta `fn`, exige `SceneError` con el código dado y lo devuelve. */
function expectSceneError(fn: () => unknown, code: SceneErrorCode): SceneError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SceneError);
    const sceneError = error as SceneError;
    expect(sceneError.code).toBe(code);
    return sceneError;
  }
  throw new Error(`se esperaba SceneError ${code} pero no se lanzó nada`);
}

/** Croquis distinto de `rectSketch`, válido y no degenerado. */
const otherSketch: Sketch2D = {
  plane: 'ground',
  planeOriginMm: [0, 0, 0],
  pointsMm: [
    [0, 0],
    [800, 0],
    [800, 400],
    [0, 400],
  ],
  closed: true,
};

/** Tabla de los 7 comandos: cada fábrica sobre el documento nominal. */
const factories: ReadonlyArray<{
  kind: CommandKind;
  target: string;
  make: (doc: SceneDocument) => Command;
}> = [
  {
    kind: 'add-object',
    target: 'object-2',
    make: (doc) =>
      createAddObjectCommand(doc, {
        ...baseSolid,
        id: 'object-2',
        name: 'Placa nueva',
      }),
  },
  {
    kind: 'remove-object',
    target: 'object-1',
    make: (doc) => createRemoveObjectCommand(doc, 'object-1'),
  },
  {
    kind: 'set-sketch',
    target: 'object-1',
    make: (doc) => createSetSketchCommand(doc, 'object-1', otherSketch),
  },
  {
    kind: 'set-extrusion',
    target: 'object-1',
    make: (doc) => createSetExtrusionCommand(doc, 'object-1', 25),
  },
  {
    kind: 'set-transform',
    target: 'object-1',
    make: (doc) => createSetTransformCommand(doc, 'object-1', [100, 0, 50]),
  },
  {
    kind: 'set-params',
    target: 'component-1',
    make: (doc) =>
      createSetParamsCommand(doc, 'component-1', {
        widthMm: 800,
        label: 'Caja ancha',
        lid: false,
      }),
  },
  {
    kind: 'rename',
    target: 'object-1',
    make: (doc) => createRenameCommand(doc, 'object-1', 'Mesa'),
  },
];

// ---------------------------------------------------------------------------
// createCommandHistory
// ---------------------------------------------------------------------------

describe('createCommandHistory', () => {
  it('crea un historial vacío con present validado y congelado (límite 100 PROVISIONAL)', () => {
    const doc = mixedDoc();
    const history = createCommandHistory(doc);

    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(history.limit).toBe(DEFAULT_COMMAND_HISTORY_LIMIT);
    expect(DEFAULT_COMMAND_HISTORY_LIMIT).toBe(100);
    expect(history.present).toEqual(doc);
    // El present es una reconstrucción validada, no la referencia de entrada.
    expect(history.present).not.toBe(doc);
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history.past)).toBe(true);
    expect(Object.isFrozen(history.future)).toBe(true);
    expect(Object.isFrozen(history.present)).toBe(true);
  });

  it('acepta un límite personalizado', () => {
    const history = createCommandHistory(mixedDoc(), 3);
    expect(history.limit).toBe(3);
  });

  it('rechaza límites inválidos (entero ≥ 1)', () => {
    const doc = mixedDoc();
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      expectSceneError(
        () => createCommandHistory(doc, limit),
        'ERR_SCENE_INVALID_OBJECT',
      );
    }
  });

  it('rechaza un documento inicial inválido con el código del primer hallazgo', () => {
    const duplicated = asDocument({
      ...solidDocumentInput(),
      objects: [{ ...baseSolid }, { ...baseSolid }],
    });
    expectSceneError(
      () => createCommandHistory(duplicated),
      'ERR_SCENE_DUPLICATE_ID',
    );
  });
});

// ---------------------------------------------------------------------------
// (A) situación válida: los 7 tipos de comando
// ---------------------------------------------------------------------------

describe('comandos: los 7 tipos (situación A)', () => {
  it('cada comando se ejecuta, produce documento válido y una entrada en past', () => {
    for (const { kind, target, make } of factories) {
      const doc = mixedDoc();
      const command = make(doc);
      expect(command.kind).toBe(kind);
      expect(command.id).toMatch(
        new RegExp(`^cmd:${kind}:${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:[0-9a-f]{16}$`),
      );
      expect(command.label.length).toBeGreaterThan(0);

      const history = createCommandHistory(doc);
      const next = executeCommand(history, command);
      expect(next.past.length).toBe(1);
      expect(next.past[0]).toBe(command);
      expect(next.future).toEqual([]);
      expect(next.present).not.toBe(history.present);
      expectValidDocument(next.present);
      expect(Object.isFrozen(next.present)).toBe(true);
    }
  });

  it('apply y revert son el inverso exacto para los 7 tipos', () => {
    for (const { make } of factories) {
      const doc = mixedDoc();
      const pristine = mixedDoc();
      const command = make(doc);

      const applied = command.apply(doc);
      expect(applied).not.toBe(doc);
      expectValidDocument(applied);

      const reverted = command.revert(applied);
      expect(reverted).toEqual(pristine);
      // La entrada original no se toca (está congelada: mutarla lanzaría).
      expect(doc).toEqual(pristine);
    }
  });

  it('undo/redo recorren cada tipo validando cada estado (criterio 9.2 del POC)', () => {
    for (const { make } of factories) {
      const original = mixedDoc();
      const history = createCommandHistory(original);
      const applied = executeCommand(history, make(original));
      expectValidDocument(applied.present);

      const undone = undoCommand(applied);
      expectValidDocument(undone.present);
      expect(undone.present).toEqual(original);

      const redone = redoCommand(undone);
      expectValidDocument(redone.present);
      expect(redone.present).toEqual(applied.present);
      expect(redone.past.length).toBe(1);
      expect(redone.future).toEqual([]);
    }
  });

  it('set-params admite params anidados y los preserva en undo/redo', () => {
    const doc = componentDoc();
    const nested = {
      dims: { width: 600, tags: ['a', 'b'] },
      on: true,
      deep: { a: { b: { c: 1 } } },
    };
    const history = createCommandHistory(doc);
    const applied = executeCommand(
      history,
      createSetParamsCommand(doc, 'component-1', nested),
    );
    expectValidDocument(applied.present);

    const undone = undoCommand(applied);
    expect(undone.present).toEqual(doc);

    const redone = redoCommand(undone);
    const component = redone.present.objects.find(
      (candidate) => candidate.id === 'component-1',
    );
    expect(component?.kind).toBe('component');
    expect(
      component?.kind === 'component' ? component.params : undefined,
    ).toEqual(nested);
  });
});

// ---------------------------------------------------------------------------
// Undo/redo exactos y descarte de future
// ---------------------------------------------------------------------------

describe('undo/redo', () => {
  it('undo exacto: vuelve al estado anterior y habilita redo', () => {
    const doc = mixedDoc();
    const history = createCommandHistory(doc);
    const applied = executeCommand(
      history,
      createRenameCommand(doc, 'object-1', 'Mesa'),
    );

    const undone = undoCommand(applied);
    expect(undone.present).toEqual(doc);
    expect(undone.past).toEqual([]);
    expect(undone.future.length).toBe(1);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);
  });

  it('redo exacto: reaplica el comando deshecho', () => {
    const doc = mixedDoc();
    const applied = executeCommand(
      createCommandHistory(doc),
      createRenameCommand(doc, 'object-1', 'Mesa'),
    );
    const redone = redoCommand(undoCommand(applied));
    expect(redone.present).toEqual(applied.present);
    expect(redone.past.length).toBe(1);
    expect(redone.future).toEqual([]);
  });

  it('una operación nueva tras undo descarta el future (criterio 9.3)', () => {
    const doc = mixedDoc();
    let history = createCommandHistory(doc);
    const first = createRenameCommand(doc, 'object-1', 'Uno');
    history = executeCommand(history, first);
    const docAfterFirst = history.present;
    const second = createRenameCommand(history.present, 'object-1', 'Dos');
    history = executeCommand(history, second);
    history = undoCommand(history);
    expect(history.future.length).toBe(1);

    const third = createRenameCommand(history.present, 'object-1', 'Tres');
    history = executeCommand(history, third);

    expect(history.future).toEqual([]);
    expect(history.past.length).toBe(2);
    expect(history.past[0]).toBe(first);
    expect(history.past[1]).toBe(third);
    expect(history.present.objects[0]?.name).toBe('Tres');
    // El estado tras el primer comando sigue siendo el base del tercero.
    expect(docAfterFirst.objects[0]?.name).toBe('Uno');
  });

  it('undo y redo sobre pila vacía devuelven la misma referencia (no son error)', () => {
    const history = createCommandHistory(mixedDoc());
    expect(undoCommand(history)).toBe(history);
    expect(redoCommand(history)).toBe(history);

    const applied = executeCommand(
      history,
      createRenameCommand(history.present, 'object-1', 'Mesa'),
    );
    const undone = undoCommand(applied);
    const redone = redoCommand(undone);
    expect(redoCommand(redone)).toBe(redone);
  });

  it('alternar undo/redo durante la edición mantiene el documento', () => {
    let history = createCommandHistory(mixedDoc());
    const expected: string[] = [];
    for (let i = 1; i <= 10; i += 1) {
      const command = createRenameCommand(
        history.present,
        'object-1',
        `Nombre ${i}`,
      );
      history = executeCommand(history, command);
      expected.push(`Nombre ${i}`);
      if (i % 3 === 0) {
        history = undoCommand(history);
        expected.pop();
        history = redoCommand(history);
        expected.push(`Nombre ${i}`);
      }
      expect(history.present.objects[0]?.name).toBe(expected.at(-1));
      expectValidDocument(history.present);
    }
    expect(history.past.length).toBe(10);
    expect(history.future).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (B) no-op explícito
// ---------------------------------------------------------------------------

describe('no-op (situación B)', () => {
  it('set-transform al mismo valor no crea entrada (misma referencia)', () => {
    const doc = mixedDoc();
    const history = createCommandHistory(doc);
    const next = executeCommand(
      history,
      createSetTransformCommand(doc, 'object-1', [0, 0, 0]),
    );
    expect(next).toBe(history);
    expect(next.past).toEqual([]);
  });

  it('rename al mismo nombre no crea entrada', () => {
    const doc = mixedDoc();
    const next = executeCommand(
      createCommandHistory(doc),
      createRenameCommand(doc, 'object-1', 'Placa'),
    );
    expect(next.past).toEqual([]);
  });

  it('set-params igual en contenido pero distinto en referencia es no-op (igualdad estructural)', () => {
    const doc = componentDoc();
    const next = executeCommand(
      createCommandHistory(doc),
      createSetParamsCommand(doc, 'component-1', {
        widthMm: 600,
        label: 'Caja alta',
        lid: true,
      }),
    );
    expect(next.past).toEqual([]);
  });

  it('set-sketch igual en contenido pero con arrays nuevos es no-op', () => {
    const doc = mixedDoc();
    const equalSketch: Sketch2D = {
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
    expect(equalSketch).not.toBe(rectSketch);
    const next = executeCommand(
      createCommandHistory(doc),
      createSetSketchCommand(doc, 'object-1', equalSketch),
    );
    expect(next.past).toEqual([]);
  });

  it('set-extrusion al mismo valor es no-op', () => {
    const doc = mixedDoc();
    const next = executeCommand(
      createCommandHistory(doc),
      createSetExtrusionCommand(doc, 'object-1', 18),
    );
    expect(next.past).toEqual([]);
  });

  it('un no-op no descarta el future pendiente', () => {
    const doc = mixedDoc();
    let history = createCommandHistory(doc);
    const command = createRenameCommand(doc, 'object-1', 'Mesa');
    history = executeCommand(history, command);
    history = undoCommand(history);
    expect(history.future.length).toBe(1);

    const noop = createRenameCommand(
      history.present,
      'object-1',
      'Placa', // ya es el nombre tras deshacer
    );
    const next = executeCommand(history, noop);
    expect(next).toBe(history);
    expect(next.future.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (C) operación inválida / conflictos de precondiciones
// ---------------------------------------------------------------------------

describe('operaciones inválidas (situación C)', () => {
  it('remove-object de un objeto inexistente falla en la creación', () => {
    expectSceneError(
      () => createRemoveObjectCommand(mixedDoc(), 'object-99'),
      'ERR_SCENE_OBJECT_NOT_FOUND',
    );
  });

  it('set-transform para un objeto inexistente falla en la creación', () => {
    expectSceneError(
      () => createSetTransformCommand(mixedDoc(), 'object-99', [0, 0, 0]),
      'ERR_SCENE_OBJECT_NOT_FOUND',
    );
  });

  it('add-object con id ya presente falla en la creación (ERR_SCENE_DUPLICATE_ID)', () => {
    expectSceneError(
      () => createAddObjectCommand(mixedDoc(), { ...baseSolid }),
      'ERR_SCENE_DUPLICATE_ID',
    );
  });

  it('aplicar el mismo add-object dos veces falla y no corrompe el historial', () => {
    const doc = mixedDoc();
    const command = createAddObjectCommand(doc, {
      ...baseSolid,
      id: 'object-2',
    });
    let history = executeCommand(createCommandHistory(doc), command);
    expect(history.past.length).toBe(1);

    const before = history;
    expectSceneError(() => executeCommand(history, command), 'ERR_SCENE_DUPLICATE_ID');
    // El historial queda intacto: misma referencia, mismo estado.
    expect(history).toBe(before);
    expect(history.present.objects.length).toBe(3); // 2 del doc + el añadido
    expect(history.past.length).toBe(1);
  });

  it('entradas estáticas inválidas lanzan sus códigos en la creación', () => {
    const doc = mixedDoc();
    const component = componentDoc();
    expectSceneError(
      () => createSetParamsCommand(component, 'component-1', [] as never),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
    expectSceneError(
      () => createSetExtrusionCommand(doc, 'object-1', 0),
      'ERR_SCENE_INVALID_EXTRUSION',
    );
    expectSceneError(
      () => createSetExtrusionCommand(doc, 'object-1', 12.5),
      'ERR_SCENE_INVALID_EXTRUSION',
    );
    expectSceneError(
      () => createSetTransformCommand(doc, 'object-1', [1.5, 0, 0] as never),
      'ERR_SCENE_TRANSFORM_INVALID',
    );
    expectSceneError(
      () => createSetTransformCommand(doc, 'object-1', [0, 0] as never),
      'ERR_SCENE_TRANSFORM_INVALID',
    );
    expectSceneError(
      () => createRenameCommand(doc, 'object-1', '   '),
      'ERR_SCENE_INVALID_OBJECT',
    );
    expectSceneError(
      () => createSetParamsCommand(doc, 'object-1', { widthMm: 600 }),
      'ERR_SCENE_INVALID_OBJECT', // el objetivo es un sólido, no un componente
    );
    expectSceneError(
      () => createSetSketchCommand(component, 'component-1', otherSketch),
      'ERR_SCENE_INVALID_OBJECT', // el objetivo es un componente, no un sólido
    );
    expectSceneError(
      () => createAddObjectCommand(doc, { id: '', kind: 'solid' } as never),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });

  it('un comando creado contra otro documento choca (ERR_SCENE_COMMAND_CONFLICT)', () => {
    const docA = mixedDoc();
    const command = createSetTransformCommand(docA, 'object-1', [100, 0, 0]);

    const docB = validated({
      ...mixedInput(),
      objects: [
        { ...baseSolid, transform: { positionMm: [50, 0, 0] } },
        { ...baseComponent },
      ],
    });
    const historyB = createCommandHistory(docB);
    const error = expectSceneError(
      () => executeCommand(historyB, command),
      'ERR_SCENE_COMMAND_CONFLICT',
    );
    expect(error.details.objectId).toBe('object-1');
    expect(historyB.past).toEqual([]);
    expect(historyB.present).toEqual(docB);
  });

  it('remove-object choca si el objeto cambió o se reordenó (conflicto de snapshot)', () => {
    const docA = mixedDoc();
    const command = createRemoveObjectCommand(docA, 'object-1');

    // (a) El objeto fue modificado entre creación y apply.
    const modified = validated({
      ...mixedInput(),
      objects: [{ ...baseSolid, name: 'Renombrada' }, { ...baseComponent }],
    });
    expectSceneError(
      () => command.apply(modified),
      'ERR_SCENE_COMMAND_CONFLICT',
    );

    // (b) El objeto cambió de índice (orden alterado).
    const reordered = validated({
      ...mixedInput(),
      objects: [{ ...baseComponent }, { ...baseSolid }],
    });
    expectSceneError(
      () => command.apply(reordered),
      'ERR_SCENE_COMMAND_CONFLICT',
    );
  });

  it('revert sin apply previo choca (precondición del estado posterior)', () => {
    const doc = mixedDoc();
    const command = createRenameCommand(doc, 'object-1', 'Mesa');
    expectSceneError(() => command.revert(doc), 'ERR_SCENE_COMMAND_CONFLICT');
  });

  it('un comando que produciría un documento inválido no entra en el historial', () => {
    const doc = mixedDoc();
    const bad = { ...baseSolid, id: 'object-2', materialId: 'material-99' };
    const command = createAddObjectCommand(doc, bad as never);
    const history = createCommandHistory(doc);

    expectSceneError(
      () => executeCommand(history, command),
      'ERR_SCENE_UNKNOWN_MATERIAL',
    );
    expect(history.past).toEqual([]);
    expect(history.present).toEqual(doc);
  });

  it('params fuera de rango se detectan en execute cuando hay registro (options)', () => {
    const doc = componentDoc();
    const command = createSetParamsCommand(doc, 'component-1', {
      widthMm: 99_999, // fuera del esquema [100, 4000] de boxComponentRegistry
    });
    // Sin registro: validación estructural, pasa.
    const permissive = executeCommand(createCommandHistory(doc), command);
    expect(permissive.past.length).toBe(1);
    // Con registro: rechazado con el código del validador y sin tocar historial.
    const history = createCommandHistory(doc);
    expectSceneError(
      () =>
        executeCommand(history, command, {
          components: boxComponentRegistry,
        }),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
    expect(history.past).toEqual([]);
  });

  it('un set-params con params profundos se rechaza sin desbordar (cota del validador)', () => {
    const doc = componentDoc();
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 64; i += 1) {
      deep = { nested: deep };
    }
    const command = createSetParamsCommand(
      doc,
      'component-1',
      deep as never,
    );
    expectSceneError(
      () => executeCommand(createCommandHistory(doc), command),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
  });

  it('params circulares no desbordan ni la fábrica ni el historial', () => {
    const doc = componentDoc();
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    const command = createSetParamsCommand(
      doc,
      'component-1',
      circular as never,
    );
    expectSceneError(
      () => executeCommand(createCommandHistory(doc), command),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
  });
});

// ---------------------------------------------------------------------------
// Límite, secuencias largas, inmutabilidad y determinismo
// ---------------------------------------------------------------------------

describe('límite del historial', () => {
  it('recorta past al límite descartando las entradas más antiguas', () => {
    let history = createCommandHistory(mixedDoc(), 3);
    for (let i = 1; i <= 5; i += 1) {
      const command = createRenameCommand(
        history.present,
        'object-1',
        `Nombre ${i}`,
      );
      history = executeCommand(history, command);
    }
    expect(history.past.length).toBe(3);
    expect(history.present.objects[0]?.name).toBe('Nombre 5');
    expect(history.past.map((command) => command.label)).toEqual([
      'Renombrar "Nombre 2" → "Nombre 3"',
      'Renombrar "Nombre 3" → "Nombre 4"',
      'Renombrar "Nombre 4" → "Nombre 5"',
    ]);

    history = undoCommand(history);
    expect(history.present.objects[0]?.name).toBe('Nombre 4');
    history = undoCommand(history);
    expect(history.present.objects[0]?.name).toBe('Nombre 3');
    history = undoCommand(history);
    // Los comandos 1-2 se descartaron: el fondo del historial es su efecto.
    expect(history.present.objects[0]?.name).toBe('Nombre 2');
    expect(canUndo(history)).toBe(false);
    expect(history.past).toEqual([]);
    expect(history.future.length).toBe(3);
  });

  it('secuencia larga (120 operaciones, límite 100): undo y redo completos sin corromper', () => {
    let history = createCommandHistory(mixedDoc());
    for (let i = 1; i <= 120; i += 1) {
      const command = createRenameCommand(
        history.present,
        'object-1',
        `Nombre ${i}`,
      );
      history = executeCommand(history, command);
      expectValidDocument(history.present);
    }
    expect(history.past.length).toBe(100);

    while (canUndo(history)) {
      history = undoCommand(history);
      expectValidDocument(history.present);
    }
    // Se revirtieron los 100 comandos conservados: quedan los 20 primeros.
    expect(history.present.objects[0]?.name).toBe('Nombre 20');
    expect(history.future.length).toBe(100);

    while (canRedo(history)) {
      history = redoCommand(history);
      expectValidDocument(history.present);
    }
    expect(history.present.objects[0]?.name).toBe('Nombre 120');
    expect(history.past.length).toBe(100);
    expect(canRedo(history)).toBe(false);
  });
});

describe('inmutabilidad y determinismo', () => {
  it('apply y revert no mutan los documentos de entrada (I3)', () => {
    const doc = mixedDoc(); // congelado por el validador
    const pristine = mixedDoc();
    for (const { make } of factories) {
      const command = make(doc);
      const applied = command.apply(doc);
      const reverted = command.revert(applied);
      expect(reverted).toEqual(pristine);
    }
    expect(doc).toEqual(pristine);
  });

  it('el present del historial no comparte el array de objetos con la entrada', () => {
    const doc = mixedDoc();
    const history = createCommandHistory(doc);
    expect(history.present.objects).not.toBe(doc.objects);
    expect(history.present.objects[0]).not.toBe(doc.objects[0]);
  });

  it('las fábricas son deterministas (misma entrada → mismo id, label y resultado)', () => {
    const docA = mixedDoc();
    const docB = mixedDoc();
    const a = createSetTransformCommand(docA, 'object-1', [10, 20, 30]);
    const b = createSetTransformCommand(docB, 'object-1', [10, 20, 30]);
    expect(a.id).toBe(b.id);
    expect(a.label).toBe(b.label);
    expect(a.apply(docA)).toEqual(b.apply(docB));

    const renameA = createRenameCommand(docA, 'object-1', 'Mesa');
    const renameB = createRenameCommand(docB, 'object-1', 'Mesa');
    expect(renameA.id).toBe(renameB.id);
    expect(renameA.label).toBe(renameB.label);
  });

  it('deepEqual compara por estructura (orden de claves irrelevante)', () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(null, {})).toBe(false);
  });

  it('los ids son únicos por contenido: mismo insumo → mismo id, delta distinto → id distinto', () => {
    const doc = mixedDoc();
    // Mismos insumos (en documentos equivalentes) → mismo id.
    const renameA = createRenameCommand(doc, 'object-1', 'Mesa');
    const renameB = createRenameCommand(mixedDoc(), 'object-1', 'Mesa');
    expect(renameA.id).toBe(renameB.id);
    expect(renameA.id).toMatch(/^cmd:rename:object-1:[0-9a-f]{16}$/);

    // Operaciones distintas sobre el mismo objetivo → ids distintos.
    const renameOther = createRenameCommand(doc, 'object-1', 'Silla');
    expect(renameOther.id).not.toBe(renameA.id);

    const moveA = createSetTransformCommand(doc, 'object-1', [1, 0, 0]);
    const moveB = createSetTransformCommand(doc, 'object-1', [2, 0, 0]);
    expect(moveA.id).not.toBe(moveB.id);

    // El orden de claves de params no altera el id (forma canónica).
    const paramsA = createSetParamsCommand(componentDoc(), 'component-1', {
      widthMm: 700,
      label: 'X',
    });
    const paramsB = createSetParamsCommand(componentDoc(), 'component-1', {
      label: 'X',
      widthMm: 700,
    });
    expect(paramsA.id).toBe(paramsB.id);
    const paramsOther = createSetParamsCommand(componentDoc(), 'component-1', {
      widthMm: 701,
      label: 'X',
    });
    expect(paramsOther.id).not.toBe(paramsA.id);

    // add/remove distinguen por objeto e índice capturados.
    const added = createAddObjectCommand(doc, {
      ...baseSolid,
      id: 'object-2',
    });
    const addedOther = createAddObjectCommand(doc, {
      ...baseSolid,
      id: 'object-3',
    });
    expect(added.id).not.toBe(addedOther.id);
  });

  it('los ids duplicados hostiles no confunden al historial (direccionamiento posicional)', () => {
    const doc = mixedDoc();
    // Comandos distintos forzados a compartir id (caso hostil imposible
    // con las fábricas): el historial usa posiciones, nunca el id.
    const first = createRenameCommand(doc, 'object-1', 'Uno');
    const forcedFirst: Command = { ...first, id: 'cmd:forzado' };
    let history = executeCommand(createCommandHistory(doc), forcedFirst);

    const second = createRenameCommand(history.present, 'object-1', 'Dos');
    const forcedSecond: Command = { ...second, id: 'cmd:forzado' };
    history = executeCommand(history, forcedSecond);

    expect(history.past.length).toBe(2);
    expect(history.past[0]).not.toBe(history.past[1]);

    history = undoCommand(history);
    expect(history.present.objects[0]?.name).toBe('Uno');
    history = undoCommand(history);
    expect(history.present).toEqual(doc);
    history = redoCommand(redoCommand(history));
    expect(history.present.objects[0]?.name).toBe('Dos');
  });

  it('los comandos del historial y sus deltas están congelados (I3)', () => {
    const doc = mixedDoc();
    const executed: Command[] = [];
    for (const { make } of factories) {
      // Historial independiente por comando (la tabla comparte el doc base).
      const history = executeCommand(createCommandHistory(doc), make(doc));
      expect(history.past.length).toBe(1);
      executed.push(...history.past);
    }
    expect(executed.length).toBe(factories.length);
    for (const command of executed) {
      expect(Object.isFrozen(command)).toBe(true);
    }

    // Los insumos nuevos que el comando introduce se congelan en la creación.
    const newSolid = { ...baseSolid, id: 'object-9' };
    expect(Object.isFrozen(newSolid)).toBe(false);
    createAddObjectCommand(doc, newSolid);
    expect(Object.isFrozen(newSolid)).toBe(true);

    const position: [number, number, number] = [7, 0, 0];
    createSetTransformCommand(doc, 'object-1', position);
    expect(Object.isFrozen(position)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integridad del SceneDocument v1 bajo los comandos
// ---------------------------------------------------------------------------

describe('integridad del documento v1', () => {
  it('ningún comando altera documentVersion, la rejilla, el origen ni los materiales', () => {
    for (const { make } of factories) {
      const doc = mixedDoc();
      const next = executeCommand(createCommandHistory(doc), make(doc));
      expect(next.present.documentVersion).toBe(1);
      expect(next.present.id).toBe(doc.id);
      expect(next.present.name).toBe(doc.name);
      expect(next.present.gridStepMm).toBe(doc.gridStepMm);
      expect(next.present.originMm).toEqual(doc.originMm);
      expect(next.present.materials).toEqual(doc.materials);
      // Toda referencia de material sigue resolviendo (invariante I6).
      const materialIds = new Set(
        next.present.materials.map((material) => material.id),
      );
      for (const object of next.present.objects) {
        expect(materialIds.has(object.materialId)).toBe(true);
      }
    }
  });

  it('los objetos no objetivo conservan id y contenido exactos', () => {
    for (const { kind, make } of factories) {
      const doc = mixedDoc();
      const touched =
        kind === 'add-object'
          ? null
          : kind === 'set-params'
            ? 'component-1'
            : 'object-1';
      const next = executeCommand(createCommandHistory(doc), make(doc));
      for (const original of doc.objects) {
        if (original.id === touched) continue;
        const counterpart = next.present.objects.find(
          (candidate) => candidate.id === original.id,
        );
        expect(counterpart, `${kind}: conserva ${original.id}`).toEqual(
          original,
        );
      }
      // Ningún id ajeno aparece o desaparece (salvo el explícito de add).
      const ids = new Set(next.present.objects.map((object) => object.id));
      for (const original of doc.objects) {
        if (original.id === 'object-1' && kind === 'remove-object') continue;
        expect(ids.has(original.id), `${kind}: id ${original.id}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Fallos de undo/redo: conservan exactamente el estado anterior
// ---------------------------------------------------------------------------

describe('undo/redo fallidos', () => {
  const failingCommand: Command = {
    id: 'cmd:test:fallo',
    kind: 'rename',
    label: 'Comando que falla',
    apply() {
      throw new SceneError(
        'ERR_SCENE_COMMAND_CONFLICT',
        'fallo intencional de apply',
      );
    },
    revert() {
      throw new SceneError(
        'ERR_SCENE_COMMAND_CONFLICT',
        'fallo intencional de revert',
      );
    },
  };

  it('un undo fallido lanza y conserva exactamente el estado anterior', () => {
    const doc = mixedDoc();
    const applied = executeCommand(
      createCommandHistory(doc),
      createRenameCommand(doc, 'object-1', 'Mesa'),
    );
    // Historial manipulado con un comando hostil al final de past.
    const tampered = {
      ...applied,
      past: [...applied.past, failingCommand],
    };

    expectSceneError(() => undoCommand(tampered), 'ERR_SCENE_COMMAND_CONFLICT');
    // El estado anterior queda intacto, campo a campo.
    expect(tampered.past.length).toBe(applied.past.length + 1);
    expect(tampered.present).toEqual(applied.present);
    expect(tampered.future).toEqual(applied.future);
    expect(canUndo(tampered)).toBe(true);
  });

  it('un redo fallido lanza y conserva exactamente el estado anterior', () => {
    const doc = mixedDoc();
    const history = createCommandHistory(doc);
    const withHostileFuture = { ...history, future: [failingCommand] };

    expectSceneError(
      () => redoCommand(withHostileFuture),
      'ERR_SCENE_COMMAND_CONFLICT',
    );
    expect(withHostileFuture.present).toEqual(doc);
    expect(withHostileFuture.past).toEqual([]);
    expect(withHostileFuture.future).toEqual([failingCommand]);
    expect(canRedo(withHostileFuture)).toBe(true);
  });

  it('un comando fallido durante execute deja el historial bit a bit intacto', () => {
    const doc = mixedDoc();
    const history = executeCommand(
      createCommandHistory(doc),
      createRenameCommand(doc, 'object-1', 'Mesa'),
    );
    const snapshot = { ...history, past: [...history.past], future: [...history.future] };

    expectSceneError(
      () => executeCommand(history, failingCommand),
      'ERR_SCENE_COMMAND_CONFLICT',
    );
    expect(history).toEqual(snapshot);
    expect(history.past).toEqual(snapshot.past);
    expect(history.present).toEqual(snapshot.present);
  });
});
