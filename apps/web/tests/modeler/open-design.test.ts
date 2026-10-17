/**
 * FASE-4B-D — apertura no destructiva de diseños (§4): el `DesignRecord`
 * existente se transforma explícitamente en un documento `furniconfig-scene`
 * v1 sin mutarlo, sin persistir nada y conservando la información exacta
 * para reconstruir el diseño.
 */

import { describe, expect, it } from 'vitest';

import {
  calculateGeometry,
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  SceneError,
  buildComponent,
  parseSceneEnvelope,
  serializeScene,
} from '@furniconfig/modeler-core';

import type { DesignRecord } from '../../src/lib/designs/types.js';
import {
  openDesignAsSceneDocument,
  wardrobeSceneRegistry,
} from '../../src/lib/modeler/open-design.js';
import { WARDROBE_COMPONENT_TYPE } from '../../src/lib/modeler/components/wardrobe.js';

const config: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 900, heightMm: 2200, depthMm: 550 },
  modules: [
    { kind: 'hanging' },
    { kind: 'drawers', drawers: 3 },
  ],
  materials: {
    structure: { name: 'Nogal', thicknessMm: 18, finish: 'mate' },
    interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
  },
  doors: { leaves: 1, hingeSide: 'right' },
};

const record: DesignRecord = {
  id: 'design-1',
  name: 'Armario del pasillo',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  storageVersion: 1,
  config,
};

describe('openDesignAsSceneDocument (§4)', () => {
  it('crea un documento furniconfig-scene v1 con el clóset como componente', () => {
    const document = openDesignAsSceneDocument(record);
    expect(document.documentVersion).toBe(1);
    expect(document.id).toBe('scene-1');
    expect(document.objects).toHaveLength(1);
    const object = document.objects[0];
    expect(object).toMatchObject({
      id: 'component-1',
      kind: 'component',
      type: WARDROBE_COMPONENT_TYPE,
      version: 1,
      name: 'Armario del pasillo',
      transform: { positionMm: [0, 0, 0] },
      materialId: 'material-1',
    });
    expect(document.materials.map((material) => material.id)).toEqual(['material-1']);
    expect(Object.isFrozen(document)).toBe(true);
  });

  it('NO modifica el diseño original (pura, sin mutación)', () => {
    const snapshot = JSON.parse(JSON.stringify(record)) as DesignRecord;
    const document = openDesignAsSceneDocument(record);
    expect(record).toEqual(snapshot);
    expect(document).not.toBe(record as unknown as object);
    // los params son una copia saneada, no una referencia viva al config
    const params = document.objects[0]?.kind === 'component'
      ? document.objects[0].params
      : undefined;
    expect(params).not.toBe(record.config as unknown as object);
  });

  it('los params conservan exactamente la información para reconstruir el diseño', () => {
    const document = openDesignAsSceneDocument(record);
    const params = document.objects[0]?.kind === 'component'
      ? document.objects[0].params
      : undefined;
    const revalidated = validateWardrobeConfig(params);
    expect(revalidated.ok).toBe(true);
    if (revalidated.ok) expect(revalidated.config).toEqual(config);

    // y la geometría derivada del documento equivale a la del motor original
    const build = buildComponent(
      wardrobeSceneRegistry,
      'component-1',
      WARDROBE_COMPONENT_TYPE,
      1,
      (params ?? {}) as never,
    );
    const engine = calculateGeometry(config);
    expect(build.parts).toHaveLength(
      engine.panels.length + engine.rods.length + engine.doors.length + engine.handles.length,
    );
  });

  it('el documento hace round-trip de SceneEnvelope con el registro', () => {
    const document = openDesignAsSceneDocument(record, { documentId: 'scene-42' });
    expect(document.id).toBe('scene-42');
    const roundTrip = parseSceneEnvelope(
      serializeScene(document, { components: wardrobeSceneRegistry }),
      { components: wardrobeSceneRegistry },
    );
    expect(roundTrip.ok).toBe(true);
    if (roundTrip.ok) expect(roundTrip.document).toEqual(document);
  });

  it('acepta configuraciones inválidas solo rechazando (el diseño no se toca)', () => {
    const broken: DesignRecord = {
      ...record,
      config: { ...config, dimensions: { widthMm: 50, heightMm: 2200, depthMm: 550 } },
    };
    const snapshot = JSON.parse(JSON.stringify(broken)) as DesignRecord;
    expect(() => openDesignAsSceneDocument(broken)).toThrow(SceneError);
    try {
      openDesignAsSceneDocument(broken);
    } catch (error) {
      expect((error as SceneError).code).toBe('ERR_SCENE_PARAMS_OUT_OF_RANGE');
    }
    expect(broken).toEqual(snapshot);
  });

  it('acepta documentId y nombre de objeto explícitos (determinismo en manos del llamante)', () => {
    const document = openDesignAsSceneDocument(record, {
      documentId: 'scene-7',
      objectName: 'Clóset principal',
    });
    expect(document.id).toBe('scene-7');
    expect(document.objects[0]?.name).toBe('Clóset principal');
  });
});
