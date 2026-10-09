import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  commitEditorHistory,
  createEditorHistory,
  EDITOR_HISTORY_LIMIT,
  redoEditorHistory,
  undoEditorHistory,
} from '../src/lib/studio/history.js';
import {
  DEFAULT_CONFIG,
  equalizeModuleWidths,
  setDimension,
  setModuleCount,
  setModuleWidth,
} from '../src/lib/config.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const CONFIG_A = DEFAULT_CONFIG;
const CONFIG_B = setDimension(DEFAULT_CONFIG, 'widthMm', 2800);
const CONFIG_C = setModuleCount(DEFAULT_CONFIG, 4);

describe('createEditorHistory', () => {
  it('inicia con el estado presente y sin pasos', () => {
    const history = createEditorHistory(CONFIG_A);
    expect(history.present).toBe(CONFIG_A);
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([]);
    expect(history.limit).toBe(EDITOR_HISTORY_LIMIT);
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('acepta un límite personalizado (para pruebas)', () => {
    const history = createEditorHistory(CONFIG_A, 3);
    expect(history.limit).toBe(3);
  });
});

describe('commitEditorHistory', () => {
  it('registra el paso: el estado anterior pasa a `past`', () => {
    const history = createEditorHistory(CONFIG_A);
    const committed = commitEditorHistory(history, CONFIG_B);
    expect(committed.present).toBe(CONFIG_B);
    expect(committed.past).toEqual([CONFIG_A]);
    expect(committed.future).toEqual([]);
    expect(canUndo(committed)).toBe(true);
    expect(canRedo(committed)).toBe(false);
  });

  it('no muta el historial de entrada', () => {
    const history = deepFreeze(createEditorHistory(CONFIG_A));
    const committed = commitEditorHistory(history, CONFIG_B);
    expect(committed).not.toBe(history);
    expect(history.past).toEqual([]);
    expect(history.present).toBe(CONFIG_A);
  });

  it('descarta los estados futuros al editar desde un estado intermedio', () => {
    let history = commitEditorHistory(createEditorHistory(CONFIG_A), CONFIG_B);
    history = undoEditorHistory(history);
    expect(history.future).toEqual([CONFIG_B]);
    history = commitEditorHistory(history, CONFIG_C);
    expect(history.present).toBe(CONFIG_C);
    expect(history.future).toEqual([]);
    expect(canRedo(history)).toBe(false);
  });

  it('ignora ediciones sin efecto real (misma configuración)', () => {
    const history = createEditorHistory(CONFIG_A);
    const same = { ...CONFIG_A };
    const committed = commitEditorHistory(history, same);
    expect(committed).toBe(history);
    expect(canUndo(committed)).toBe(false);
  });

  it('acota el historial al límite configurado', () => {
    let history = createEditorHistory(CONFIG_A, 2);
    history = commitEditorHistory(history, CONFIG_B);
    history = commitEditorHistory(history, CONFIG_C);
    const fourth = setDimension(CONFIG_A, 'depthMm', 650);
    history = commitEditorHistory(history, fourth);
    // Límite 2: solo los dos pasos más recientes quedan en `past`.
    expect(history.past).toHaveLength(2);
    expect(history.past[1]).toBe(CONFIG_C);
    expect(history.present).toBe(fourth);
  });

  it('respeta el límite por defecto (50 pasos)', () => {
    expect(EDITOR_HISTORY_LIMIT).toBe(50);
  });
});

describe('undoEditorHistory / redoEditorHistory', () => {
  it('deshace y rehace un solo paso', () => {
    const history = commitEditorHistory(createEditorHistory(CONFIG_A), CONFIG_B);
    const undone = undoEditorHistory(history);
    expect(undone.present).toBe(CONFIG_A);
    expect(undone.future).toEqual([CONFIG_B]);
    expect(canRedo(undone)).toBe(true);

    const redone = redoEditorHistory(undone);
    expect(redone.present).toBe(CONFIG_B);
    expect(redone.past).toEqual([CONFIG_A]);
    expect(redone.future).toEqual([]);
  });

  it('deshace y rehace varios pasos en orden', () => {
    let history = createEditorHistory(CONFIG_A);
    history = commitEditorHistory(history, CONFIG_B);
    history = commitEditorHistory(history, CONFIG_C);
    history = undoEditorHistory(history);
    history = undoEditorHistory(history);
    expect(history.present).toBe(CONFIG_A);
    history = redoEditorHistory(history);
    history = redoEditorHistory(history);
    expect(history.present).toBe(CONFIG_C);
    expect(history.past).toEqual([CONFIG_A, CONFIG_B]);
  });

  it('sin pasado, deshacer no hace nada', () => {
    const history = createEditorHistory(CONFIG_A);
    expect(undoEditorHistory(history)).toBe(history);
  });

  it('sin futuro, rehacer no hace nada', () => {
    const history = createEditorHistory(CONFIG_A);
    expect(redoEditorHistory(history)).toBe(history);
  });

  it('no muta el historial de entrada', () => {
    const history = deepFreeze(
      commitEditorHistory(createEditorHistory(CONFIG_A), CONFIG_B),
    );
    undoEditorHistory(history);
    redoEditorHistory(history);
    expect(history.present).toBe(CONFIG_B);
    expect(history.past).toEqual([CONFIG_A]);
  });
});

describe('reinicio al cambiar de proyecto', () => {
  it('crear un historial nuevo descarta todo el historial anterior', () => {
    let history = createEditorHistory(CONFIG_A);
    history = commitEditorHistory(history, CONFIG_B);
    history = commitEditorHistory(history, CONFIG_C);
    // Equivalente a abrir/nuevo proyecto: historial propio y limpio.
    const restarted = createEditorHistory(CONFIG_A);
    expect(restarted.present).toBe(CONFIG_A);
    expect(restarted.past).toEqual([]);
    expect(restarted.future).toEqual([]);
    expect(canUndo(restarted)).toBe(false);
    expect(canRedo(restarted)).toBe(false);
  });
});

describe('distribuciones de ancho en el historial (Fase 3D)', () => {
  it('deshacer y rehacer conservan los anchos individuales', () => {
    const fixed = setModuleWidth(DEFAULT_CONFIG, 0, 900);
    const equalized = equalizeModuleWidths(fixed);
    let history = createEditorHistory(DEFAULT_CONFIG);
    history = commitEditorHistory(history, fixed);
    history = commitEditorHistory(history, equalized);

    history = undoEditorHistory(history);
    expect(history.present.modules[0]?.widthMm).toBe(900);
    history = undoEditorHistory(history);
    expect(history.present).toBe(DEFAULT_CONFIG);
    history = redoEditorHistory(history);
    history = redoEditorHistory(history);
    expect(history.present).toBe(equalized);
  });

  it('el restablecer uniforme es un paso reversible', () => {
    const fixed = setModuleWidth(DEFAULT_CONFIG, 2, 500);
    let history = createEditorHistory(fixed);
    history = commitEditorHistory(history, equalizeModuleWidths(fixed));
    expect(
      history.present.modules.some((module) => module.widthMm !== undefined),
    ).toBe(false);
    history = undoEditorHistory(history);
    expect(history.present.modules[2]?.widthMm).toBe(500);
  });
});
