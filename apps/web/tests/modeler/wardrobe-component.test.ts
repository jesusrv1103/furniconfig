/**
 * FASE-4B-D — componente `furniconfig.wardrobe` (D2): equivalencia
 * exacta de todas las piezas frente al motor original, compatibilidad de
 * `WardrobeConfig` v1 y determinismo.
 */

import { describe, expect, it } from 'vitest';

import {
  calculateGeometry,
  doorOpeningTransform,
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  SceneError,
  buildComponent,
  createComponentRegistry,
  validateSceneDocument,
} from '@furniconfig/modeler-core';

import {
  WARDROBE_COMPONENT_TYPE,
  WARDROBE_COMPONENT_VERSION,
  geometryResultToParts,
  wardrobeComponent,
} from '../../src/lib/modeler/components/wardrobe.js';

export const wardrobeRegistry = createComponentRegistry([wardrobeComponent]);

/** Config nominal válida (2 módulos: estantes + colgado). */
const baseConfig: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 1200, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 4 },
    { kind: 'hanging' },
  ],
  materials: {
    structure: { name: 'Roble', thicknessMm: 18, finish: 'mate' },
    interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
  },
};

/** Config rica: puertas, cajones, barra y fondo (1800 mm caben4 módulos). */
const richConfig: WardrobeConfig = {
  ...baseConfig,
  dimensions: { widthMm: 1800, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'drawers', drawers: 3 },
    { kind: 'hanging' },
    { kind: 'shelves', shelves: 5, widthMm: 500 },
  ],
  materials: {
    ...baseConfig.materials,
    drawer: { name: 'Gris', thicknessMm: 15, finish: 'mate' },
    door: { name: 'Alto brillo', thicknessMm: 18, finish: 'brillo' },
  },
  hangingRod: { diameterMm: 30, name: 'Acero', finish: 'brillo' },
  doors: { leaves: 2, hingeSide: 'left' },
  backPanel: { enabled: true, thicknessMm: 15 },
};

function configParams(config: WardrobeConfig): Record<string, unknown> {
  return JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
}

describe('furniconfig.wardrobe (D2)', () => {
  it('el fixture base es válido para el motor (sanity)', () => {
    expect(validateWardrobeConfig(baseConfig).ok).toBe(true);
    expect(validateWardrobeConfig(richConfig).ok).toBe(true);
  });

  it('las piezas 1:1 con calculateGeometry: paneles exactos en posición y tamaño', () => {
    const engine = calculateGeometry(baseConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(baseConfig) as never,
    );
    expect(build.parts).toHaveLength(
      engine.panels.length + engine.rods.length + engine.doors.length + engine.handles.length,
    );
    // los paneles se emiten los primeros (orden fijo de geometryResultToParts)
    engine.panels.forEach((panel, index) => {
      const part = build.parts[index];
      expect(part).toMatchObject({
        kind: 'box',
        partId: `component-1::${panel.id}`,
        role: panel.role,
        sizeMm: [panel.sizeMm.x, panel.sizeMm.y, panel.sizeMm.z],
        positionMm: [panel.positionMm.x, panel.positionMm.y, panel.positionMm.z],
        materialId: panel.materialId,
      });
    });
  });

  it('config rica: todas las piezas del motor aparecen, sin perder información', () => {
    const engine = calculateGeometry(richConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );

    const expectedTotal =
      engine.panels.length + engine.rods.length + engine.doors.length + engine.handles.length;
    expect(build.parts).toHaveLength(expectedTotal);

    // barras y tiradores conservan cilindro exacto (eje, longitud, diámetro)
    const rodParts = build.parts.filter((part) => part.role === 'hanging-rod');
    expect(rodParts).toHaveLength(engine.rods.length);
    engine.rods.forEach((rod, index) => {
      expect(rodParts[index]).toMatchObject({
        kind: 'cylinder',
        partId: `component-1::${rod.id}`,
        axis: rod.axis,
        lengthMm: rod.lengthMm,
        diameterMm: rod.diameterMm,
        positionMm: [rod.positionMm.x, rod.positionMm.y, rod.positionMm.z],
      });
    });

    const handleParts = build.parts.filter((part) => part.role === 'door-handle');
    expect(handleParts).toHaveLength(engine.handles.length);
    engine.handles.forEach((handle, index) => {
      expect(handleParts[index]).toMatchObject({
        kind: 'cylinder',
        axis: 'x',
        lengthMm: handle.lengthMm,
        diameterMm: handle.diameterMm,
      });
    });

    // puertas: cajas con grosor exacto
    const doorParts = build.parts.filter((part) => part.role === 'door');
    expect(doorParts).toHaveLength(engine.doors.length);
    engine.doors.forEach((door, index) => {
      expect(doorParts[index]).toMatchObject({
        kind: 'box',
        sizeMm: [door.widthMm, door.heightMm, door.thicknessMm],
        positionMm: [door.positionMm.x, door.positionMm.y, door.positionMm.z],
      });
    });

    // los partIds de los cajones referencian paneles ya emitidos (sin piezas fantasma)
    for (const drawer of engine.drawers) {
      for (const partId of drawer.partIds) {
        expect(build.parts.some((part) => part.partId === `component-1::${partId}`)).toBe(true);
      }
    }
  });

  it('geometryResultToParts emite en orden fijo: paneles, barras, puertas, tiradores', () => {
    const engine = calculateGeometry(richConfig);
    const parts = geometryResultToParts(engine);
    const expectedOrder = [
      ...engine.panels.map((panel) => panel.id),
      ...engine.rods.map((rod) => rod.id),
      ...engine.doors.map((door) => door.id),
      ...engine.handles.map((handle) => handle.id),
    ];
    expect(parts.map((part) => part.partId)).toEqual(expectedOrder);
  });

  it('config inválida → SceneError PARAMS_OUT_OF_RANGE (la valida el motor)', () => {
    expect(() =>
      buildComponent(
        wardrobeRegistry,
        'component-1',
        WARDROBE_COMPONENT_TYPE,
        WARDROBE_COMPONENT_VERSION,
        { ...configParams(baseConfig), dimensions: { widthMm: 100, heightMm: 2200, depthMm: 600 } } as never,
      ),
    ).toThrow(SceneError);
    try {
      buildComponent(
        wardrobeRegistry,
        'component-1',
        WARDROBE_COMPONENT_TYPE,
        WARDROBE_COMPONENT_VERSION,
        { schemaVersion: 1 } as never,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(SceneError);
      expect((error as SceneError).code).toBe('ERR_SCENE_PARAMS_OUT_OF_RANGE');
    }
  });

  it('es determinista: dos construcciones idénticas producen piezas idénticas', () => {
    const a = buildComponent(
      wardrobeRegistry, 'component-7', WARDROBE_COMPONENT_TYPE, WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    const b = buildComponent(
      wardrobeRegistry, 'component-7', WARDROBE_COMPONENT_TYPE, WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    expect(a).toEqual(b);
  });

  it('WardrobeConfig v1 sobrevive íntegro como params en el documento (round-trip)', () => {
    const result = validateSceneDocument(
      {
        documentVersion: 1,
        id: 'scene-1',
        name: 'Clóset en escena',
        gridStepMm: 10,
        originMm: [0, 0, 0],
        materials: [
          { id: 'material-1', name: 'Material', finish: 'multiuso', thicknessMm: 18 },
        ],
        objects: [
          {
            id: 'component-1',
            kind: 'component',
            name: 'Clóset',
            type: WARDROBE_COMPONENT_TYPE,
            version: WARDROBE_COMPONENT_VERSION,
            transform: { positionMm: [0, 0, 0] },
            materialId: 'material-1',
            params: configParams(richConfig),
          },
        ],
      },
      { components: wardrobeRegistry },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const params = result.document.objects[0]?.kind === 'component'
      ? result.document.objects[0].params
      : undefined;
    // los params conservan exactamente la configuración validable por el motor
    const revalidated = validateWardrobeConfig(params);
    expect(revalidated.ok).toBe(true);
    if (revalidated.ok) expect(revalidated.config).toEqual(richConfig);
  });

  it('versión distinta de la registrada se rechaza en la validación del documento', () => {
    const result = validateSceneDocument(
      {
        documentVersion: 1,
        id: 'scene-1',
        name: 'Escena',
        gridStepMm: 10,
        originMm: [0, 0, 0],
        materials: [
          { id: 'material-1', name: 'Material', finish: 'multiuso', thicknessMm: 18 },
        ],
        objects: [
          {
            id: 'component-1',
            kind: 'component',
            name: 'Clóset',
            type: WARDROBE_COMPONENT_TYPE,
            version: 99,
            transform: { positionMm: [0, 0, 0] },
            materialId: 'material-1',
          },
        ],
      },
      { components: wardrobeRegistry },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.code === 'ERR_SCENE_UNKNOWN_COMPONENT')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Auditoría 4B-D §2 — asociaciones funcionales (interacción/animación futuras)
// ---------------------------------------------------------------------------

describe('furniconfig.wardrobe (D2): asociaciones funcionales', () => {
  it('conserva moduleId en TODAS las piezas del motor', () => {
    const engine = calculateGeometry(richConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    const byPartId = new Map(build.parts.map((part) => [part.partId, part]));
    const sources = [
      ...engine.panels.map((piece) => [piece.id, piece.moduleId] as const),
      ...engine.rods.map((piece) => [piece.id, piece.moduleId] as const),
      ...engine.doors.map((piece) => [piece.id, piece.moduleId] as const),
      ...engine.handles.map((piece) => [piece.id, piece.moduleId] as const),
    ];
    expect(sources.length).toBeGreaterThan(0);
    for (const [id, moduleId] of sources) {
      // en ComponentPart "sin módulo" es campo ausente (undefined); en el
      // motor es null: se comparan normalizados (mismo significado).
      expect(byPartId.get(`component-1::${id}`)?.moduleId ?? null).toBe(moduleId);
    }
    // los paneles sin módulo (p. ej. laterales/back) no inventan asociación
    const loose = engine.panels.find((panel) => panel.moduleId === null);
    if (loose !== undefined) {
      const part = byPartId.get(`component-1::${loose.id}`);
      expect(part?.moduleId).toBeUndefined();
    }
  });

  it('conserva los datos de bisagra de cada hoja (hingeSide, leafIndex, leafCount)', () => {
    const engine = calculateGeometry(richConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    expect(engine.doors.length).toBeGreaterThan(0);
    for (const door of engine.doors) {
      const part = build.parts.find((piece) => piece.partId === `component-1::${door.id}`);
      expect(part).toMatchObject({
        kind: 'box',
        role: 'door',
        hingeSide: door.hingeSide,
        leafIndex: door.leafIndex,
        leafCount: door.leafCount,
        moduleId: door.moduleId,
      });
    }
  });

  it('una hoja reconstruida desde ComponentPart produce la MISMA transformación de apertura', () => {
    const engine = calculateGeometry(richConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    for (const door of engine.doors) {
      const part = build.parts.find((piece) => piece.partId === `component-1::${door.id}`);
      if (part?.kind !== 'box' || part.hingeSide === undefined) {
        throw new Error(`faltan datos de bisagra en ${door.id}`);
      }
      const [widthMm, heightMm, thicknessMm] = part.sizeMm;
      const [x, y, z] = part.positionMm;
      const reconstructed = {
        ...door,
        widthMm,
        heightMm,
        thicknessMm,
        positionMm: { x, y, z },
        hingeSide: part.hingeSide,
        leafIndex: part.leafIndex ?? door.leafIndex,
        leafCount: part.leafCount ?? door.leafCount,
        moduleId: part.moduleId ?? door.moduleId,
        materialId: part.materialId ?? door.materialId,
      } as typeof door;
      for (const angle of [0, 45, 110]) {
        expect(doorOpeningTransform(reconstructed, angle)).toEqual(
          doorOpeningTransform(door, angle),
        );
      }
    }
  });

  it('conserva doorId en los tiradores (hoja dueña)', () => {
    const engine = calculateGeometry(richConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    expect(engine.handles.length).toBeGreaterThan(0);
    for (const handle of engine.handles) {
      const part = build.parts.find((piece) => piece.partId === `component-1::${handle.id}`);
      expect(part).toMatchObject({
        kind: 'cylinder',
        role: 'door-handle',
        doorId: handle.doorId,
        moduleId: handle.moduleId,
      });
      // la hoja referenciada existe en el mismo build
      expect(
        build.parts.some((piece) => piece.partId === `component-1::${handle.doorId}`),
      ).toBe(true);
    }
  });

  it('conserva la agrupación cajón ↔ paneles (assemblyId/assemblyIndex)', () => {
    const engine = calculateGeometry(richConfig);
    const build = buildComponent(
      wardrobeRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      WARDROBE_COMPONENT_VERSION,
      configParams(richConfig) as never,
    );
    expect(engine.drawers.length).toBeGreaterThan(0);
    const byPartId = new Map(build.parts.map((part) => [part.partId, part]));
    for (const drawer of engine.drawers) {
      expect(drawer.partIds.length).toBeGreaterThan(0);
      for (const panelId of drawer.partIds) {
        const part = byPartId.get(`component-1::${panelId}`);
        expect(part).toMatchObject({
          assemblyId: drawer.id,
          assemblyIndex: drawer.index,
        });
      }
    }
    // paneles NO de cajón sin ensamblaje inventado
    const structural = engine.panels.find((panel) => !panel.role.startsWith('drawer-'));
    if (structural !== undefined) {
      const part = byPartId.get(`component-1::${structural.id}`);
      expect(part?.kind).toBe('box');
      if (part?.kind === 'box') {
        expect(part.assemblyId).toBeUndefined();
        expect(part.assemblyIndex).toBeUndefined();
      }
    }
  });
});
