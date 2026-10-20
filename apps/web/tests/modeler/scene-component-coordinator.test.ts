/**
 * FASE-4C-D — coordinador con componentes paramétricos.
 *
 * Verifica los invariantes de la fase:
 *
 * - escena SOLO de clósets → piezas listas SIN invocar
 *   `ensureKernel` (el Worker no arranca para analíticas);
 * - `componentStates` y `states` (sólidos) son mapas SEPARADOS;
 * - derivación síncrona: el componente queda `ready` aunque el
 *   Worker esté en vuelo para los sólidos;
 * - cambios rápidos → las piezas corresponden SIEMPRE al último
 *   documento (sin ventana para geometría obsoleta; `droppedStale`
 *   sigue a 0 en la ruta de componentes);
 * - huella sin cambios → MISMA referencia de `parts` (la escena no
 *   recrea BufferGeometry);
 * - params inválidos → estado `error` honesto con mensaje del
 *   motor y `retry` que reintenta sin romper nada;
 * - eliminación → purga del estado; undo → restauración con piezas;
 * - `dispose` → estados liberados e ignorados posteriores.
 */

import { describe, expect, it } from 'vitest';
import type { AsyncGeometryKernel } from '@furniconfig/kernel-adapter';
import {
  createCommandHistory,
  createEmptySceneDocument,
  createRemoveObjectCommand,
  createSetParamsCommand,
  type ComponentPart,
  type SceneDocument,
  type SceneParams,
} from '@furniconfig/modeler-core';

import { setDimension, setDoorsEnabled, DEFAULT_CONFIG } from '../../src/lib/config.js';
import {
  DEFAULT_SCENE_MATERIAL,
  buildSolidAddCommand,
  buildWardrobeAddCommand,
} from '../../src/lib/modeler/document-actions.js';
import {
  WARDROBE_COMPONENT_TYPE,
  parseWardrobeParams,
} from '../../src/lib/modeler/components/wardrobe.js';
import { wardrobeSceneRegistry } from '../../src/lib/modeler/open-design.js';
import { rectangleSketchFromCorners } from '../../src/lib/modeler/drawing.js';
import {
  SceneGeometryCoordinator,
  type ComponentGeometryState,
  type SolidGeometryState,
} from '../../src/lib/modeler/scene-geometry-coordinator.js';
import {
  dispatchHistoryCommand,
  redoHistory,
  undoHistory,
} from '../../src/hooks/use-modeler-history.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function sceneWithMaterial(): SceneDocument {
  return {
    ...createEmptySceneDocument(),
    materials: [DEFAULT_SCENE_MATERIAL],
  };
}

function insertWardrobe(document: SceneDocument): SceneDocument {
  const next = dispatchHistoryCommand(
    createCommandHistory(document),
    buildWardrobeAddCommand(document),
  );
  if (next === null) throw new Error('la inserción del clóset falló');
  return next.present;
}

function withWidth(document: SceneDocument, widthMm: number): SceneDocument {
  const object = document.objects.find((entry) => entry.kind === 'component');
  if (object === undefined || object.kind !== 'component') {
    throw new Error('fixture sin componente');
  }
  const config = parseWardrobeParams(object.params);
  if (config === null) throw new Error('params ilegibles');
  const next = dispatchHistoryCommand(
    createCommandHistory(document),
    createSetParamsCommand(
      document,
      object.id,
      setDimension(config, 'widthMm', widthMm) as unknown as SceneParams,
    ),
  );
  if (next === null) throw new Error('la reescritura de params falló');
  return next.present;
}

interface Harness {
  readonly coordinator: SceneGeometryCoordinator;
  readonly ensureCalls: () => number;
  readonly changes: () => number;
  readonly solidStates: () => ReadonlyMap<string, SolidGeometryState>;
  readonly componentStates: () => ReadonlyMap<string, ComponentGeometryState>;
}

/**
 * Harness con registro de clóset y `ensureKernel` instrumentado.
 * Con `ensureDeferred` la creación del Worker queda EN VUEO
 * indefinidamente (nadie la resuelve: el sólido se queda `pending`).
 */
function createHarness(
  overrides: { ensureDeferred?: boolean } = {},
): Harness {
  let ensureCalls = 0;
  let changes = 0;
  let solids: ReadonlyMap<string, SolidGeometryState> = new Map();
  const coordinator = new SceneGeometryCoordinator({
    ensureKernel: () => {
      ensureCalls += 1;
      if (overrides.ensureDeferred === true) {
        return new Promise<AsyncGeometryKernel>(() => undefined);
      }
      return Promise.reject(new Error('ensureKernel no debe invocarse'));
    },
    components: wardrobeSceneRegistry,
    onChange: (next) => {
      solids = next;
      changes += 1;
    },
  });
  return {
    coordinator,
    ensureCalls: () => ensureCalls,
    changes: () => changes,
    solidStates: () => solids,
    componentStates: () => coordinator.componentStates,
  };
}

function stateOf(harness: Harness, objectId: string): ComponentGeometryState {
  const state = harness.componentStates().get(objectId);
  if (state === undefined) throw new Error(`estado de ${objectId} ausente`);
  return state;
}

/** Borde exterior máximo en X de unas piezas (mm, marco local). */
function maxRightMm(parts: readonly ComponentPart[]): number {
  let max = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    if (part.kind !== 'box') continue;
    max = Math.max(max, part.positionMm[0] + part.sizeMm[0]);
  }
  return max;
}

// ---------------------------------------------------------------------------
// Pruebas
// ---------------------------------------------------------------------------

describe('SceneGeometryCoordinator — componentes (4C-D)', () => {
  it('escena SOLO de clósets: piezas listas y ensureKernel JAMÁS invocado', () => {
    const harness = createHarness();
    harness.coordinator.setDocument(insertWardrobe(sceneWithMaterial()));

    const state = stateOf(harness, 'component-1');
    expect(state.status).toBe('ready');
    expect(state.parts?.length ?? 0).toBeGreaterThan(5);
    expect(state.appliedFingerprint).toBe(state.fingerprint);
    expect(state.errorMessage).toBeNull();

    expect(harness.ensureCalls()).toBe(0);
    expect(harness.coordinator.stats.service).toBeNull();
    expect(harness.solidStates().size).toBe(0);
  });

  it('clóset + sólido: mapas SEPARADOS y componente listo con el Worker en vuelo', () => {
    const harness = createHarness({ ensureDeferred: true });
    let document = insertWardrobe(sceneWithMaterial());
    const sketch = rectangleSketchFromCorners([0, 0], [800, 600]);
    expect(sketch).not.toBeNull();
    const withSolid = dispatchHistoryCommand(
      createCommandHistory(document),
      buildSolidAddCommand(document, sketch!, 100),
    );
    expect(withSolid).not.toBeNull();
    document = withSolid?.present ?? document;

    harness.coordinator.setDocument(document);

    // El sólido dispara el arranque perezoso (invariante 4C-B).
    expect(harness.ensureCalls()).toBe(1);
    expect(harness.solidStates().get('solid-1')?.status).toBe('pending');
    // El componente se deriva SIN esperar al kernel y en SU mapa.
    expect(stateOf(harness, 'component-1').status).toBe('ready');
    expect(harness.componentStates().has('solid-1')).toBe(false);
    expect(harness.solidStates().has('component-1')).toBe(false);
  });

  it('cambios rápidos: las piezas corresponden al ÚLTIMO documento', () => {
    const harness = createHarness();
    const base = insertWardrobe(sceneWithMaterial());
    harness.coordinator.setDocument(base);
    expect(maxRightMm(stateOf(harness, 'component-1').parts ?? [])).toBe(2400);

    const narrow = withWidth(base, 1500);
    harness.coordinator.setDocument(narrow);
    expect(maxRightMm(stateOf(harness, 'component-1').parts ?? [])).toBe(1500);

    const wider = withWidth(narrow, 1600);
    harness.coordinator.setDocument(wider);
    expect(maxRightMm(stateOf(harness, 'component-1').parts ?? [])).toBe(1600);

    expect(stateOf(harness, 'component-1').appliedFingerprint).toBe(
      stateOf(harness, 'component-1').fingerprint,
    );
    // Derivación síncrona: no existe ventana de resultados obsoletos.
    expect(harness.coordinator.stats.droppedStale).toBe(0);
  });

  it('huella sin cambios → MISMA referencia de `parts` (sin recrear geometría)', () => {
    const harness = createHarness();
    const document = insertWardrobe(sceneWithMaterial());
    harness.coordinator.setDocument(document);
    const parts = stateOf(harness, 'component-1').parts;
    expect(parts).toBeDefined();

    harness.coordinator.setDocument(document);
    expect(stateOf(harness, 'component-1').parts).toBe(parts);

    // Otro documento con la MISMA geometría (mismo nombre distinto →
    // la huella solo mira params/transform/tipo): también preserva.
    const renamed: SceneDocument = {
      ...document,
      objects: document.objects.map((object) =>
        object.kind === 'component' ? { ...object, name: 'Otro nombre' } : object,
      ),
    };
    harness.coordinator.setDocument(renamed);
    expect(stateOf(harness, 'component-1').parts).toBe(parts);
  });

  it('params inválidos → error honesto con el mensaje del motor y retry', () => {
    const harness = createHarness();
    const broken: SceneDocument = {
      ...sceneWithMaterial(),
      objects: [
        {
          kind: 'component',
          id: 'component-1',
          name: 'Clóset roto',
          type: WARDROBE_COMPONENT_TYPE,
          version: 1,
          transform: { positionMm: [0, 0, 0] },
          materialId: DEFAULT_SCENE_MATERIAL.id,
          params: { dimensions: { widthMm: 10 } } as unknown as SceneParams,
        },
      ],
    };
    harness.coordinator.setDocument(broken);

    const state = stateOf(harness, 'component-1');
    expect(state.status).toBe('error');
    expect(state.errorMessage).toContain('rechazados');
    expect(state.parts).toBeNull();

    const revisionBefore = state.revision;
    harness.coordinator.retry();
    const retried = stateOf(harness, 'component-1');
    expect(retried.status).toBe('error'); // el problema sigue ahí (honesto)
    expect(retried.revision).toBeGreaterThan(revisionBefore);

    // Un documento ya válido recupera `ready` (sin tocar el Worker).
    harness.coordinator.setDocument(insertWardrobe(sceneWithMaterial()));
    expect(stateOf(harness, 'component-1').status).toBe('ready');
  });

  it('eliminación purga el estado; undo restaura con piezas', () => {
    const harness = createHarness();
    let history = dispatchHistoryCommand(
      createCommandHistory(sceneWithMaterial()),
      buildWardrobeAddCommand(sceneWithMaterial()),
    );
    expect(history).not.toBeNull();
    harness.coordinator.setDocument(history?.present ?? sceneWithMaterial());
    expect(harness.componentStates().has('component-1')).toBe(true);

    const removed = dispatchHistoryCommand(
      history ?? createCommandHistory(sceneWithMaterial()),
      createRemoveObjectCommand(
        history?.present ?? sceneWithMaterial(),
        'component-1',
      ),
    );
    expect(removed).not.toBeNull();
    harness.coordinator.setDocument(removed?.present ?? sceneWithMaterial());
    expect(harness.componentStates().has('component-1')).toBe(false);

    const restored = undoHistory(removed ?? createCommandHistory(sceneWithMaterial()));
    expect(restored).not.toBeNull();
    harness.coordinator.setDocument(restored?.present ?? sceneWithMaterial());
    const state = stateOf(harness, 'component-1');
    expect(state.status).toBe('ready');
    expect(state.parts?.length ?? 0).toBeGreaterThan(0);
    expect(harness.ensureCalls()).toBe(0);
  });

  it('metadatos del motor conservados tras insertar → editar → undo → redo → eliminar/restaurar', () => {
    const harness = createHarness();
    // Puertas activas para que el documento lleve TODAS las familias
    // de metadatos: hingeSide/leafIndex/leafCount (hojas),
    // doorId (tiradores) y assemblyId/assemblyIndex (cajones).
    const doorsConfig = setDoorsEnabled(DEFAULT_CONFIG, true);

    // 1. Insertar.
    let history = dispatchHistoryCommand(
      createCommandHistory(sceneWithMaterial()),
      buildWardrobeAddCommand(sceneWithMaterial(), doorsConfig),
    );
    if (history === null) throw new Error('la inserción falló');
    harness.coordinator.setDocument(history.present);
    const insertedParts = stateOf(harness, 'component-1').parts ?? [];
    expect(insertedParts.length).toBeGreaterThan(0);
    expect(harness.ensureCalls()).toBe(0);

    // Presencia de las cuatro familias de metadatos (nada inventado:
    // todos vienen del namespace y los ids del motor).
    const doors = insertedParts.filter((part) => part.role === 'door');
    expect(doors.length).toBeGreaterThan(0);
    for (const door of doors) {
      if (door.kind !== 'box') throw new Error('la hoja no es caja');
      expect(door.hingeSide === 'left' || door.hingeSide === 'right').toBe(true);
      expect(door.leafIndex).toBeGreaterThanOrEqual(1);
      expect(door.leafCount === 1 || door.leafCount === 2).toBe(true);
      expect(door.materialId).toBeDefined();
      expect(door.moduleId).toBeDefined();
    }
    const handles = insertedParts.filter(
      (part) => part.role === 'door-handle',
    );
    expect(handles.length).toBeGreaterThan(0);
    // Los ids locales del motor se conservan VERBATIM (sin namespace
    // y sin inventar): el tirador referencia la hoja dueña real.
    const doorLocalIds = new Set(
      doors.map((door) => door.partId.slice('component-1::'.length)),
    );
    for (const handle of handles) {
      if (handle.kind !== 'cylinder') throw new Error('el tirador no es cilindro');
      expect(doorLocalIds.has(handle.doorId ?? '')).toBe(true);
      expect(handle.materialId).toBeDefined();
      expect(handle.moduleId).toBeDefined();
    }
    const drawers = insertedParts.filter(
      (part): part is Extract<ComponentPart, { readonly kind: 'box' }> =>
        part.kind === 'box' && part.assemblyId !== undefined,
    );
    expect(drawers.length).toBeGreaterThan(0);
    for (const panel of drawers) {
      expect(panel.assemblyId?.startsWith('drawer-')).toBe(true);
      expect(panel.assemblyIndex).toBeGreaterThanOrEqual(1);
      expect(panel.materialId).toBeDefined();
      expect(panel.moduleId).toBeDefined();
    }
    expect(
      insertedParts.every((part) => part.materialId !== undefined),
    ).toBe(true);

    // 2. Editar el ancho (params nuevos → piezas nuevas, mismas familias).
    const object = history.present.objects.find(
      (entry) => entry.id === 'component-1',
    );
    if (object === undefined || object.kind !== 'component') {
      throw new Error('componente ausente en el documento');
    }
    const config = parseWardrobeParams(object.params);
    if (config === null) throw new Error('params ilegibles');
    const edited = dispatchHistoryCommand(
      history,
      createSetParamsCommand(
        history.present,
        'component-1',
        setDimension(config, 'widthMm', 1500) as unknown as SceneParams,
      ),
    );
    if (edited === null) throw new Error('la edición falló');
    history = edited;
    harness.coordinator.setDocument(history.present);
    const editedParts = stateOf(harness, 'component-1').parts ?? [];
    expect(editedParts.length).toBeGreaterThan(0);
    expect(maxRightMm(editedParts)).toBe(1500);
    expect(editedParts).not.toEqual(insertedParts);
    expect(editedParts.filter((part) => part.role === 'door').length).toBe(
      doors.length,
    );
    expect(
      editedParts.filter(
        (part) => part.kind === 'box' && part.assemblyId !== undefined,
      ).length,
    ).toBe(drawers.length);

    // 3. Undo → params exactos de la inserción → piezas y metadatos
    // IDENTIDADES (deep-equal con el motor determinista).
    const undone = undoHistory(history);
    if (undone === null) throw new Error('undo falló');
    harness.coordinator.setDocument(undone.present);
    expect(stateOf(harness, 'component-1').parts).toEqual(insertedParts);

    // 4. Redo → vuelta exacta a las piezas editadas.
    const redone = redoHistory(undone);
    if (redone === null) throw new Error('redo falló');
    history = redone;
    harness.coordinator.setDocument(history.present);
    expect(stateOf(harness, 'component-1').parts).toEqual(editedParts);

    // 5. Eliminar → purga; Undo de la eliminación → restauración con
    // los MISMOS metadatos (estado y piezas).
    const removed = dispatchHistoryCommand(
      history,
      createRemoveObjectCommand(history.present, 'component-1'),
    );
    if (removed === null) throw new Error('la eliminación falló');
    harness.coordinator.setDocument(removed.present);
    expect(harness.componentStates().has('component-1')).toBe(false);
    const restored = undoHistory(removed);
    if (restored === null) throw new Error('undo de la eliminación falló');
    harness.coordinator.setDocument(restored.present);
    const restoredState = stateOf(harness, 'component-1');
    expect(restoredState.status).toBe('ready');
    expect(restoredState.parts).toEqual(editedParts);

    // Ni un paso del ciclo arrancó el Worker.
    expect(harness.ensureCalls()).toBe(0);
  });

  it('dispose limpia los estados de componentes e ignora usos posteriores', () => {
    const harness = createHarness();
    harness.coordinator.setDocument(insertWardrobe(sceneWithMaterial()));
    expect(harness.componentStates().size).toBe(1);

    harness.coordinator.dispose();
    expect(harness.componentStates().size).toBe(0);

    harness.coordinator.setDocument(insertWardrobe(sceneWithMaterial()));
    expect(harness.componentStates().size).toBe(0);
    expect(harness.ensureCalls()).toBe(0);
  });

  it('notificación: cada derivación de componente dispara onChange (UI al día)', () => {
    const harness = createHarness();
    const before = harness.changes();
    harness.coordinator.setDocument(insertWardrobe(sceneWithMaterial()));
    expect(harness.changes()).toBeGreaterThan(before);

    // La inclusión del mismo documento sin cambios NO re-notifica.
    const document = insertWardrobe(sceneWithMaterial());
    harness.coordinator.setDocument(document);
    const settled = harness.changes();
    harness.coordinator.setDocument(document);
    expect(harness.changes()).toBe(settled);
  });
});
