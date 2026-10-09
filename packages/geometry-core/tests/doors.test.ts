import { describe, expect, it } from 'vitest';
import type { WardrobeConfig } from '../src/contract/wardrobe-config.js';
import { calculateGeometry } from '../src/engine/geometry.js';
import {
  buildDoors,
  doorOpeningTransform,
} from '../src/engine/doors.js';
import { GeometryError } from '../src/errors.js';
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
    expect(transform.hingeZmm).toBe(0);
    expect(transform.centerOffsetMm).toEqual({ x: 385, z: -9 });
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
    expect(transform.centerOffsetMm).toEqual({ x: -385, z: -9 });
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
