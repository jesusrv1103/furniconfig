/**
 * FASE-4C-C, C1/C2 — semántica del historial visual del modelador.
 *
 * Prueba las funciones PURAS del hook (`use-modeler-history.ts`)
 * sobre el `CommandHistory` existente de `@furniconfig/modeler-core`
 * (el entorno de tests unitarios no tiene DOM ni renderizador React,
 * así que el wrapper de React —`useState`— se cubre en las pruebas
 * visuales de Chromium). Cubre los criterios §7:
 *
 * 1. crear → undo → redo;
 * 2. modificar ancho → undo → redo (dimensiones exactas);
 * 3. cambiar extrusión → undo → redo;
 * 4. renombrar → undo → nombre anterior;
 * 5. eliminar → undo → restauración (objeto idéntico);
 * 6. comando nuevo tras undo → futuro descartado;
 * 7. no-op → historial intacto (y no toca el futuro);
 * 8. 101 operaciones → límite PROVISIONAL de 100 respetado;
 * 9. Enter seguido de blur → un solo comando (deduplicación por
 *    no-op) y conflictos (precondición obsoleta) → historial intacto;
 * 11. selección coherente al eliminar/restaurar;
 * 12. historial del modelador INDEPENDIENTE (otra instancia, otro
 *    módulo: el configurador usa `use-editor-history`).
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMAND_HISTORY_LIMIT,
  createCommandHistory,
  createEmptySceneDocument,
  createRemoveObjectCommand,
  createRenameCommand,
  createSetExtrusionCommand,
  createSetSketchCommand,
  canRedo,
  canUndo,
  resolveObjectSelection,
  sketchDimensionMm,
  validateSceneDocument,
  type CommandHistory,
  type SceneDocument,
} from '@furniconfig/modeler-core';

import {
  dispatchHistoryCommand,
  historyLabels,
  redoHistory,
  resetHistory,
  undoHistory,
} from '../../src/hooks/use-modeler-history.js';
import {
  DEFAULT_SCENE_MATERIAL,
  buildSolidAddCommand,
} from '../../src/lib/modeler/document-actions.js';
import { rectangleSketchFromCorners } from '../../src/lib/modeler/drawing.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Semilla válida: vacío + material por defecto (como la pantalla). */
function seedDocument(): SceneDocument {
  const seed: SceneDocument = {
    ...createEmptySceneDocument(),
    materials: [DEFAULT_SCENE_MATERIAL],
    gridStepMm: 100,
  };
  validateSceneDocument(seed);
  return seed;
}

function sketch(widthMm: number, depthMm: number) {
  const value = rectangleSketchFromCorners([0, 0], [widthMm, depthMm]);
  if (value === null) throw new Error('croquis de fixture inválido');
  return value;
}

function startHistory(): CommandHistory {
  return createCommandHistory(seedDocument());
}

function must<T>(value: T | null): T {
  if (value === null) throw new Error('operación de historial no ejecutó');
  return value;
}

function addSolid(
  history: CommandHistory,
  widthMm = 1200,
  depthMm = 600,
  extrusionMm = 100,
): CommandHistory {
  return must(
    dispatchHistoryCommand(
      history,
      buildSolidAddCommand(history.present, sketch(widthMm, depthMm), extrusionMm),
    ),
  );
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

describe('use-modeler-history (C1 — integración con CommandHistory)', () => {
  it('§7.1 crear → undo → redo: mismo objeto y misma geometría', () => {
    const h0 = startHistory();
    expect(canUndo(h0)).toBe(false);
    expect(canRedo(h0)).toBe(false);
    expect(undoHistory(h0)).toBeNull(); // nada que deshacer → intacto
    expect(redoHistory(h0)).toBeNull(); // nada que rehacer → intacto

    const h1 = addSolid(h0);
    expect(h1.present.objects).toHaveLength(1);
    expect(h1.present.objects[0]?.id).toBe('solid-1');
    expect(canUndo(h1)).toBe(true);

    const h2 = must(undoHistory(h1));
    expect(h2.present.objects).toHaveLength(0);
    expect(canUndo(h2)).toBe(false);
    expect(canRedo(h2)).toBe(true);

    const h3 = must(redoHistory(h2));
    // Rehacer repite el objeto con la MISMA geometría (deep-equal).
    expect(h3.present.objects).toEqual(h1.present.objects);
    expect(canRedo(h3)).toBe(false);
  });

  it('labels: Deshacer/Rehacer anuncian qué harían', () => {
    const h1 = addSolid(startHistory());
    expect(historyLabels(h1).undoLabel).toBe('Añadir "Sólido 1"');
    expect(historyLabels(h1).redoLabel).toBeNull();
    const h2 = must(undoHistory(h1));
    expect(historyLabels(h2).undoLabel).toBeNull();
    expect(historyLabels(h2).redoLabel).toBe('Añadir "Sólido 1"');
  });

  it('§7.2 modificar ancho → undo → redo (valores exactos)', () => {
    const widthOf = (history: CommandHistory): number => {
      const object = history.present.objects[0];
      if (object === undefined || object.kind !== 'solid' || object.geometry.source !== 'sketch') {
        throw new Error('objeto sin croquis');
      }
      return sketchDimensionMm(object.geometry.sketch, 'widthMm');
    };

    const h1 = addSolid(startHistory());
    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createSetSketchCommand(h1.present, 'solid-1', sketch(900, 600)),
      ),
    );
    expect(widthOf(h2)).toBe(900);
    expect(widthOf(must(undoHistory(h2)))).toBe(1200);
    expect(widthOf(must(redoHistory(must(undoHistory(h2)))))).toBe(900);
  });

  it('§7.3 cambiar extrusión → undo → redo', () => {
    const h1 = addSolid(startHistory());
    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createSetExtrusionCommand(h1.present, 'solid-1', 250),
      ),
    );
    const extrusionOf = (history: CommandHistory): number => {
      const object = history.present.objects[0];
      if (object === undefined || object.kind !== 'solid' || object.geometry.source !== 'sketch') {
        throw new Error('objeto sin croquis');
      }
      return object.geometry.extrusionMm;
    };
    expect(extrusionOf(h2)).toBe(250);
    expect(extrusionOf(must(undoHistory(h2)))).toBe(100);
    expect(extrusionOf(must(redoHistory(must(undoHistory(h2)))))).toBe(250);
  });

  it('§7.4 renombrar → undo → nombre anterior → redo', () => {
    const h1 = addSolid(startHistory());
    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createRenameCommand(h1.present, 'solid-1', 'Estantería norte'),
      ),
    );
    expect(h2.present.objects[0]?.name).toBe('Estantería norte');
    expect(must(undoHistory(h2)).present.objects[0]?.name).toBe('Sólido 1');
    expect(
      must(redoHistory(must(undoHistory(h2)))).present.objects[0]?.name,
    ).toBe('Estantería norte');
  });

  it('§7.5 eliminar → undo → restauración idéntica → redo → fuera', () => {
    const h1 = addSolid(startHistory());
    const original = h1.present.objects[0];
    if (original === undefined) throw new Error('fixture sin objeto');

    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createRemoveObjectCommand(h1.present, 'solid-1'),
      ),
    );
    expect(h2.present.objects).toHaveLength(0);

    const h3 = must(undoHistory(h2));
    expect(h3.present.objects).toHaveLength(1);
    expect(h3.present.objects[0]).toEqual(original);

    const h4 = must(redoHistory(h3));
    expect(h4.present.objects).toHaveLength(0);
  });

  it('§7.6 comando nuevo tras undo → el futuro se descarta', () => {
    const h1 = addSolid(startHistory());
    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createSetSketchCommand(h1.present, 'solid-1', sketch(900, 600)),
      ),
    );
    const h3 = must(undoHistory(h2));
    expect(h3.future).toHaveLength(1); // queda lo deshecho

    const h4 = must(
      dispatchHistoryCommand(
        h3,
        createRenameCommand(h3.present, 'solid-1', 'Nuevo nombre'),
      ),
    );
    expect(h4.future).toHaveLength(0);
    expect(canRedo(h4)).toBe(false);
    expect(h4.past.length).toBe(h3.past.length + 1);
  });

  it('§7.7 no-op → historial intacto (misma referencia) y futuro intacto', () => {
    const h1 = addSolid(startHistory());
    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createSetSketchCommand(h1.present, 'solid-1', sketch(900, 600)),
      ),
    );
    expect(h2.past).toHaveLength(2);

    // Confirmar el MISMO valor (Enter seguido de blur, duplicado):
    const sameSketchCommand = createSetSketchCommand(
      h2.present,
      'solid-1',
      sketch(900, 600),
    );
    expect(dispatchHistoryCommand(h2, sameSketchCommand)).toBeNull();
    expect(h2.past).toHaveLength(2); // sin entrada nueva

    // Un no-op NO descarta el futuro disponible (§7.7 / C2).
    const h3 = must(undoHistory(h2)); // futuro = edición de ancho
    expect(h3.future).toHaveLength(1);
    const noopOnRestored = createSetSketchCommand(
      h3.present,
      'solid-1',
      sketch(1200, 600), // mismo que el vigente tras undo
    );
    expect(dispatchHistoryCommand(h3, noopOnRestored)).toBeNull();
    expect(h3.future).toHaveLength(1); // futuro preservado
  });

  it('§7.8 101 operaciones → límite PROVISIONAL de 100 respetado', () => {
    let history = addSolid(startHistory());
    for (let index = 1; index <= DEFAULT_COMMAND_HISTORY_LIMIT + 1; index += 1) {
      const next = dispatchHistoryCommand(
        history,
        createRenameCommand(history.present, 'solid-1', `Nombre ${index}`),
      );
      expect(next).not.toBeNull();
      history = next as CommandHistory;
    }
    expect(history.past).toHaveLength(DEFAULT_COMMAND_HISTORY_LIMIT);
    expect(canUndo(history)).toBe(true);
    // El documento conserva SIEMPRE los100 deshacibles: undo100 veces seguidas.
    let unwound = history;
    for (let index = 0; index < DEFAULT_COMMAND_HISTORY_LIMIT; index += 1) {
      unwound = must(undoHistory(unwound));
    }
    expect(canUndo(unwound)).toBe(false);
    expect(unwound.present.objects).toHaveLength(1); // el sólido creado al inicio sigue
  });

  it('§7.9 deduplicación: Enter + blur = UN solo comando; conflicto = intacto', () => {
    const h1 = addSolid(startHistory());
    // Comando creado ANTES de la edición (documento obsoleto) — como un
    // blur tardío que llega tras otro commit.
    const staleCommand = createSetSketchCommand(h1.present, 'solid-1', sketch(700, 600));

    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createSetSketchCommand(h1.present, 'solid-1', sketch(900, 600)),
      ),
    );
    expect(h2.past).toHaveLength(2);

    // El comando obsoleto (capturó el croquis antiguo) FALLA la
    // precondición → SceneError capturado → historial intacto.
    expect(dispatchHistoryCommand(h2, staleCommand)).toBeNull();
    expect(h2.past).toHaveLength(2);
    const object = h2.present.objects[0];
    if (object === undefined || object.kind !== 'solid' || object.geometry.source !== 'sketch') {
      throw new Error('objeto sin croquis');
    }
    expect(sketchDimensionMm(object.geometry.sketch, 'widthMm')).toBe(900);

    // Segundo commit con el MISMO valor (blur posterior a Enter):
    expect(
      dispatchHistoryCommand(
        h2,
        createSetSketchCommand(h2.present, 'solid-1', sketch(900, 600)),
      ),
    ).toBeNull();
    expect(h2.past).toHaveLength(2); // UNA sola entrada por edición
  });

  it('§7.11 selección: eliminar deselecciona y undo restaura con selección', () => {
    const h1 = addSolid(startHistory());
    const selected = resolveObjectSelection(h1.present, { objectId: 'solid-1' });
    expect(selected?.anchor).toBe('solid-1');

    const h2 = must(
      dispatchHistoryCommand(
        h1,
        createRemoveObjectCommand(h1.present, 'solid-1'),
      ),
    );
    // Sin referencias seleccionadas a objetos inexistentes:
    expect(resolveObjectSelection(h2.present, { objectId: 'solid-1' })).toBeNull();

    const h3 = must(undoHistory(h2));
    expect(resolveObjectSelection(h3.present, { objectId: 'solid-1' })?.anchor).toBe(
      'solid-1',
    );
  });

  it('§7.12 historiales independientes: operar en uno no toca al otro', () => {
    const historyA = addSolid(startHistory());
    const historyB = startHistory();

    expect(historyB.present.objects).toHaveLength(0);
    expect(canUndo(historyB)).toBe(false);
    expect(historyLabels(historyB).undoLabel).toBeNull();

    const undoneA = must(undoHistory(historyA));
    expect(undoneA.present.objects).toHaveLength(0);
    expect(historyA.present.objects).toHaveLength(1); // copia inmutable: A sigue
    expect(historyB.present.objects).toHaveLength(0); // B jamás se enteró
    expect(canUndo(historyB)).toBe(false);
  });

  it('semilla inválida → createCommandHistory lanza (valida antes de calcular)', () => {
    expect(() =>
      createCommandHistory({
        ...seedDocument(),
        gridStepMm: -1,
      }),
    ).toThrow();
  });

  it('audit-B: editar y renombrar un objeto NO modifica a los demás (dos sólidos)', () => {
    const h1 = addSolid(startHistory()); // solid-1 · 1200×600×100
    const h2 = addSolid(h1, 800, 500, 200); // solid-2 · 800×500×200
    const first = h2.present.objects[0];
    if (first === undefined) throw new Error('fixture sin solid-1');

    const h3 = must(
      dispatchHistoryCommand(
        h2,
        createSetSketchCommand(h2.present, 'solid-2', sketch(700, 400)),
      ),
    );
    const h4 = must(
      dispatchHistoryCommand(
        h3,
        createRenameCommand(h3.present, 'solid-2', 'Estantería'),
      ),
    );

    expect(h4.present.objects).toHaveLength(2);
    // solid-1 intacto: deep-equal bit a bit con su estado capturado
    // (los comandos solo sustituyen el objeto objetivo; el resto
    // puede no compartir referencia pero NUNCA cambia en contenido).
    expect(h4.present.objects[0]).toEqual(first);
    // El objetivo tiene exactamente sus cambios y conserva su extrusión.
    const edited = h4.present.objects[1];
    expect(edited?.name).toBe('Estantería');
    if (
      edited === undefined ||
      edited.kind !== 'solid' ||
      edited.geometry.source !== 'sketch'
    ) {
      throw new Error('solid-2 sin croquis');
    }
    expect(sketchDimensionMm(edited.geometry.sketch, 'widthMm')).toBe(700);
    expect(sketchDimensionMm(edited.geometry.sketch, 'depthMm')).toBe(400);
    expect(edited.geometry.extrusionMm).toBe(200);

    // El undo revierte solo a solid-2: solid-1 sigue igual bit a bit.
    const h5 = must(undoHistory(h4));
    expect(h5.present.objects[0]).toEqual(first);
    expect(h5.present.objects[1]?.name).toBe('Sólido 2');
  });
});

describe('resetHistory (WAVE-01 BLOQUE 3 — apertura de diseños)', () => {
  it('instala el documento con pilas VACÍAS (sin deshacer al previo)', () => {
    // Historial con una edición previa.
    const base = createCommandHistory(seedDocument());
    const withEdit = must(
      dispatchHistoryCommand(
        base,
        buildSolidAddCommand(base.present, sketch(800, 400), 100),
      ),
    );
    expect(withEdit.past).toHaveLength(1);

    // Apertura de otro diseño: historial nuevo, documento ajeno
    // (se instala con igualdad estructural; el clon interno conserva
    // exactamente su contenido — clave para la igualdad JSON al abrir).
    const opened = createEmptySceneDocument();
    const reset = resetHistory(opened);
    expect(reset.present).toEqual(opened);
    expect(reset.past).toHaveLength(0);
    expect(reset.future).toHaveLength(0);
    expect(canUndo(reset)).toBe(false);
    expect(canRedo(reset)).toBe(false);
  });

  it('el documento del reset queda intacto (sin alterar su contenido)', () => {
    const opened = createEmptySceneDocument();
    expect(resetHistory(opened).present).toEqual(opened);
  });
});
