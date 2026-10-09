import { describe, expect, it } from 'vitest';
import type { WardrobeConfig } from '../src/contract/wardrobe-config.js';
import { calculateGeometry } from '../src/engine/geometry.js';
import {
  buildDoors,
  doorOpeningTransform,
} from '../src/engine/doors.js';
import { GeometryError } from '../src/errors.js';
import type {
  Door,
  DoorHandle,
} from '../src/types/door.js';
import type { Module } from '../src/types/module.js';
import type { Wardrobe } from '../src/types/wardrobe.js';

/**
 * 2400 mm, 3 módulos, estructura 18: útil 2364 − 36
 * (divisiones) = 2328 → 776 mm por módulo; alto
 * interior 2164 mm.
 */
const baseConfig: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'hanging' },
    { kind: 'drawers' },
  ],
  materials: {
    structure: { name: 'Roble', thicknessMm: 18, finish: 'mate' },
    interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
  },
};

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la función lanzara');
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Wardrobe mínima para probar buildDoors directamente. */
function makeWardrobe(
  overrides: Partial<Wardrobe> = {},
): Wardrobe {
  const modules: Module[] = [
    {
      id: 'module-1',
      kind: 'shelves',
      widthMm: 776,
      heightMm: 2164,
      depthMm: 600,
      shelves: 3,
    },
  ];
  return {
    widthMm: 2400,
    heightMm: 2200,
    depthMm: 600,
    modules,
    materials: {
      structure: {
        id: 'material-structure',
        name: 'Roble',
        thicknessMm: 18,
        finish: 'mate',
      },
      interior: {
        id: 'material-interior',
        name: 'Blanco',
        thicknessMm: 15,
        finish: 'mate',
      },
      door: {
        id: 'material-door',
        name: 'Roble',
        thicknessMm: 18,
        finish: 'mate',
      },
      handle: {
        id: 'material-handle',
        name: 'Acero',
        finish: 'brillo',
      },
    },
    doorsConfig: {
      leaves: 1,
      hingeSide: 'left',
      clearanceMm: 3,
    },
    ...overrides,
  };
}

describe('buildDoors — una hoja (defaults)', () => {
  const config: WardrobeConfig = {
    ...baseConfig,
    doors: { leaves: 1 },
  };
  const result = calculateGeometry(config);

  it('activa las puertas por presencia: una hoja por módulo', () => {
    expect(result.doors).toHaveLength(3);
    expect(result.handles).toHaveLength(3);
    expect(result.totals.doorCount).toBe(3);
    expect(result.totals.handleCount).toBe(3);
  });

  it('ids deterministas y referencia al módulo', () => {
    const door = result.doors[0];
    expect(door).toBeDefined();
    expect(door?.id).toBe('door-module-1-1');
    expect(door?.moduleId).toBe('module-1');
    expect(door?.leafIndex).toBe(1);
    expect(door?.leafCount).toBe(1);
    expect(door?.hingeSide).toBe('left');
  });

  it('dimensiones: abertura menos holgura de 3 mm por lado', () => {
    const door = result.doors[0];
    expect(door).toBeDefined();
    expect(door?.widthMm).toBe(776 - 2 * 3); // 770
    expect(door?.heightMm).toBe(2164 - 2 * 3); // 2158
    expect(door?.thicknessMm).toBe(18); // default: estructura
  });

  it('posición cerrada: dentro de la abertura, z en [-espesor, 0]', () => {
    const door = result.doors[0];
    expect(door).toBeDefined();
    // Módulo 1 empieza en x = 18; hoja a 3 mm del borde.
    expect(door?.positionMm.x).toBe(18 + 3);
    expect(door?.positionMm.y).toBe(18 + 3);
    expect(door?.positionMm.z).toBe(-18);
  });

  it('material de hoja resuelto con id estable (default: estructura)', () => {
    expect(result.doors[0]?.materialId).toBe('material-door');
    expect(result.wardrobe.materials.door).toEqual({
      id: 'material-door',
      name: 'Roble',
      thicknessMm: 18,
      finish: 'mate',
    });
  });

  it('tirador: cilindro horizontal de longitud acotada (40% de la hoja)', () => {
    const handle = result.handles[0];
    expect(handle).toBeDefined();
    expect(handle?.id).toBe('handle-door-module-1-1');
    expect(handle?.doorId).toBe('door-module-1-1');
    expect(handle?.moduleId).toBe('module-1');
    expect(handle?.axis).toBe('x');
    // 770 × 0.4 = 308 → acotado a 120 mm.
    expect(handle?.lengthMm).toBe(120);
    expect(handle?.diameterMm).toBe(18);
    expect(handle?.materialId).toBe('material-handle');
    expect(result.wardrobe.materials.handle).toEqual({
      id: 'material-handle',
      name: 'Acero',
      finish: 'brillo',
    });
  });

  it('tirador: a 30 mm del borde libre, centrado verticalmente, contra la cara frontal', () => {
    const handle = result.handles[0];
    expect(handle).toBeDefined();
    // Borde libre = 21 + 770 = 791; centro = 791 − 30 − 60 = 701.
    expect(handle?.positionMm.x).toBe(701 - 60); // 641
    // Centro Y = 21 + 2158/2 = 1100; bbox Y = 1100 − 9.
    expect(handle?.positionMm.y).toBe(1100 - 9); // 1091
    // Centro Z = −18 − 9 = −27; bbox Z = −27 − 9.
    expect(handle?.positionMm.z).toBe(-27 - 9); // −36
  });

  it('sin puertas: ausencia del campo desactiva la generación', () => {
    const withoutDoors = calculateGeometry(baseConfig);
    expect(withoutDoors.doors).toHaveLength(0);
    expect(withoutDoors.handles).toHaveLength(0);
    expect(withoutDoors.totals.doorCount).toBe(0);
    expect(withoutDoors.totals.handleCount).toBe(0);
    expect(withoutDoors.wardrobe.doorsConfig).toBeUndefined();
    expect(withoutDoors.wardrobe.materials.door).toBeUndefined();
  });
});

describe('buildDoors — dos hojas', () => {
  const config: WardrobeConfig = {
    ...baseConfig,
    doors: { leaves: 2 },
  };
  const result = calculateGeometry(config);

  it('genera dos hojas por módulo con bisagras en los extremos exteriores', () => {
    expect(result.doors).toHaveLength(6);
    const leaf1 = result.doors[0];
    const leaf2 = result.doors[1];
    expect(leaf1).toBeDefined();
    expect(leaf2).toBeDefined();
    expect(leaf1?.id).toBe('door-module-1-1');
    expect(leaf1?.hingeSide).toBe('left');
    expect(leaf2?.id).toBe('door-module-1-2');
    expect(leaf2?.hingeSide).toBe('right');
  });

  it('reparte el ancho útil con holgura entre hojas; el residuo queda a la derecha', () => {
    const leaf1 = result.doors[0];
    const leaf2 = result.doors[1];
    expect(leaf1).toBeDefined();
    expect(leaf2).toBeDefined();
    // (776 − 6 − 3) / 2 = 383.5 → 383; residuo 1 mm a la derecha.
    expect(leaf1?.widthMm).toBe(383);
    expect(leaf2?.widthMm).toBe(383);
    // Hoja 1: x = 18 + 3 = 21.
    expect(leaf1?.positionMm.x).toBe(21);
    // Hoja 2: x = 21 + 383 + 3 = 407; su borde derecho (790) queda
    // a 4 mm del borde del módulo (794): holgura 3 + residuo 1.
    expect(leaf2?.positionMm.x).toBe(407);
  });

  it('tiradores en los bordes libres opuestos (extremos exteriores)', () => {
    const handle1 = result.handles[0];
    const handle2 = result.handles[1];
    expect(handle1).toBeDefined();
    expect(handle2).toBeDefined();
    // Hoja 1 (bisagra izquierda): borde libre = 21 + 383 = 404;
    // centro = 404 − 30 − 60 = 314.
    expect(handle1?.positionMm.x).toBe(314 - 60); // 254
    // Hoja 2 (bisagra derecha): borde libre = 407;
    // centro = 407 + 30 + 60 = 497.
    expect(handle2?.positionMm.x).toBe(497 - 60); // 437
  });
});

describe('buildDoors — bisagra derecha (una hoja)', () => {
  const config: WardrobeConfig = {
    ...baseConfig,
    doors: { leaves: 1, hingeSide: 'right' },
  };
  const result = calculateGeometry(config);

  it('usa el lado de bisagra configurado', () => {
    expect(result.doors[0]?.hingeSide).toBe('right');
  });

  it('coloca el tirador junto al borde libre izquierdo', () => {
    const handle = result.handles[0];
    expect(handle).toBeDefined();
    // Borde libre = 21; centro = 21 + 30 + 60 = 111.
    expect(handle?.positionMm.x).toBe(111 - 60); // 51
  });
});

describe('buildDoors — materiales y holguras configurados', () => {
  it('doors.material tiene prioridad sobre materials.door (default: estructura)', () => {
    const result = calculateGeometry({
      ...baseConfig,
      doors: {
        leaves: 1,
        material: {
          name: 'Nogal',
          thicknessMm: 15,
          finish: 'mate',
        },
      },
    });
    expect(result.wardrobe.materials.door).toEqual({
      id: 'material-door',
      name: 'Nogal',
      thicknessMm: 15,
      finish: 'mate',
    });
    expect(result.doors[0]?.thicknessMm).toBe(15);
    expect(result.doors[0]?.positionMm.z).toBe(-15);
  });

  it('materials.door se usa cuando doors.material está ausente', () => {
    const result = calculateGeometry({
      ...baseConfig,
      materials: {
        ...baseConfig.materials,
        door: {
          name: 'Fresno',
          thicknessMm: 15,
          finish: 'natural',
        },
      },
      doors: { leaves: 1 },
    });
    expect(result.wardrobe.materials.door?.name).toBe('Fresno');
    expect(result.doors[0]?.thicknessMm).toBe(15);
  });

  it('holgura configurable (clearanceMm)', () => {
    const result = calculateGeometry({
      ...baseConfig,
      doors: { leaves: 1, clearanceMm: 5 },
    });
    expect(result.doors[0]?.widthMm).toBe(776 - 2 * 5); // 766
    expect(result.doors[0]?.heightMm).toBe(2164 - 2 * 5); // 2154
    expect(result.doors[0]?.positionMm.x).toBe(18 + 5); // 23
  });
});

describe('doorOpeningTransform', () => {
  const wardrobe = makeWardrobe();
  const { doors } = buildDoors(wardrobe);
  const door = doors[0];

  it('calcula el eje de bisagra y el desplazamiento del centro (bisagra izquierda)', () => {
    expect(door).toBeDefined();
    const transform = doorOpeningTransform(door!, 90);
    expect(transform.hingeXmm).toBe(21);
    // Plano medio del espesor (18 / 2): refinamiento de la
    // Fase 3A con evidencia de intersección a ≥ ~44°.
    expect(transform.hingeZmm).toBe(-9);
    expect(transform.centerOffsetMm).toEqual({ x: 385, z: 0 });
    expect(transform.signedAngleRad).toBeCloseTo(Math.PI / 2);
  });

  it('firma el ángulo negativo con bisagra derecha', () => {
    const rightWardrobe = makeWardrobe({
      doorsConfig: {
        leaves: 1,
        hingeSide: 'right',
        clearanceMm: 3,
      },
    });
    const rightDoor = buildDoors(rightWardrobe).doors[0];
    expect(rightDoor).toBeDefined();
    const transform = doorOpeningTransform(rightDoor!, 90);
    expect(transform.hingeXmm).toBe(21 + 770); // 791
    expect(transform.hingeZmm).toBe(-9);
    expect(transform.centerOffsetMm).toEqual({ x: -385, z: 0 });
    expect(transform.signedAngleRad).toBeCloseTo(-Math.PI / 2);
  });

  it('ángulo 0 (cerrada) y máximo 110°', () => {
    expect(door).toBeDefined();
    expect(doorOpeningTransform(door!, 0).signedAngleRad).toBe(0);
    expect(
      doorOpeningTransform(door!, 110).signedAngleRad,
    ).toBeCloseTo((110 * Math.PI) / 180);
  });

  it('rechaza ángulos fuera de [0, 110] o no numéricos (ERR_DOOR_OPEN_ANGLE)', () => {
    expect(door).toBeDefined();
    for (const angle of [-1, 111, 150, NaN, Infinity, '90', null]) {
      const error = errorOf(() =>
        doorOpeningTransform(door!, angle as number),
      );
      expect(error).toBeInstanceOf(GeometryError);
      expect((error as GeometryError).code).toBe(
        'ERR_DOOR_OPEN_ANGLE',
      );
    }
  });

  it('es pura: no muta la puerta (objeto congelado)', () => {
    const frozen = deepFreeze(door);
    expect(() => doorOpeningTransform(frozen!, 45)).not.toThrow();
  });
});

describe('buildDoors — validación defensiva', () => {
  it('lanza ERR_DOOR_WIDTH_INSUFFICIENT si la abertura no admite hojas', () => {
    const tiny = makeWardrobe({
      modules: [
        {
          id: 'module-1',
          kind: 'shelves',
          widthMm: 4, // < 2 × holgura (6 mm)
          heightMm: 2164,
          depthMm: 600,
          shelves: 3,
        },
      ],
    });
    const error = errorOf(() => buildDoors(tiny));
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe(
      'ERR_DOOR_WIDTH_INSUFFICIENT',
    );
  });

  it('sin material de puerta resuelto: no genera puertas', () => {
    const noDoorMaterial = makeWardrobe({
      materials: {
        structure: {
          id: 'material-structure',
          name: 'Roble',
          thicknessMm: 18,
          finish: 'mate',
        },
        interior: {
          id: 'material-interior',
          name: 'Blanco',
          thicknessMm: 15,
          finish: 'mate',
        },
      },
    });
    expect(noDoorMaterial.materials.door).toBeUndefined();
    const { doors, handles } = buildDoors(noDoorMaterial);
    expect(doors).toHaveLength(0);
    expect(handles).toHaveLength(0);
  });
});

/**
 * Huellas rotadas de hojas y tiradores (plano XZ).
 *
 * Verifican el contrato de presentación de la Fase 2C: la
 * apertura es una rotación rígida alrededor del eje de
 * bisagra (vertical, en el plano medio del espesor de la
 * hoja) con la convención de three.js (`rotation.y = θ`):
 *
 *   x' = hingeX + dx·cosθ + dz·sinθ
 *   z' = hingeZ − dx·sinθ + dz·cosθ
 *
 * con (dx, dz) = esquina cerrada − eje de bisagra.
 */
describe('doorOpeningTransform — sin intersecciones (huellas rotadas)', () => {
  /**
   * Rango limpio: todas las hojas del visor se abren con el
   * mismo ángulo y en [0°, 85°] no se corta ningún par.
   */
  const CLEAN_ANGLES = [0, 5, 15, 30, 45, 60, 75, 85];
  /**
   * Rango de bloqueo mutuo físico: más allá de ~90°, las
   * hojas interiores adyacentes no pueden coexistir (en la
   * realidad se bloquean). El modelo admite el rango
   * PROVISIONAL de 110° con solapes acotados y confinados.
   */
  const BLOCK_ANGLES = [90, 92, 95, 100, 105, 110];

  type Point2 = { x: number; z: number };

  /** Esquinas de la hoja CERRADA en el plano XZ. */
  function closedCorners(door: Door): Point2[] {
    const { x, z } = door.positionMm;
    const { widthMm, thicknessMm } = door;
    return [
      { x, z },
      { x: x + widthMm, z },
      { x: x + widthMm, z: z + thicknessMm },
      { x, z: z + thicknessMm },
    ];
  }

  /** Huella XZ de una hoja tras rotar `angleDeg` grados. */
  function rotatedFootprint(
    door: Door,
    angleDeg: number,
  ): Point2[] {
    const { hingeXmm, hingeZmm, signedAngleRad } =
      doorOpeningTransform(door, angleDeg);
    const cos = Math.cos(signedAngleRad);
    const sin = Math.sin(signedAngleRad);
    return closedCorners(door).map((corner) => {
      const dx = corner.x - hingeXmm;
      const dz = corner.z - hingeZmm;
      return {
        x: hingeXmm + dx * cos + dz * sin,
        z: hingeZmm - dx * sin + dz * cos,
      };
    });
  }

  /**
   * Huella XZ del tirador (cilindro a lo ancho: su caja
   * en el plano mide lengthMm × diameterMm) rotada con la
   * transformación de su puerta.
   */
  function rotatedHandleFootprint(
    handle: DoorHandle,
    door: Door,
    angleDeg: number,
  ): Point2[] {
    const { hingeXmm, hingeZmm, signedAngleRad } =
      doorOpeningTransform(door, angleDeg);
    const cos = Math.cos(signedAngleRad);
    const sin = Math.sin(signedAngleRad);
    const { x, z } = handle.positionMm;
    const corners: Point2[] = [
      { x, z },
      { x: x + handle.lengthMm, z },
      {
        x: x + handle.lengthMm,
        z: z + handle.diameterMm,
      },
      { x, z: z + handle.diameterMm },
    ];
    return corners.map((corner) => {
      const dx = corner.x - hingeXmm;
      const dz = corner.z - hingeZmm;
      return {
        x: hingeXmm + dx * cos + dz * sin,
        z: hingeZmm - dx * sin + dz * cos,
      };
    });
  }

  /** Solapamiento 2D de polígonos convexos (SAT). */
  function footprintsOverlap(
    a: Point2[],
    b: Point2[],
  ): boolean {
    for (const polygon of [a, b]) {
      for (let i = 0; i < polygon.length; i++) {
        const p1 = polygon[i]!;
        const p2 = polygon[(i + 1) % polygon.length]!;
        const axis = {
          x: -(p2.z - p1.z),
          z: p2.x - p1.x,
        };
        const project = (poly: Point2[]) =>
          poly.reduce(
            (ext, point) => ({
              min: Math.min(
                ext.min,
                point.x * axis.x + point.z * axis.z,
              ),
              max: Math.max(
                ext.max,
                point.x * axis.x + point.z * axis.z,
              ),
            }),
            { min: Infinity, max: -Infinity },
          );
        const pa = project(a);
        const pb = project(b);
        if (pa.max < pb.min || pb.max < pa.min) {
          return false;
        }
      }
    }
    return true;
  }

  /** Intersección A ∩ B de polígonos convexos (Sutherland–Hodgman). */
  function clipPolygons(a: Point2[], b: Point2[]): Point2[] {
    const intersect = (
      p1: Point2,
      p2: Point2,
      c1: Point2,
      c2: Point2,
    ): Point2 => {
      const r = { x: p2.x - p1.x, z: p2.z - p1.z };
      const s = { x: c2.x - c1.x, z: c2.z - c1.z };
      const denominator = r.x * s.z - r.z * s.x;
      const t =
        ((c1.x - p1.x) * s.z - (c1.z - p1.z) * s.x) /
        denominator;
      return {
        x: p1.x + t * r.x,
        z: p1.z + t * r.z,
      };
    };
    let output = a;
    for (let i = 0; i < b.length; i++) {
      const c1 = b[i]!;
      const c2 = b[(i + 1) % b.length]!;
      const inside = (point: Point2): boolean =>
        (c2.x - c1.x) * (point.z - c1.z) -
          (c2.z - c1.z) * (point.x - c1.x) >=
        0;
      const input = output;
      output = [];
      for (let j = 0; j < input.length; j++) {
        const current = input[j]!;
        const previous =
          input[(j + input.length - 1) % input.length]!;
        if (inside(current)) {
          if (!inside(previous)) {
            output.push(
              intersect(previous, current, c1, c2),
            );
          }
          output.push(current);
        } else if (inside(previous)) {
          output.push(intersect(previous, current, c1, c2));
        }
      }
      if (output.length === 0) {
        return [];
      }
    }
    return output;
  }

  /** Área (mm²) de un polígono convexo por la fórmula del zapatero. */
  function polygonArea(polygon: Point2[]): number {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i]!;
      const p2 = polygon[(i + 1) % polygon.length]!;
      area += p1.x * p2.z - p2.x * p1.z;
    }
    return Math.abs(area) / 2;
  }

  it('las dos hojas de un módulo no se cruzan en ningún ángulo (0–110°)', () => {
    const wardrobe = makeWardrobe({
      doorsConfig: {
        leaves: 2,
        hingeSide: 'left',
        clearanceMm: 3,
      },
    });
    const { doors } = buildDoors(wardrobe);
    expect(doors).toHaveLength(2);
    const [left, right] = [doors[0]!, doors[1]!];
    for (const angle of [
      ...CLEAN_ANGLES,
      ...BLOCK_ANGLES,
    ]) {
      expect(
        footprintsOverlap(
          rotatedFootprint(left, angle),
          rotatedFootprint(right, angle),
        ),
      ).toBe(false);
    }
  });

  it('hojas de módulos distintos no se cruzan en [0°, 85°]', () => {
    const result = calculateGeometry({
      ...baseConfig,
      doors: { leaves: 2 },
    });
    expect(result.doors).toHaveLength(6);
    for (const angle of CLEAN_ANGLES) {
      const footprints = result.doors.map((door) => ({
        door,
        footprint: rotatedFootprint(door, angle),
      }));
      for (let i = 0; i < footprints.length; i++) {
        for (let j = i + 1; j < footprints.length; j++) {
          const pairI = footprints[i]!;
          const pairJ = footprints[j]!;
          if (pairI.door.moduleId === pairJ.door.moduleId) {
            continue; // cubierto por la prueba anterior
          }
          expect(
            footprintsOverlap(
              pairI.footprint,
              pairJ.footprint,
            ),
          ).toBe(false);
        }
      }
    }
  });

  it('en [90°, 110°] el solape queda confinado al bloqueo mutuo de hojas interiores adyacentes (≤ 3000 mm², columna del divisor)', () => {
    // Límite físico real: dos hojas interiores adyacentes
    // abiertas SIMULTÁNEAMENTE más allá de ~90° no pueden
    // coexistir (en carpintería real se bloquean entre sí).
    // El modelo lo representa como un solape fino confinado
    // a la columna del divisor (x del divisor ± 1 mm) con
    // área ≤ 3000 mm² (máx. medido: 2746 mm² a 92°). Ningún
    // otro par se solapa; si carpintería fija un ángulo
    // común ≤ 90°, este rango desaparece.
    const result = calculateGeometry({
      ...baseConfig,
      doors: { leaves: 2 },
    });
    const moduleIndex = new Map(
      result.wardrobe.modules.map((module, index) => [
        module.id,
        index,
      ]),
    );
    const areAdjacentInnerLeaves = (a: Door, b: Door) => {
      const indexA = moduleIndex.get(a.moduleId)!;
      const indexB = moduleIndex.get(b.moduleId)!;
      if (Math.abs(indexA - indexB) !== 1) return false;
      const [left, right] =
        indexA < indexB ? [a, b] : [b, a];
      return (
        left.hingeSide === 'right' &&
        right.hingeSide === 'left'
      );
    };
    for (const angle of BLOCK_ANGLES) {
      const footprints = result.doors.map((door) => ({
        door,
        footprint: rotatedFootprint(door, angle),
      }));
      for (let i = 0; i < footprints.length; i++) {
        for (let j = i + 1; j < footprints.length; j++) {
          const pairI = footprints[i]!;
          const pairJ = footprints[j]!;
          if (
            !footprintsOverlap(
              pairI.footprint,
              pairJ.footprint,
            )
          ) {
            continue;
          }
          expect(
            areAdjacentInnerLeaves(
              pairI.door,
              pairJ.door,
            ),
          ).toBe(true);
          const clipped = clipPolygons(
            pairI.footprint,
            pairJ.footprint,
          );
          expect(polygonArea(clipped)).toBeLessThan(3000);
          // Confinado a la columna del divisor: los módulos
          // de 776 mm con divisor de 18 mm delimitan el
          // solape a ≤ 20 mm de ancho.
          const xs = clipped.map((point) => point.x);
          expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('los tiradores no chocan con ninguna hoja ni entre sí en [0°, 85°]', () => {
    const result = calculateGeometry({
      ...baseConfig,
      doors: { leaves: 2 },
    });
    const doorById = new Map(
      result.doors.map((door) => [door.id, door]),
    );
    for (const angle of CLEAN_ANGLES) {
      const leaves = result.doors.map((door) =>
        rotatedFootprint(door, angle),
      );
      for (const handle of result.handles) {
        const owner = doorById.get(handle.doorId);
        expect(owner).toBeDefined();
        const handlePrint = rotatedHandleFootprint(
          handle,
          owner!,
          angle,
        );
        // Su hoja propia: montado contra su cara frontal
        // (contacto de montaje, no intersección).
        result.doors.forEach((door, index) => {
          if (door.id === handle.doorId) {
            return;
          }
          expect(
            footprintsOverlap(handlePrint, leaves[index]!),
          ).toBe(false);
        });
      }
      // Tirador contra tirador (todos los pares).
      const handlePrints = result.handles.map(
        (handle) => ({
          handle,
          footprint: rotatedHandleFootprint(
            handle,
            doorById.get(handle.doorId)!,
            angle,
          ),
        }),
      );
      for (let i = 0; i < handlePrints.length; i++) {
        for (let j = i + 1; j < handlePrints.length; j++) {
          expect(
            footprintsOverlap(
              handlePrints[i]!.footprint,
              handlePrints[j]!.footprint,
            ),
          ).toBe(false);
        }
      }
    }
  });

  it('en [90°, 110°] un tirador solo puede solaparse con la hoja interior adyacente o su tirador (≤ 2500 mm²)', () => {
    // Mismo bloqueo mutuo físico anterior: en la banda
    // ~88–91° los tiradores de las hojas interiores
    // adyacentes (y estos contra la hoja vecina) se solapan
    // unos milímetros en la columna del divisor (máx.
    // medido: 2016 mm² entre tiradores a 89°; 1320 mm²
    // tirador-hoja a 90°). Fuera de esa banda, limpio.
    const result = calculateGeometry({
      ...baseConfig,
      doors: { leaves: 2 },
    });
    const doorById = new Map(
      result.doors.map((door) => [door.id, door]),
    );
    const moduleIndex = new Map(
      result.wardrobe.modules.map((module, index) => [
        module.id,
        index,
      ]),
    );
    const isAdjacentOppositeInner = (
      owner: Door,
      other: Door,
    ): boolean => {
      const ownerIndex = moduleIndex.get(owner.moduleId)!;
      const otherIndex = moduleIndex.get(other.moduleId)!;
      return (
        Math.abs(ownerIndex - otherIndex) === 1 &&
        owner.hingeSide !== other.hingeSide
      );
    };
    for (const angle of BLOCK_ANGLES) {
      const leaves = result.doors.map((door) =>
        rotatedFootprint(door, angle),
      );
      for (const handle of result.handles) {
        const owner = doorById.get(handle.doorId)!;
        const handlePrint = rotatedHandleFootprint(
          handle,
          owner,
          angle,
        );
        result.doors.forEach((door, index) => {
          if (door.id === handle.doorId) {
            return;
          }
          if (
            !footprintsOverlap(handlePrint, leaves[index]!)
          ) {
            return;
          }
          expect(
            isAdjacentOppositeInner(owner, door),
          ).toBe(true);
          const clipped = clipPolygons(
            handlePrint,
            leaves[index]!,
          );
          expect(polygonArea(clipped)).toBeLessThan(1500);
          const xs = clipped.map((point) => point.x);
          expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(15);
        });
      }
      // Tirador contra tirador: solo el par interior
      // adyacente, con los mismos límites de confinamiento.
      const handlePrints = result.handles.map(
        (handle) => ({
          handle,
          owner: doorById.get(handle.doorId)!,
          footprint: rotatedHandleFootprint(
            handle,
            doorById.get(handle.doorId)!,
            angle,
          ),
        }),
      );
      for (let i = 0; i < handlePrints.length; i++) {
        for (let j = i + 1; j < handlePrints.length; j++) {
          const pairI = handlePrints[i]!;
          const pairJ = handlePrints[j]!;
          if (
            !footprintsOverlap(
              pairI.footprint,
              pairJ.footprint,
            )
          ) {
            continue;
          }
          expect(
            isAdjacentOppositeInner(pairI.owner, pairJ.owner),
          ).toBe(true);
          const clipped = clipPolygons(
            pairI.footprint,
            pairJ.footprint,
          );
          expect(polygonArea(clipped)).toBeLessThan(2500);
          const xs = clipped.map((point) => point.x);
          expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('la rotación es rígida y el canto de bisagra gira sobre el eje', () => {
    const door = buildDoors(makeWardrobe()).doors[0]!;
    for (const angle of [30, 75, 110]) {
      const transform = doorOpeningTransform(door, angle);
      const footprint = rotatedFootprint(door, angle);
      const edge = (i: number): number => {
        const p1 = footprint[i]!;
        const p2 = footprint[(i + 1) % 4]!;
        return Math.hypot(p2.x - p1.x, p2.z - p1.z);
      };
      expect(edge(0)).toBeCloseTo(door.widthMm, 6);
      expect(edge(1)).toBeCloseTo(door.thicknessMm, 6);
      expect(edge(2)).toBeCloseTo(door.widthMm, 6);
      expect(edge(3)).toBeCloseTo(door.thicknessMm, 6);
      // Bisagra izquierda: el punto medio del canto de la
      // bisagra (esquinas 0 y 3) ES el eje y no se mueve.
      const [hingeCornerA, hingeCornerB] = [
        footprint[0]!,
        footprint[3]!,
      ];
      const midpoint = {
        x: (hingeCornerA.x + hingeCornerB.x) / 2,
        z: (hingeCornerA.z + hingeCornerB.z) / 2,
      };
      expect(midpoint.x).toBeCloseTo(transform.hingeXmm, 6);
      expect(midpoint.z).toBeCloseTo(transform.hingeZmm, 6);
    }
  });

  it('la hoja permanece en el semiespacio frontal (z ≤ 0) en todo el rango [0°, 110°]', () => {
    // Con el eje a mitad de espesor, el canto trasero se
    // acerca al plano frontal pero nunca lo rebasa
    // (z máx = −(espesor/2)·(1 − |cos α|); −5.9 mm a 110°
    // con 18 mm). La hoja jamás entra en el cuerpo del
    // mueble (que vive en z ≥ 0): sin mordeduras ni
    // artefactos en ningún ángulo.
    const door = buildDoors(makeWardrobe()).doors[0]!;
    for (const angle of [
      ...CLEAN_ANGLES,
      ...BLOCK_ANGLES,
    ]) {
      for (const corner of rotatedFootprint(door, angle)) {
        expect(corner.z).toBeLessThanOrEqual(1e-9);
      }
    }
  });
});
