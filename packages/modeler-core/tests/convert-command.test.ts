/**
 * FASE-4B-D — conversión de sólido libre a componente paramétrico (D3):
 * equivalencia demostrable, conservación exacta, undo/redo y rechazo
 * explícito de conversiones no demostrables.
 */

import { describe, expect, it } from 'vitest';

import {
  canRedo,
  canUndo,
  createCommandHistory,
  executeCommand,
  redoCommand,
  undoCommand,
  type CommandHistory,
} from '../src/command.js';
import {
  createConvertToComponentCommand,
  createRenameCommand,
} from '../src/commands.js';
import { SceneError } from '../src/errors.js';
import { parseSceneEnvelope, serializeScene } from '../src/serialize.js';
import { validateSceneDocument } from '../src/validate.js';
import type { SceneDocument } from '../src/types/document.js';
import {
  asDocument,
  baseComponent,
  baseSolid,
  fullComponentRegistry,
  solidDocumentInput,
} from './fixtures.js';

function doc(input: Record<string, unknown>): SceneDocument {
  const result = validateSceneDocument(input);
  if (!result.ok) {
    throw new Error(`Fixture inválido: ${result.errors[0]?.message ?? ''}`);
  }
  return result.document;
}

function solidDoc(solid: Record<string, unknown>): SceneDocument {
  return doc({ ...solidDocumentInput(), objects: [solid] });
}

function expectSceneError(fn: () => unknown, code: string): SceneError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SceneError);
    expect((error as SceneError).code).toBe(code);
    return error as SceneError;
  }
  throw new Error(`Se esperaba un SceneError con código ${code}.`);
}

const plateParams = { widthMm: 1200, heightMm: 600, thicknessMm: 18 };

describe('createConvertToComponentCommand (D3): conversión demostrable', () => {
  it('convierte un rectángulo axial y conserva id, nombre, transformación y material', () => {
    const initial = solidDoc({ ...baseSolid });
    const command = createConvertToComponentCommand(
      initial,
      'object-1',
      'furniconfig.plate',
      1,
      plateParams,
      fullComponentRegistry,
    );

    const converted = command.apply(initial);
    const object = converted.objects[0];
    expect(object).toMatchObject({
      id: 'object-1', // id original COMPLETO conservado (decisión 4B-D)
      kind: 'component',
      name: 'Placa',
      type: 'furniconfig.plate',
      version: 1,
      transform: { positionMm: [0, 0, 0] },
      materialId: 'material-1',
      params: plateParams,
    });
    // el documento original queda intacto (I3)
    expect(initial.objects[0]?.kind).toBe('solid');
    expect(Object.isFrozen(initial)).toBe(true);
  });

  it('conservar el id original valida en el documento (sin prefijo impuesto)', () => {
    const initial = solidDoc({ ...baseSolid });
    const history = createCommandHistory(initial);
    const command = createConvertToComponentCommand(
      history.present,
      'object-1',
      'furniconfig.plate',
      1,
      plateParams,
      fullComponentRegistry,
    );
    const after = executeCommand(history, command, {
      components: fullComponentRegistry,
    });
    expect(after.present.objects[0]?.id).toBe('object-1');
  });

  it('conserva la transformación con traslación no nula (partes locales)', () => {
    const shifted = solidDoc({
      ...baseSolid,
      transform: { positionMm: [50, 10, 5] },
    });
    const command = createConvertToComponentCommand(
      shifted,
      'object-1',
      'furniconfig.plate',
      1,
      plateParams,
      fullComponentRegistry,
    );
    const converted = command.apply(shifted);
    expect(converted.objects[0]).toMatchObject({
      kind: 'component',
      transform: { positionMm: [50, 10, 5] },
    });
  });

  it('undo restaura exactamente el SolidObject anterior y redo reproduce la conversión', () => {
    const initial = solidDoc({ ...baseSolid });
    let history: CommandHistory = createCommandHistory(initial);
    const command = createConvertToComponentCommand(
      history.present,
      'object-1',
      'furniconfig.plate',
      1,
      plateParams,
      fullComponentRegistry,
    );
    history = executeCommand(history, command, { components: fullComponentRegistry });

    const convertedObject = history.present.objects[0];
    expect(convertedObject?.kind).toBe('component');

    history = undoCommand(history);
    expect(history.present).toEqual(initial);
    expect(history.present.objects[0]).toEqual(initial.objects[0]);
    expect(canRedo(history)).toBe(true);

    history = redoCommand(history);
    expect(history.present.objects[0]).toEqual(convertedObject);
    expect(canUndo(history)).toBe(true);
  });

  it('el id del comando es determinista por contenido', () => {
    const initial = solidDoc({ ...baseSolid });
    const a = createConvertToComponentCommand(
      initial, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
    );
    const b = createConvertToComponentCommand(
      initial, 'object-1', 'furniconfig.plate', 1, { ...plateParams }, fullComponentRegistry,
    );
    expect(a.id).toBe(b.id);
  });

  it('el documento convertido hace round-trip de SceneEnvelope sin pérdida', () => {
    const initial = solidDoc({ ...baseSolid });
    let history = createCommandHistory(initial);
    history = executeCommand(
      history,
      createConvertToComponentCommand(
        history.present, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
      ),
      { components: fullComponentRegistry },
    );
    const roundTrip = parseSceneEnvelope(
      serializeScene(history.present, { components: fullComponentRegistry }),
      { components: fullComponentRegistry },
    );
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) expect(roundTrip.document).toEqual(history.present);
  });

  it('los comandos posteriores conviven con el componente convertido', () => {
    const initial = solidDoc({ ...baseSolid });
    let history = createCommandHistory(initial);
    history = executeCommand(
      history,
      createConvertToComponentCommand(
        history.present, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
      ),
      { components: fullComponentRegistry },
    );
    history = executeCommand(
      history,
      createRenameCommand(history.present, 'object-1', 'Frontal'),
      { components: fullComponentRegistry },
    );
    expect(history.present.objects[0]).toMatchObject({ name: 'Frontal', kind: 'component' });
    history = undoCommand(history);
    expect(history.present.objects[0]).toMatchObject({ name: 'Placa', kind: 'component' });
  });
});

describe('createConvertToComponentCommand (D3): rechazos explícitos', () => {
  it('croquis no rectangular → CONVERSION_INCOMPATIBLE', () => {
    const triangle = solidDoc({
      ...baseSolid,
      geometry: {
        source: 'sketch',
        sketch: {
          plane: 'ground',
          planeOriginMm: [0, 0, 0],
          pointsMm: [
            [0, 0],
            [1200, 0],
            [600, 600],
          ],
          closed: true,
        },
        extrusionMm: 18,
      },
    });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          triangle, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
    );
  });

  it('plano distinto de ground → CONVERSION_INCOMPATIBLE (sin ambigüedad)', () => {
    const front = solidDoc({
      ...baseSolid,
      geometry: {
        source: 'sketch',
        sketch: {
          plane: 'front',
          planeOriginMm: [0, 0, 0],
          pointsMm: [
            [0, 0],
            [1200, 0],
            [1200, 600],
            [0, 600],
          ],
          closed: true,
        },
        extrusionMm: 18,
      },
    });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          front, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
    );
  });

  it('geometría de fuente kernel → CONVERSION_INCOMPATIBLE (no demostrable)', () => {
    const kernelSolid = solidDoc({
      ...baseSolid,
      geometry: { source: 'kernel', key: 'cache-1' },
    });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          kernelSolid, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
    );
  });

  it('definición multi-pieza → CONVERSION_INCOMPATIBLE (no es una caja única)', () => {
    const initial = solidDoc({ ...baseSolid });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          initial, 'object-1', 'furniconfig.unit', 1,
          { widthMm: 1200, rodDiameterMm: 30 }, fullComponentRegistry,
        ),
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
    );
  });

  it('tamaño distinto u origen de plano desplazado → CONVERSION_INCOMPATIBLE', () => {
    const initial = solidDoc({ ...baseSolid });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          initial, 'object-1', 'furniconfig.plate', 1,
          { widthMm: 800, heightMm: 600, thicknessMm: 18 }, fullComponentRegistry,
        ),
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
    );

    const offset = solidDoc({
      ...baseSolid,
      geometry: {
        source: 'sketch',
        sketch: {
          plane: 'ground',
          planeOriginMm: [10, 20, 0],
          pointsMm: [
            [0, 0],
            [1200, 0],
            [1200, 600],
            [0, 600],
          ],
          closed: true,
        },
        extrusionMm: 18,
      },
    });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          offset, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_CONVERSION_INCOMPATIBLE',
    );
  });

  it('tipo no registrado o versión distinta → UNKNOWN_COMPONENT', () => {
    const initial = solidDoc({ ...baseSolid });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          initial, 'object-1', 'no.registrado', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_UNKNOWN_COMPONENT',
    );
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          initial, 'object-1', 'furniconfig.plate', 9, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_UNKNOWN_COMPONENT',
    );
  });

  it('params fuera de rango → PARAMS_OUT_OF_RANGE', () => {
    const initial = solidDoc({ ...baseSolid });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          initial, 'object-1', 'furniconfig.plate', 1,
          { widthMm: 0, heightMm: 600, thicknessMm: 18 }, fullComponentRegistry,
        ),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
  });

  it('objetivo inexistente o no sólido → OBJECT_NOT_FOUND / INVALID_OBJECT', () => {
    const initial = solidDoc({ ...baseSolid });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          initial, 'object-404', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_OBJECT_NOT_FOUND',
    );
    const withComponent = doc({
      ...solidDocumentInput(),
      objects: [{ ...baseSolid }, { ...baseComponent }],
    });
    expectSceneError(
      () =>
        createConvertToComponentCommand(
          withComponent, 'component-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
        ),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });

  it('precondición incumplida en apply/revert → COMMAND_CONFLICT (historial intacto)', () => {
    const initial = solidDoc({ ...baseSolid });
    const command = createConvertToComponentCommand(
      initial, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
    );
    // otro comando cambia el objeto: el capturado ya no coincide
    const renamed = createRenameCommand(initial, 'object-1', 'Otra').apply(initial);
    expectSceneError(() => command.apply(renamed), 'ERR_SCENE_COMMAND_CONFLICT');

    const history = createCommandHistory(initial);
    const conflict = createRenameCommand(initial, 'object-1', 'X');
    // aplicar la conversión y luego intentar revertirla con otro estado
    let after = executeCommand(history, command, { components: fullComponentRegistry });
    after = executeCommand(after, conflict, { components: fullComponentRegistry });
    const stale = createConvertToComponentCommand(
      initial, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
    );
    expectSceneError(() => stale.revert(after.present), 'ERR_SCENE_COMMAND_CONFLICT');
  });

  it('validación sin registro también acepta el convertido (compatibilidad)', () => {
    const initial = solidDoc({ ...baseSolid });
    let history = createCommandHistory(initial);
    history = executeCommand(
      history,
      createConvertToComponentCommand(
        history.present, 'object-1', 'furniconfig.plate', 1, plateParams, fullComponentRegistry,
      ),
    );
    const plain = validateSceneDocument(history.present);
    expect(plain.ok).toBe(true);
    if (plain.ok) expect(plain.document).toEqual(history.present);
    expect(asDocument(history.present).objects[0]?.kind).toBe('component');
  });
});
