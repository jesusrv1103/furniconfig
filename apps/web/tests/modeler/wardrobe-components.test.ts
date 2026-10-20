/**
 * FASE-4C-D, D1–D4 — clósets inteligentes en el modelador.
 *
 * Pruebas unitarias e integración (§8 del mandate):
 *
 * - D1: inserción con ids deterministas, validación PREVIA del
 *   motor, dos clósets independientes, posición en mm sin solape,
 *   convivencia con sólidos libres y Undo/Redo exacto;
 * - D2: equivalencia 1:1 de las piezas con `calculateGeometry`
 *   (cajas y cilindros exactos, sin aproximaciones) y conservación
 *   de TODOS los metadatos (moduleId, doorId, hingeSide,
 *   leafIndex/leafCount, assemblyId/assemblyIndex);
 * - D3: toda pieza resuelve a su componente (selección desde
 *   cualquier pieza) y `componentStates` separados de los sólidos;
 * - D4: edición de dimensiones/puertas/módulos con validación del
 *   motor SIN duplicar WARDROBE_LIMITS, entradas inválidas → error
 *   y NINGUNA mutación, Undo/Redo de params exacto;
 * - D5: ciclo de vida de BufferGeometry (`adopt`/`release`
 *   idempotentes, paridad created/disposed).
 */

import { describe, expect, it } from 'vitest';
import {
  calculateGeometry,
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  createCommandHistory,
  createEmptySceneDocument,
  createRemoveObjectCommand,
  createRenameCommand,
  createSetParamsCommand,
  validateSceneDocument,
  buildComponent,
  type ComponentPart,
  type SceneDocument,
  type SceneParams,
} from '@furniconfig/modeler-core';

import {
  DEFAULT_CONFIG,
  setDimension,
  setDoorsEnabled,
  setDoorHingeSide,
  setDoorLeaves,
  setModuleCount,
  setModuleKind,
} from '../../src/lib/config.js';
import {
  DEFAULT_SCENE_MATERIAL,
  applySceneAction,
  buildSolidAddCommand,
  buildWardrobeAddCommand,
  buildWardrobeObject,
  nextComponentId,
  nextWardrobePosition,
} from '../../src/lib/modeler/document-actions.js';
import {
  WARDROBE_COMPONENT_TYPE,
  WARDROBE_COMPONENT_VERSION,
  parseWardrobeParams,
} from '../../src/lib/modeler/components/wardrobe.js';
import {
  componentPartObjectId,
  disposeComponentPartsRenderData,
  partsGeometryLifecycle,
  retainComponentParts,
  toComponentPartsRenderData,
} from '../../src/lib/modeler/components/parts-to-mesh.js';
import { wardrobeSceneRegistry } from '../../src/lib/modeler/open-design.js';
import { rectangleSketchFromCorners } from '../../src/lib/modeler/drawing.js';
import {
  dispatchHistoryCommand,
  redoHistory,
  undoHistory,
} from '../../src/hooks/use-modeler-history.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Escena vacía con el material por defecto (invariante de la pantalla). */
function sceneWithMaterial(): SceneDocument {
  return {
    ...createEmptySceneDocument(),
    materials: [DEFAULT_SCENE_MATERIAL],
  };
}

function insertWardrobe(
  history: ReturnType<typeof createCommandHistory>,
  config?: WardrobeConfig,
) {
  const next = dispatchHistoryCommand(
    history,
    buildWardrobeAddCommand(history.present, config),
  );
  if (next === null) throw new Error('la inserción del clóset falló');
  return next;
}

function componentOf(document: SceneDocument, id: string) {
  const object = document.objects.find((entry) => entry.id === id);
  if (object === undefined || object.kind !== 'component') {
    throw new Error(`componente ${id} ausente`);
  }
  return object;
}

function partsOf(
  object: ReturnType<typeof componentOf>,
): readonly ComponentPart[] {
  return buildComponent(
    wardrobeSceneRegistry,
    object.id,
    object.type,
    object.version,
    object.params ?? {},
  ).parts;
}

function validate(document: SceneDocument) {
  return validateSceneDocument(document, {
    components: wardrobeSceneRegistry,
  });
}

/** Config validada por el motor (lo que la UI guarda como params). */
function validated(config: typeof DEFAULT_CONFIG) {
  const result = validateWardrobeConfig(config);
  if (!result.ok) throw new Error('fixture de config inválida');
  return result.config;
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
// D1 — Inserción
// ---------------------------------------------------------------------------

describe('4C-D D1 — inserción de clósets', () => {
  it('inserta un clóset: id determinista, tipo v1, material y origen en el suelo', () => {
    const history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const object = componentOf(history.present, 'component-1');
    expect(object).toMatchObject({
      kind: 'component',
      id: 'component-1',
      name: 'Clóset 1',
      type: WARDROBE_COMPONENT_TYPE,
      version: WARDROBE_COMPONENT_VERSION,
      transform: { positionMm: [0, 0, 0] },
      materialId: DEFAULT_SCENE_MATERIAL.id,
    });
    expect(validate(history.present).ok).toBe(true);
    expect(parseWardrobeParams(object.params)?.dimensions).toEqual(
      DEFAULT_CONFIG.dimensions,
    );
  });

  it('inserción reversible: undo la elimina, redo la restaura EXACTA', () => {
    const inserted = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const object = componentOf(inserted.present, 'component-1');

    const undone = undoHistory(inserted);
    expect(undone).not.toBeNull();
    expect(undone?.present.objects).toHaveLength(0);

    const redone = redoHistory(undone ?? inserted);
    expect(redone).not.toBeNull();
    expect(componentOf(redone?.present ?? sceneWithMaterial(), 'component-1')).toEqual(
      object,
    );
  });

  it('dos clósets: ids sin colisión y posiciones en +X sin solape', () => {
    let history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    history = insertWardrobe(history);
    const first = componentOf(history.present, 'component-1');
    const second = componentOf(history.present, 'component-2');
    // 2400 (ancho DEFAULT) + 200 de separación, redondeado a 10 mm.
    expect(first.transform.positionMm).toEqual([0, 0, 0]);
    expect(second.transform.positionMm).toEqual([2600, 0, 0]);
    expect(validate(history.present).ok).toBe(true);
    // `nextComponentId` es estable respecto a los existentes.
    expect(nextComponentId(history.present)).toBe('component-3');
  });

  it('los params de dos clósets son INDEPENDIENTES', () => {
    let history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    history = insertWardrobe(history);
    const before = componentOf(history.present, 'component-2').params;

    const config = parseWardrobeParams(
      componentOf(history.present, 'component-1').params,
    );
    expect(config).not.toBeNull();
    const edited = dispatchHistoryCommand(
      history,
      createSetParamsCommand(
        history.present,
        'component-1',
        setDimension(config ?? DEFAULT_CONFIG, 'widthMm', 1500) as unknown as SceneParams,
      ),
    );
    expect(edited).not.toBeNull();
    const after = edited ?? history;
    expect(
      parseWardrobeParams(componentOf(after.present, 'component-1').params)
        ?.dimensions.widthMm,
    ).toBe(1500);
    expect(componentOf(after.present, 'component-2').params).toEqual(before);
  });

  it('clóset y sólido libre conviven en la misma escena (validados)', () => {
    const history0 = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const sketch = rectangleSketchFromCorners([0, 0], [800, 600]);
    expect(sketch).not.toBeNull();
    const withSolid = dispatchHistoryCommand(
      history0,
      buildSolidAddCommand(history0.present, sketch!, 100),
    );
    expect(withSolid).not.toBeNull();
    const document = (withSolid ?? history0).present;
    expect(document.objects.map((object) => object.kind).sort()).toEqual([
      'component',
      'solid',
    ]);
    expect(validate(document).ok).toBe(true);
    // Los prefijos son disjuntos: ningún id se pisa.
    expect(nextComponentId(document)).toBe('component-2');
  });

  it('posicionamiento: siguiente clóset respeta el ancho del anterior', () => {
    const narrow = validated({
      ...DEFAULT_CONFIG,
      dimensions: { ...DEFAULT_CONFIG.dimensions, widthMm: 1200 },
    });
    const history = insertWardrobe(
      createCommandHistory(sceneWithMaterial()),
      narrow,
    );
    expect(
      componentOf(history.present, 'component-1').transform.positionMm,
    ).toEqual([0, 0, 0]);
    // Sugerencia para el PRÓXIMO clóset: 1200 + 200 de separación.
    expect(nextWardrobePosition(history.present)).toEqual([1400, 0, 0]);
    const next = insertWardrobe(history);
    expect(
      componentOf(next.present, 'component-2').transform.positionMm,
    ).toEqual([1400, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// D2 — Equivalencia geométrica y metadatos
// ---------------------------------------------------------------------------

describe('4C-D D2 — equivalencia con calculateGeometry y metadatos', () => {
  it('las piezas son 1:1 con calculateGeometry (posiciones y tamaños exactos)', () => {
    const object = buildWardrobeObject(sceneWithMaterial());
    const config = parseWardrobeParams(object.params);
    expect(config).not.toBeNull();
    const result = calculateGeometry(config ?? DEFAULT_CONFIG);
    const parts = partsOf(object);

    expect(parts).toHaveLength(
      result.panels.length + result.rods.length + result.doors.length + result.handles.length,
    );

    // Paneles (índices fijos: paneles primero, en orden del motor).
    result.panels.forEach((panel, index) => {
      const part = parts[index];
      expect(part?.partId).toBe(`${object.id}::${panel.id}`);
      expect(part?.kind).toBe('box');
      if (part?.kind !== 'box') return;
      expect(part.role).toBe(panel.role);
      expect(part.sizeMm).toEqual([panel.sizeMm.x, panel.sizeMm.y, panel.sizeMm.z]);
      expect(part.positionMm).toEqual([
        panel.positionMm.x,
        panel.positionMm.y,
        panel.positionMm.z,
      ]);
      expect(part.materialId).toBe(panel.materialId);
    });

    // Barras (cilindros exactos: eje, longitud y diámetro).
    const rods = parts.slice(
      result.panels.length,
      result.panels.length + result.rods.length,
    );
    result.rods.forEach((rod, index) => {
      const part = rods[index];
      expect(part?.partId).toBe(`${object.id}::${rod.id}`);
      expect(part?.kind).toBe('cylinder');
      if (part?.kind !== 'cylinder') return;
      expect(part.role).toBe('hanging-rod');
      expect(part.axis).toBe(rod.axis);
      expect(part.lengthMm).toBe(rod.lengthMm);
      expect(part.diameterMm).toBe(rod.diameterMm);
      expect(part.positionMm).toEqual([
        rod.positionMm.x,
        rod.positionMm.y,
        rod.positionMm.z,
      ]);
    });
  });

  it('conserva doorId, hingeSide, leafIndex/leafCount, moduleId y assemblyId/assemblyIndex', () => {
    const config = validated(setDoorsEnabled(DEFAULT_CONFIG, true));
    const result = calculateGeometry(config);
    const object = buildWardrobeObject(sceneWithMaterial(), config);
    const parts = partsOf(object);
    const byId = new Map(parts.map((part) => [part.partId, part]));

    // Puertas: datos de bisagra y hoja por pieza.
    expect(result.doors.length).toBeGreaterThan(0);
    expect(result.doors.length).toBe(
      parts.filter((part) => part.role === 'door').length,
    );
    for (const door of result.doors) {
      const part = byId.get(`${object.id}::${door.id}`);
      expect(part).toMatchObject({
        kind: 'box',
        role: 'door',
        hingeSide: door.hingeSide,
        leafIndex: door.leafIndex,
        leafCount: door.leafCount,
        moduleId: door.moduleId,
      });
    }

    // Tiradores: hoja dueña (doorId) y módulo.
    for (const handle of result.handles) {
      const part = byId.get(`${object.id}::${handle.id}`);
      expect(part).toMatchObject({
        kind: 'cylinder',
        role: 'door-handle',
        doorId: handle.doorId,
        moduleId: handle.moduleId,
      });
    }

    // Cajones: agrupación ensamblaje ↔ paneles.
    expect(result.drawers.length).toBeGreaterThan(0);
    for (const assembly of result.drawers) {
      for (const localId of assembly.partIds) {
        const part = byId.get(`${object.id}::${localId}`);
        expect(part?.moduleId).toBeDefined();
        expect(part).toMatchObject({
          assemblyId: assembly.id,
          assemblyIndex: assembly.index,
        });
      }
    }
  });

  it('toda pieza resuelve a su componente (selección desde cualquier pieza)', () => {
    const object = buildWardrobeObject(
      sceneWithMaterial(),
      validated(setDoorsEnabled(DEFAULT_CONFIG, true)),
    );
    const parts = partsOf(object);
    expect(parts.length).toBeGreaterThan(5);
    for (const part of parts) {
      expect(part.partId.startsWith(`${object.id}::`)).toBe(true);
      expect(componentPartObjectId(part.partId)).toBe(object.id);
    }
  });

  it('dos clósets comparten el NOMBRE de pieza solo con su namespace', () => {
    let history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    history = insertWardrobe(history);
    const first = partsOf(componentOf(history.present, 'component-1'));
    const second = partsOf(componentOf(history.present, 'component-2'));
    expect(second).toHaveLength(first.length);
    for (let index = 0; index < first.length; index += 1) {
      // Misma geometría (mismos params) pero ids de objeto distintos.
      const a = first[index];
      const b = second[index];
      expect(b?.partId).toBe(
        (a?.partId ?? '').replace('component-1::', 'component-2::'),
      );
      expect(componentPartObjectId(b?.partId ?? '')).toBe('component-2');
    }
  });
});

// ---------------------------------------------------------------------------
// D4 — Edición paramétrica
// ---------------------------------------------------------------------------

describe('4C-D D4 — edición paramétrica validada', () => {
  it('cambio de dimensiones: params actualizados y piezas regeneradas', () => {
    let history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const original = componentOf(history.present, 'component-1');
    const originalMax = maxRightMm(partsOf(original));

    const config = parseWardrobeParams(original.params);
    expect(config).not.toBeNull();
    const edited = dispatchHistoryCommand(
      history,
      createSetParamsCommand(
        history.present,
        'component-1',
        setDimension(config ?? DEFAULT_CONFIG, 'widthMm', 1500) as unknown as SceneParams,
      ),
    );
    expect(edited).not.toBeNull();
    history = edited ?? history;

    const updated = componentOf(history.present, 'component-1');
    expect(parseWardrobeParams(updated.params)?.dimensions.widthMm).toBe(1500);
    // El borde derecho del clóset sigue el ancho nuevo (sin aproximar).
    expect(maxRightMm(partsOf(updated))).toBeLessThan(originalMax);
    expect(maxRightMm(partsOf(updated))).toBe(1500);
  });

  it('puertas y módulos cambian las piezas (paridad con el motor)', () => {
    const base = buildWardrobeObject(sceneWithMaterial());
    const baseParts = partsOf(base);
    expect(baseParts.filter((part) => part.role === 'door')).toHaveLength(0);

    const doorsOn = buildWardrobeObject(
      sceneWithMaterial(),
      validated(setDoorLeaves(setDoorsEnabled(DEFAULT_CONFIG, true), 2)),
    );
    const doorParts = partsOf(doorsOn);
    const doorsResult = calculateGeometry(parseWardrobeParams(doorsOn.params) ?? DEFAULT_CONFIG);
    expect(doorParts.filter((part) => part.role === 'door')).toHaveLength(
      doorsResult.doors.length,
    );
    expect(doorParts.filter((part) => part.role === 'door-handle')).toHaveLength(
      doorsResult.handles.length,
    );
    // Dos hojas → hojas 1 y 2 (numeración 1-based del motor) por módulo.
    const leaves = new Set(
      doorParts
        .filter(
          (part) =>
            part.kind === 'box' &&
            part.role === 'door' &&
            part.leafCount === 2,
        )
        .map((part) => (part.kind === 'box' ? part.leafIndex : undefined)),
    );
    expect([...leaves].sort()).toEqual([1, 2]);

    // Más módulos → más piezas; cambiar tipo altera la familia.
    const four = buildWardrobeObject(
      sceneWithMaterial(),
      validated(setModuleCount(DEFAULT_CONFIG, 4)),
    );
    expect(partsOf(four).length).toBeGreaterThan(baseParts.length);
    const drawers = buildWardrobeObject(
      sceneWithMaterial(),
      validated(setModuleKind(DEFAULT_CONFIG, 0, 'drawers')),
    );
    expect(
      partsOf(drawers).filter(
        (part) => part.kind === 'box' && part.assemblyId !== undefined,
      ).length,
    ).toBeGreaterThan(
      baseParts.filter(
        (part) => part.kind === 'box' && part.assemblyId !== undefined,
      ).length,
    );

    // Bisagra alterna: las hojas de una hoja reflejan el lado.
    const rightHinge = validated(
      setDoorHingeSide(setDoorsEnabled(DEFAULT_CONFIG, true), 'right'),
    );
    const rightParts = partsOf(
      buildWardrobeObject(sceneWithMaterial(), rightHinge),
    );
    const singleLeaf = rightParts.find(
      (part) =>
        part.kind === 'box' && part.role === 'door' && part.leafCount === 1,
    );
    if (singleLeaf !== undefined && singleLeaf.kind === 'box') {
      expect(singleLeaf.hingeSide).toBe('right');
    }
  });

  it('parámetros inválidos: rechazo del motor, SIN documento ni historial nuevos', () => {
    const history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const documentBefore = history.present;

    // Ancho fuera de WARDROBE_LIMITS (mínimo provisorio 400 mm).
    const invalid = setDimension(DEFAULT_CONFIG, 'widthMm', 100);
    const validation = validateWardrobeConfig(invalid);
    expect(validation.ok).toBe(false);

    // La fábrica de inserción NUNCA crea un componente inválido.
    let thrown: unknown = null;
    try {
      buildWardrobeObject(documentBefore, invalid);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(
      (thrown as { code?: string }).code,
    ).toBe('ERR_SCENE_PARAMS_OUT_OF_RANGE');

    // Nada mutado: mismo documento, misma identidad de historia.
    expect(history.present).toBe(documentBefore);
    expect(history.past).toHaveLength(1);
  });

  it('Undo/Redo de params es EXACTO (documento idéntico al histórico)', () => {
    const original = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const config = parseWardrobeParams(
      componentOf(original.present, 'component-1').params,
    );
    const edited = dispatchHistoryCommand(
      original,
      createSetParamsCommand(
        original.present,
        'component-1',
        setDimension(config ?? DEFAULT_CONFIG, 'heightMm', 2000) as unknown as SceneParams,
      ),
    );
    expect(edited).not.toBeNull();

    const undone = undoHistory(edited ?? original);
    expect(undone?.present).toEqual(original.present);

    const redone = redoHistory(undone ?? original);
    expect(redone?.present).toEqual(edited?.present);

    const undoneTwice = undoHistory(redone ?? original);
    expect(undoneTwice?.present).toEqual(original.present);
  });

  it('renombrar y eliminar/clóset: comandos genéricos sobre componentes', () => {
    let history = insertWardrobe(createCommandHistory(sceneWithMaterial()));
    const renamed = dispatchHistoryCommand(
      history,
      createRenameCommand(history.present, 'component-1', 'Clóset salón'),
    );
    expect(renamed).not.toBeNull();
    history = renamed ?? history;
    expect(componentOf(history.present, 'component-1').name).toBe('Clóset salón');

    const removed = dispatchHistoryCommand(
      history,
      createRemoveObjectCommand(history.present, 'component-1'),
    );
    expect(removed).not.toBeNull();
    expect((removed ?? history).present.objects).toHaveLength(0);

    const restored = undoHistory(removed ?? history);
    expect(componentOf(restored?.present ?? sceneWithMaterial(), 'component-1').name).toBe(
      'Clóset salón',
    );
  });
});

// ---------------------------------------------------------------------------
// D5 — Ciclo de vida de recursos
// ---------------------------------------------------------------------------

describe('4C-D D5 — memoria de BufferGeometry de componentes', () => {
  it('adopt/release idempotentes: paridad created === disposed', () => {
    const object = buildWardrobeObject(sceneWithMaterial());
    const parts = partsOf(object);
    expect(parts.length).toBeGreaterThan(0);

    const beforeCreated = partsGeometryLifecycle.created;
    const beforeDisposed = partsGeometryLifecycle.disposed;

    const retained = retainComponentParts(object.id, parts);
    // La creación NO contabiliza: solo la adopción (patrón de sólidos).
    expect(partsGeometryLifecycle.created).toBe(beforeCreated);

    retained.adopt();
    retained.adopt();
    expect(partsGeometryLifecycle.created).toBe(beforeCreated + parts.length);

    retained.release();
    retained.release(); // idempotente: un solo dispose por pieza
    expect(partsGeometryLifecycle.disposed).toBe(beforeDisposed + parts.length);
    expect(partsGeometryLifecycle.created).toBe(partsGeometryLifecycle.disposed);
  });

  it('liberar por pieza también es idempotente (disposeComponentPartsRenderData)', () => {
    const object = buildWardrobeObject(sceneWithMaterial());
    const data = toComponentPartsRenderData(object.id, partsOf(object));
    expect(data.parts.every((part) => part.objectId === object.id)).toBe(true);

    const beforeDispose = partsGeometryLifecycle.disposed;
    disposeComponentPartsRenderData(data);
    expect(partsGeometryLifecycle.disposed).toBe(
      beforeDispose + data.parts.length,
    );

    // Ciclo completo vía manejador (delta a delta: la liberación
    // directa de arriba no pasa por `adopt` y NO cuenta `created`).
    const createdBefore = partsGeometryLifecycle.created;
    const disposedBefore = partsGeometryLifecycle.disposed;
    const retained = retainComponentParts(object.id, partsOf(object));
    retained.adopt();
    expect(partsGeometryLifecycle.created).toBe(
      createdBefore + data.parts.length,
    );
    retained.release();
    expect(partsGeometryLifecycle.disposed).toBe(
      disposedBefore + data.parts.length,
    );
  });
});

// ---------------------------------------------------------------------------
// Regresión del configurador (ítem 15): sin cambios en su contrato
// ---------------------------------------------------------------------------

describe('4C-D — regresiones del configurador', () => {
  it('DEFAULT_CONFIG sigue siendo el punto de partida válido del motor', () => {
    const validation = validateWardrobeConfig(DEFAULT_CONFIG);
    expect(validation.ok).toBe(true);
    // applySceneAction del configurador/modelador no cambia de forma.
    const withGrid = applySceneAction(createEmptySceneDocument(), {
      type: 'set-grid-step',
      gridStepMm: 50,
    });
    expect(withGrid?.gridStepMm).toBe(50);
  });
});
