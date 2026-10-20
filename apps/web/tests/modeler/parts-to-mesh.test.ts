/**
 * FASE-4C-D — auditoría final del adaptador `parts-to-mesh.ts`
 * (§1 geometría y §3 recursos del mandate de auditoría).
 *
 * - §1: cajas y cilindros EXACTOS — dimensiones nominales, esquina
 *   mínima del bbox y orientación por eje —; los 24 segmentos son
 *   presentación sin tocar radio/longitud; mm→m SOLO en la
 *   frontera; correspondencia 1:1 entre las piezas del motor y las
 *   mallas renderizadas; sin cambios silenciosos de escala,
 *   posición u orientación.
 * - §3: la secuencia REAL del doble efecto de `StrictMode`
 *   (`adopt → release → adopt → release`) dispone la geometría en
 *   CADA `release` — verificado con eventos `dispose` de
 *   Three.js sobre `BufferGeometry` reales, no solo con
 *   contadores — y dos retenciones de clósets son independientes.
 *
 * La construcción NO contabiliza: `partsGeometryLifecycle` solo
 * registra adopciones y liberaciones (todas las afirmaciones usan
 * deltas por aislamiento de módulo en vitest).
 */

import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import {
  buildComponent,
  createEmptySceneDocument,
  type ComponentPart,
  type SceneDocument,
} from '@furniconfig/modeler-core';

import { DEFAULT_CONFIG, setDoorsEnabled } from '../../src/lib/config.js';
import {
  DEFAULT_SCENE_MATERIAL,
  buildWardrobeObject,
} from '../../src/lib/modeler/document-actions.js';
import { mmToM } from '../../src/lib/units.js';
import {
  partsGeometryLifecycle,
  retainComponentParts,
  toComponentPartsRenderData,
} from '../../src/lib/modeler/components/parts-to-mesh.js';
import { wardrobeSceneRegistry } from '../../src/lib/modeler/open-design.js';

// ---------------------------------------------------------------------------
// Fixtures y utilidades
// ---------------------------------------------------------------------------

function sceneWithMaterial(): SceneDocument {
  return {
    ...createEmptySceneDocument(),
    materials: [DEFAULT_SCENE_MATERIAL],
  };
}

function partsOf(
  object: ReturnType<typeof buildWardrobeObject>,
): readonly ComponentPart[] {
  return buildComponent(
    wardrobeSceneRegistry,
    object.id,
    object.type,
    object.version,
    object.params ?? {},
  ).parts;
}

interface BoxParameters {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

interface CylinderParameters {
  readonly radiusTop: number;
  readonly radiusBottom: number;
  readonly height: number;
  readonly radialSegments: number;
}

function boxParameters(geometry: BufferGeometry): BoxParameters {
  const parameters = (
    geometry as BufferGeometry & { readonly parameters?: BoxParameters }
  ).parameters;
  if (parameters === undefined) {
    throw new Error('la geometría no expone parameters de BoxGeometry');
  }
  return parameters;
}

function cylinderParameters(geometry: BufferGeometry): CylinderParameters {
  const parameters = (
    geometry as BufferGeometry & { readonly parameters?: CylinderParameters }
  ).parameters;
  if (parameters === undefined) {
    throw new Error('la geometría no expone parameters de CylinderGeometry');
  }
  return parameters;
}

function bboxOf(geometry: BufferGeometry) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) throw new Error('boundingBox no calculable');
  return box;
}

function extentOf(
  box: { readonly min: { readonly x: number; readonly y: number; readonly z: number }; readonly max: { readonly x: number; readonly y: number; readonly z: number } },
  axis: 'x' | 'y' | 'z',
): number {
  if (axis === 'x') return box.max.x - box.min.x;
  if (axis === 'y') return box.max.y - box.min.y;
  return box.max.z - box.min.z;
}

function minOf(
  box: { readonly min: { readonly x: number; readonly y: number; readonly z: number } },
): readonly [number, number, number] {
  return [box.min.x, box.min.y, box.min.z];
}

/**
 * Suscribe contadores de eventos `dispose` REALES de Three.js por
 * geometría (instrumentación §3: sin eventos, sin liberación).
 */
function trackDisposals(geometries: readonly BufferGeometry[]): {
  readonly counts: ReadonlyMap<BufferGeometry, number>;
  readonly stop: () => void;
} {
  const counts = new Map<BufferGeometry, number>(geometries.map((g) => [g, 0]));
  const handlers = new Map<BufferGeometry, () => void>();
  for (const geometry of geometries) {
    const handler = () => {
      counts.set(geometry, (counts.get(geometry) ?? 0) + 1);
    };
    handlers.set(geometry, handler);
    geometry.addEventListener('dispose', handler);
  }
  return {
    counts,
    stop: () => {
      for (const [geometry, handler] of handlers) {
        geometry.removeEventListener('dispose', handler);
      }
    },
  };
}

function disposalsOf(tracker: ReturnType<typeof trackDisposals>): number {
  let total = 0;
  for (const count of tracker.counts.values()) total += count;
  return total;
}

/** El objeto con puertas activas cubre paneles, barras, puertas y tiradores. */
function wardrobeWithDoors(): ReturnType<typeof buildWardrobeObject> {
  return buildWardrobeObject(
    sceneWithMaterial(),
    setDoorsEnabled(DEFAULT_CONFIG, true),
  );
}

// ---------------------------------------------------------------------------
// §1 — Geometría exacta
// ---------------------------------------------------------------------------

describe('4C-D auditoría §1 — geometría exacta del adaptador', () => {
  it('cajas: dimensiones, esquina mínima y mm→m exactos en TODAS las piezas', () => {
    const object = wardrobeWithDoors();
    const parts = partsOf(object);
    const render = toComponentPartsRenderData(object.id, parts);
    expect(render.parts).toHaveLength(parts.length);

    let boxes = 0;
    let innerWidthPanels = 0;
    const thicknessMm = DEFAULT_CONFIG.materials.structure.thicknessMm;
    parts.forEach((part, index) => {
      const rendered = render.parts[index];
      if (rendered === undefined) throw new Error('pieza de render perdida');
      expect(rendered.partId).toBe(part.partId);
      expect(rendered.kind).toBe(part.kind);
      if (part.kind !== 'box') return;
      boxes += 1;

      // Dimensiones nominales convertidas UNA vez (frontera mm→m).
      const parameters = boxParameters(rendered.geometry);
      expect(parameters.width).toBe(mmToM(part.sizeMm[0]));
      expect(parameters.height).toBe(mmToM(part.sizeMm[1]));
      expect(parameters.depth).toBe(mmToM(part.sizeMm[2]));
      // Sanidad de frontera: el tablero superior/inferior va entre
      // los laterales (ancho interior 2400 − 2·espesor = 2364 mm) y
      // se renderiza en METROS (si faltara la conversión, el valor
      // sería 2364 y fallaría).
      if (parameters.width === mmToM(2400 - 2 * thicknessMm)) {
        innerWidthPanels += 1;
      }

      // Posición: esquina mínima del bbox exactamente donde la
      // declara el motor (sin traslaciones ni escalas ocultas).
      const box = bboxOf(rendered.geometry);
      const [x, y, z] = part.positionMm;
      const [w, h, d] = part.sizeMm;
      const [minX, minY, minZ] = minOf(box);
      expect(minX).toBeCloseTo(mmToM(x), 5);
      expect(minY).toBeCloseTo(mmToM(y), 5);
      expect(minZ).toBeCloseTo(mmToM(z), 5);
      expect(box.max.x).toBeCloseTo(mmToM(x + w), 5);
      expect(box.max.y).toBeCloseTo(mmToM(y + h), 5);
      expect(box.max.z).toBeCloseTo(mmToM(z + d), 5);
    });

    expect(boxes).toBeGreaterThan(10);
    // DEFAULT_CONFIG tiene tablero(s) de ancho interior (2364 mm).
    expect(innerWidthPanels).toBeGreaterThan(0);
  });

  it('cilindros: radio/longitud exactos, eje conservado y 24 segmentos SOLO de presentación', () => {
    const object = wardrobeWithDoors();
    const parts = partsOf(object);
    const render = toComponentPartsRenderData(object.id, parts);

    let cylinders = 0;
    parts.forEach((part, index) => {
      if (part.kind !== 'cylinder') return;
      const rendered = render.parts[index];
      if (rendered === undefined || rendered.kind !== 'cylinder') {
        throw new Error('cilindro del motor perdido en el render');
      }
      cylinders += 1;

      const parameters = cylinderParameters(rendered.geometry);
      // Parámetros nominales: radio = diámetro/2 y altura = longitud.
      expect(parameters.radiusTop).toBe(mmToM(part.diameterMm / 2));
      expect(parameters.radiusBottom).toBe(mmToM(part.diameterMm / 2));
      expect(parameters.height).toBe(mmToM(part.lengthMm));
      // La teselación es de PRESENTACIÓN: no altera los anteriores.
      expect(parameters.radialSegments).toBe(24);

      // Orientación: el bbox ocupa `lengthMm` en el eje de la pieza
      // y `diameterMm` en los otros dos; la esquina mínima es la del
      // motor.
      const box = bboxOf(rendered.geometry);
      const [minX, minY, minZ] = minOf(box);
      const [x, y, z] = part.positionMm;
      expect(minX).toBeCloseTo(mmToM(x), 5);
      expect(minY).toBeCloseTo(mmToM(y), 5);
      expect(minZ).toBeCloseTo(mmToM(z), 5);
      expect(extentOf(box, part.axis)).toBeCloseTo(mmToM(part.lengthMm), 5);
      const others = (['x', 'y', 'z'] as const).filter(
        (axis) => axis !== part.axis,
      );
      for (const other of others) {
        expect(extentOf(box, other)).toBeCloseTo(mmToM(part.diameterMm), 5);
      }
    });
    // Barras de colgado + tiradores (con puertas activas).
    expect(cylinders).toBeGreaterThan(0);
  });

  it('cilindros: los TRES ejes teóricos conservan orientación y el medio milímetro', () => {
    const axisCases = [
      { axis: 'x', extents: [100, 40, 40] },
      { axis: 'y', extents: [40, 100, 40] },
      { axis: 'z', extents: [40, 40, 100] },
    ] as const;

    for (const { axis, extents } of axisCases) {
      const fixture: ComponentPart = {
        kind: 'cylinder',
        partId: `component-1::rod-${axis}`,
        role: 'hanging-rod',
        axis,
        lengthMm: 100,
        diameterMm: 40,
        positionMm: [10, 20, 30],
      };
      const [rendered] = toComponentPartsRenderData('component-1', [fixture])
        .parts;
      if (rendered === undefined || rendered.kind !== 'cylinder') {
        throw new Error('cilindro sintético perdido');
      }
      const box = bboxOf(rendered.geometry);
      const [minX, minY, minZ] = minOf(box);
      expect(minX).toBeCloseTo(mmToM(10), 5);
      expect(minY).toBeCloseTo(mmToM(20), 5);
      expect(minZ).toBeCloseTo(mmToM(30), 5);
      expect(extentOf(box, 'x')).toBeCloseTo(mmToM(extents[0]), 5);
      expect(extentOf(box, 'y')).toBeCloseTo(mmToM(extents[1]), 5);
      expect(extentOf(box, 'z')).toBeCloseTo(mmToM(extents[2]), 5);
    }

    // Medio milímetro legítimo del motor (p. ej. fondo 555 mm,
    // z de la barra 277.5): se preserva SIN redondear.
    const halfMm: ComponentPart = {
      kind: 'cylinder',
      partId: 'component-1::rod-half',
      role: 'hanging-rod',
      axis: 'z',
      lengthMm: 555,
      diameterMm: 15,
      positionMm: [0, 0, 277.5],
    };
    const [rendered] = toComponentPartsRenderData('component-1', [halfMm])
      .parts;
    if (rendered === undefined || rendered.kind !== 'cylinder') {
      throw new Error('cilindro sintético perdido');
    }
    const parameters = cylinderParameters(rendered.geometry);
    expect(parameters.radiusTop).toBe(mmToM(15 / 2));
    expect(parameters.height).toBe(mmToM(555));
    const box = bboxOf(rendered.geometry);
    expect(box.min.z).toBeCloseTo(mmToM(277.5), 5);
    expect(box.max.z).toBeCloseTo(mmToM(277.5 + 555), 5);
  });

  it('correspondencia 1:1 pieza↔malla, instancias independientes y construcción sin contabilizar', () => {
    const createdBefore = partsGeometryLifecycle.created;
    const disposedBefore = partsGeometryLifecycle.disposed;

    const object = wardrobeWithDoors();
    const parts = partsOf(object);
    const first = toComponentPartsRenderData(object.id, parts);
    const second = toComponentPartsRenderData(object.id, parts);

    // 1:1 en cantidad, orden e identidad de piezas.
    expect(first.parts.map((part) => part.partId)).toEqual(
      parts.map((part) => part.partId),
    );
    expect(first.parts.map((part) => part.role)).toEqual(
      parts.map((part) => part.role),
    );
    // Cada conversión crea geometrías PROPIAS (sin compartir GPU).
    first.parts.forEach((part, index) => {
      const twin = second.parts[index];
      expect(twin).toBeDefined();
      expect(part.geometry).not.toBe(twin?.geometry);
    });

    // También con el conjunto por defecto (sin puertas).
    const plain = buildWardrobeObject(sceneWithMaterial());
    const plainParts = partsOf(plain);
    const plainRender = toComponentPartsRenderData(plain.id, plainParts);
    expect(plainRender.parts).toHaveLength(plainParts.length);
    plainRender.parts.forEach((part, index) => {
      expect(part.partId).toBe(plainParts[index]?.partId);
      expect(part.objectId).toBe(plain.id);
    });

    // La construcción NO toca el ciclo de vida (solo adopt/release).
    expect(partsGeometryLifecycle.created).toBe(createdBefore);
    expect(partsGeometryLifecycle.disposed).toBe(disposedBefore);
  });
});

// ---------------------------------------------------------------------------
// §3 — Ciclo de vida real (eventos dispose de Three.js)
// ---------------------------------------------------------------------------

describe('4C-D auditoría §3 — ciclo de vida de BufferGeometry', () => {
  it('montaje estricto (adopt→release→adopt→release): CADA release dispone de verdad', () => {
    const object = buildWardrobeObject(sceneWithMaterial());
    const retained = retainComponentParts(object.id, partsOf(object));
    const partsCount = retained.data.parts.length;
    expect(partsCount).toBeGreaterThan(0);

    const createdBefore = partsGeometryLifecycle.created;
    const disposedBefore = partsGeometryLifecycle.disposed;
    const tracker = trackDisposals(
      retained.data.parts.map((part) => part.geometry),
    );

    // Secuencia exacta del doble efecto de StrictMode + sustitución
    // final (cambio de params) o desmontaje (eliminar clóset):
    retained.adopt(); // montaje 1
    retained.adopt(); // idempotente (sin doble conteo)
    retained.release(); // limpieza estricta → dispose #1
    retained.adopt(); // remontaje estricto: REARMA la retención
    retained.adopt(); // idempotente
    retained.release(); // sustitución/desmontaje real → dispose #2
    retained.release(); // idempotente: sin tercer dispose

    const disposals = tracker.counts;
    for (const geometry of retained.data.parts.map((part) => part.geometry)) {
      expect(disposals.get(geometry)).toBe(2);
    }
    expect(disposalsOf(tracker)).toBe(2 * partsCount);

    // Contadores: 2 adopciones = 2 liberaciones por pieza.
    expect(partsGeometryLifecycle.created - createdBefore).toBe(
      2 * partsCount,
    );
    expect(partsGeometryLifecycle.disposed - disposedBefore).toBe(
      2 * partsCount,
    );
    expect(partsGeometryLifecycle.created).toBe(partsGeometryLifecycle.disposed);
    tracker.stop();
  });

  it('dos clósets: liberar uno NO toca la geometría del otro', () => {
    const first = buildWardrobeObject(sceneWithMaterial());
    const documentWithFirst: SceneDocument = {
      ...sceneWithMaterial(),
      objects: [first],
    };
    const second = buildWardrobeObject(documentWithFirst);
    expect(second.id).not.toBe(first.id);

    const retainedA = retainComponentParts(first.id, partsOf(first));
    const retainedB = retainComponentParts(second.id, partsOf(second));
    const geometriesA = retainedA.data.parts.map((part) => part.geometry);
    const geometriesB = retainedB.data.parts.map((part) => part.geometry);
    const trackerA = trackDisposals(geometriesA);
    const trackerB = trackDisposals(geometriesB);

    const createdBefore = partsGeometryLifecycle.created;
    const disposedBefore = partsGeometryLifecycle.disposed;
    const countA = retainedA.data.parts.length;
    const countB = retainedB.data.parts.length;

    retainedA.adopt();
    retainedB.adopt();
    expect(partsGeometryLifecycle.created - createdBefore).toBe(countA + countB);

    // Liberar A: A dispuesto, B INTACTO (cero eventos dispose).
    retainedA.release();
    expect(disposalsOf(trackerA)).toBe(countA);
    expect(disposalsOf(trackerB)).toBe(0);

    retainedB.release();
    expect(disposalsOf(trackerB)).toBe(countB);
    expect(partsGeometryLifecycle.disposed - disposedBefore).toBe(countA + countB);
    expect(partsGeometryLifecycle.created).toBe(partsGeometryLifecycle.disposed);
    trackerA.stop();
    trackerB.stop();
  });

  it('release sin adopción previa no contamina (sin eventos ni contadores)', () => {
    const object = buildWardrobeObject(sceneWithMaterial());
    const retained = retainComponentParts(object.id, partsOf(object));
    const tracker = trackDisposals(
      retained.data.parts.map((part) => part.geometry),
    );
    const createdBefore = partsGeometryLifecycle.created;
    const disposedBefore = partsGeometryLifecycle.disposed;

    retained.release(); // nunca adoptada → no-op honesto

    expect(disposalsOf(tracker)).toBe(0);
    expect(partsGeometryLifecycle.created).toBe(createdBefore);
    expect(partsGeometryLifecycle.disposed).toBe(disposedBefore);
    tracker.stop();
  });
});
