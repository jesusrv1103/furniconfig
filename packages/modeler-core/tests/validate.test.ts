/**
 * Pruebas de `validateSceneDocument` (FASE-4B-A).
 *
 * Cubre, según el pedido de la fase: documento vacío, determinismo, objetos
 * válidos, IDs duplicados, referencias inválidas, transformaciones, croquis
 * degenerados, datos corruptos/hostiles, inmutabilidad y los nueve códigos
 * `ERR_SCENE_*` del contrato de arquitectura.
 */

import { describe, expect, it } from 'vitest';
import { SceneError, type SceneErrorCode, type SceneIssue } from '../src/errors.js';
import { SCENE_LIMITS } from '../src/limits.js';
import type {
  SceneDocument,
  SceneObject,
} from '../src/types/document.js';
import { validateSceneDocument } from '../src/validate.js';
import type { SceneValidationResult } from '../src/validate.js';
import {
  asDocument,
  baseComponent,
  baseMaterial,
  baseSolid,
  boxComponentRegistry,
  componentDocumentInput,
  emptyDocumentInput,
  patchObject,
  rectSketch,
  solidDocumentInput,
} from './fixtures.js';

function expectValid(result: SceneValidationResult): SceneDocument {
  if (!result.ok) {
    throw new Error(
      `se esperaba un documento válido, errores: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.document;
}

function expectInvalid(result: SceneValidationResult): SceneIssue[] {
  if (result.ok) {
    throw new Error('se esperaba un resultado inválido');
  }
  return result.errors;
}

function codesOf(errors: readonly SceneIssue[]): SceneErrorCode[] {
  return errors.map((error) => error.code);
}

describe('SceneError', () => {
  it('transporta código estable y detalles (patrón GeometryError)', () => {
    const error = new SceneError('ERR_SCENE_INVALID_VERSION', 'mal', {
      version: 2,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SceneError');
    expect(error.code).toBe('ERR_SCENE_INVALID_VERSION');
    expect(error.details).toEqual({ version: 2 });
  });
});

describe('validateSceneDocument — casos nominales', () => {
  it('acepta un documento vacío', () => {
    const document = expectValid(validateSceneDocument(emptyDocumentInput()));
    expect(document.objects).toEqual([]);
    expect(document.materials).toEqual([]);
  });

  it('acepta el documento vacío congelado de createEmptySceneDocument', () => {
    expectValid(validateSceneDocument(emptyDocumentInput()));
  });

  it('acepta un sólido nominal (croquis recto + extrusión)', () => {
    const document = expectValid(
      validateSceneDocument(solidDocumentInput()),
    );
    const [object] = document.objects;
    expect(object?.kind).toBe('solid');
    if (object?.kind !== 'solid') return;
    expect(object.geometry.source).toBe('sketch');
    expect(document.materials).toHaveLength(1);
  });

  it('acepta un componente con parámetros válidos usando el registro', () => {
    const document = expectValid(
      validateSceneDocument(componentDocumentInput(), {
        components: boxComponentRegistry,
      }),
    );
    const [object] = document.objects;
    expect(object?.kind).toBe('component');
    expect(object && 'params' in object ? object.params : undefined).toEqual({
      widthMm: 600,
      label: 'Caja alta',
      lid: true,
    });
  });

  it('acepta un componente sin registro (validación solo estructural)', () => {
    const input = componentDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = { ...(objects[0] as object), type: 'tipo.sin.registro' };
    expectValid(validateSceneDocument(input));
  });

  it('acepta geometría de referencia kernel con clave no vacía', () => {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = {
      ...(objects[0] as object),
      geometry: { source: 'kernel', key: 'hash-abc123' },
    };
    expectValid(validateSceneDocument(input));
  });

  it('acepta extrusión en los extremos del rango', () => {
    for (const extrusionMm of [
      SCENE_LIMITS.extrusionMm.min,
      SCENE_LIMITS.extrusionMm.max,
    ]) {
      const input = solidDocumentInput();
      const objects = input.objects as Array<Record<string, unknown>>;
      const geometry = (objects[0] as { geometry: Record<string, unknown> })
        .geometry;
      geometry.extrusionMm = extrusionMm;
      expectValid(validateSceneDocument(input));
    }
  });
});

describe('validateSceneDocument — versión y raíz', () => {
  it('rechaza entradas que no son objetos', () => {
    for (const input of [null, undefined, [], 'texto', 42, true]) {
      const errors = expectInvalid(validateSceneDocument(input));
      expect(codesOf(errors)).toEqual(['ERR_SCENE_INVALID_OBJECT']);
      expect(errors[0]?.field).toBe('root');
    }
  });

  it('rechaza documentVersion ausente, distinto o mal tipado', () => {
    for (const version of [undefined, 2, 0, '1', 1.5, null]) {
      const input = emptyDocumentInput();
      input.documentVersion = version;
      const errors = expectInvalid(validateSceneDocument(input));
      expect(codesOf(errors)).toContain('ERR_SCENE_INVALID_VERSION');
    }
  });

  it('rechaza id o nombre del documento vacíos', () => {
    for (const field of ['id', 'name'] as const) {
      const input = emptyDocumentInput();
      input[field] = '';
      const errors = expectInvalid(validateSceneDocument(input));
      expect(codesOf(errors)).toContain('ERR_SCENE_INVALID_OBJECT');
      expect(errors.some((error) => error.field === field)).toBe(true);
    }
  });

  it('rechaza gridStepMm fuera de rango o no entero', () => {
    for (const gridStepMm of [0, 1001, 10.5, NaN, Infinity, '10']) {
      const input = emptyDocumentInput();
      input.gridStepMm = gridStepMm;
      const errors = expectInvalid(validateSceneDocument(input));
      expect(errors.some((error) => error.field === 'gridStepMm')).toBe(true);
    }
  });

  it('rechaza originMm no entero o mal formado', () => {
    for (const originMm of [
      [0, 0],
      [0, 0, 0.5],
      [0, NaN, 0],
      [0, Infinity, 0],
      'origen',
      SCENE_LIMITS.coordinateMm.max + 1,
    ]) {
      const input = emptyDocumentInput();
      input.originMm = originMm;
      const errors = expectInvalid(validateSceneDocument(input));
      expect(codesOf(errors)).toContain('ERR_SCENE_TRANSFORM_INVALID');
    }
  });
});

describe('validateSceneDocument — IDs duplicados', () => {
  it('detecta ids de objeto duplicados', () => {
    const input = solidDocumentInput();
    const objects = input.objects as unknown[];
    objects.push({ ...(objects[0] as object) });
    const errors = expectInvalid(validateSceneDocument(input));
    expect(codesOf(errors)).toContain('ERR_SCENE_DUPLICATE_ID');
    expect(errors.some((error) => error.field === 'objects[1].id')).toBe(true);
  });

  it('detecta ids de material duplicados', () => {
    const input = solidDocumentInput();
    const materials = input.materials as unknown[];
    materials.push({ ...(materials[0] as object) });
    const errors = expectInvalid(validateSceneDocument(input));
    expect(codesOf(errors)).toContain('ERR_SCENE_DUPLICATE_ID');
  });

  it('no confunde ids distintos que comparten prefijo', () => {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects.push({
      ...(objects[0] as object),
      id: 'object-10',
      transform: { positionMm: [20, 0, 0] },
    });
    expectValid(validateSceneDocument(input));
  });
});

describe('validateSceneDocument — referencias y materiales', () => {
  it('rechaza materialId inexistente', () => {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = { ...(objects[0] as object), materialId: 'material-99' };
    const errors = expectInvalid(validateSceneDocument(input));
    expect(codesOf(errors)).toContain('ERR_SCENE_UNKNOWN_MATERIAL');
  });

  it('rechaza materialId vacío como forma inválida', () => {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = { ...(objects[0] as object), materialId: '' };
    const errors = expectInvalid(validateSceneDocument(input));
    expect(codesOf(errors)).toContain('ERR_SCENE_INVALID_OBJECT');
  });

  it('un material inválido no provoca errores en cascada por objeto', () => {
    const input = solidDocumentInput();
    // finish ausente: el material entero es inválido.
    input.materials = [{ id: 'material-1', name: 'Roble', thicknessMm: 18 }];
    const errors = expectInvalid(validateSceneDocument(input));
    // Solo el error raíz en materials; sin UNKNOWN_MATERIAL por el objeto.
    expect(codesOf(errors)).toEqual(['ERR_SCENE_INVALID_OBJECT']);
    expect(errors[0]?.field).toBe('materials[0]');
  });

  it('rechaza materials que no son lista y materiales mal formados', () => {
    const input = emptyDocumentInput();
    input.materials = 'no-lista';
    expect(
      codesOf(expectInvalid(validateSceneDocument(input))),
    ).toContain('ERR_SCENE_INVALID_OBJECT');

    for (const bad of [
      { id: '', name: 'X', finish: 'mate', thicknessMm: 18 },
      { id: 'm-1', name: 'X', finish: 'mate', thicknessMm: 0 },
      { id: 'm-1', name: 'X', finish: 'mate', thicknessMm: 1.5 },
      { id: 'm-1', name: 'X', finish: 'mate', thicknessMm: NaN },
      { id: 'm-1', name: 'X', finish: '', thicknessMm: 18 },
      'no-objeto',
    ]) {
      const doc = emptyDocumentInput();
      doc.materials = [bad];
      expect(
        codesOf(expectInvalid(validateSceneDocument(doc))),
      ).toContain('ERR_SCENE_INVALID_OBJECT');
    }
  });
});

describe('validateSceneDocument — transformaciones', () => {
  function withObjectPatch(
    patch: Record<string, unknown>,
  ): Record<string, unknown> {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = patchObject(baseSolid, patch);
    return input;
  }

  it('rechaza transform ausente o no objeto', () => {
    for (const transform of [undefined, null, 'x', [0, 0, 0]]) {
      const errors = expectInvalid(
        validateSceneDocument(withObjectPatch({ transform })),
      );
      expect(codesOf(errors)).toContain('ERR_SCENE_TRANSFORM_INVALID');
    }
  });

  it('rechaza positionMm no entero, no finito o mal formado', () => {
    for (const positionMm of [
      undefined,
      [0, 0],
      [0, 0, 0, 0],
      [0, 0, 1.5],
      [0, NaN, 0],
      [0, Infinity, 0],
      [0, -Infinity, 0],
      [0, SCENE_LIMITS.coordinateMm.max + 1, 0],
      [0, -(SCENE_LIMITS.coordinateMm.max + 1), 0],
      'origen',
    ]) {
      const errors = expectInvalid(
        validateSceneDocument(withObjectPatch({ transform: { positionMm } })),
      );
      expect(codesOf(errors)).toContain('ERR_SCENE_TRANSFORM_INVALID');
    }
  });

  it('acepta traslaciones negativas dentro de cota (I2 admite origen libre)', () => {
    expectValid(
      validateSceneDocument(
        withObjectPatch({ transform: { positionMm: [-100, 0, -50] } }),
      ),
    );
  });
});

describe('validateSceneDocument — croquis degenerados', () => {
  function withSketch(
    sketch: unknown,
    extrusionMm: unknown = 18,
  ): Record<string, unknown> {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = {
      ...(objects[0] as object),
      geometry: { source: 'sketch', sketch, extrusionMm },
    };
    return input;
  }

  it('rechaza un croquis con menos de 3 vértices', () => {
    const errors = expectInvalid(
      validateSceneDocument(
        withSketch({ ...rectSketch, pointsMm: [[0, 0], [100, 0]] }),
      ),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_DEGENERATE_SKETCH');
  });

  it('rechaza un croquis abierto', () => {
    const errors = expectInvalid(
      validateSceneDocument(withSketch({ ...rectSketch, closed: false })),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_DEGENERATE_SKETCH');
  });

  it('rechaza un croquis de área nula (colineal)', () => {
    const errors = expectInvalid(
      validateSceneDocument(
        withSketch({
          ...rectSketch,
          pointsMm: [
            [0, 0],
            [1200, 0],
            [2400, 0],
          ],
        }),
      ),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_DEGENERATE_SKETCH');
  });

  it('rechaza un bowtie (área shoelace 0) como degenerado', () => {
    const errors = expectInvalid(
      validateSceneDocument(
        withSketch({
          ...rectSketch,
          pointsMm: [
            [0, 0],
            [1200, 600],
            [1200, 0],
            [0, 600],
          ],
        }),
      ),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_DEGENERATE_SKETCH');
  });

  it('rechaza el primer vértice repetido al final', () => {
    const errors = expectInvalid(
      validateSceneDocument(
        withSketch({
          ...rectSketch,
          pointsMm: [...rectSketch.pointsMm, [0, 0] as const],
        }),
      ),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_DEGENERATE_SKETCH');
  });

  it('rechaza vértices no enteros, mal formados o fuera de cota', () => {
    for (const pointsMm of [
      [[0, 0], [1200, 0], [1.5, 600]],
      [[0, 0], [1200, 0], [1200]],
      [[0, 0], [1200, 0], 'punto'],
      [[0, 0], [1200, 0], [SCENE_LIMITS.coordinateMm.max + 1, 600]],
      'no-lista',
    ]) {
      const errors = expectInvalid(
        validateSceneDocument(withSketch({ ...rectSketch, pointsMm })),
      );
      expect(
        codesOf(errors).some(
          (code) =>
            code === 'ERR_SCENE_INVALID_OBJECT' ||
            code === 'ERR_SCENE_DEGENERATE_SKETCH',
        ),
      ).toBe(true);
    }
  });

  it('rechaza planos desconocidos y origen de plano inválido', () => {
    const errors = expectInvalid(
      validateSceneDocument(
        withSketch({ ...rectSketch, plane: 'diagonal' as never }),
      ),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_INVALID_OBJECT');

    const errorsOrigin = expectInvalid(
      validateSceneDocument(
        withSketch({ ...rectSketch, planeOriginMm: [0, 0] }),
      ),
    );
    expect(codesOf(errorsOrigin)).toContain('ERR_SCENE_TRANSFORM_INVALID');
  });

  it('rechaza extrusión fuera de rango o no entera', () => {
    for (const extrusionMm of [
      0,
      -1,
      1.5,
      NaN,
      Infinity,
      '18',
      SCENE_LIMITS.extrusionMm.max + 1,
    ]) {
      const errors = expectInvalid(validateSceneDocument(withSketch(rectSketch, extrusionMm)));
      expect(codesOf(errors)).toContain('ERR_SCENE_INVALID_EXTRUSION');
    }
  });

  it('rechaza geometría con fuente desconocida o clave kernel vacía', () => {
    for (const geometry of [
      { source: 'otra', key: 'x' },
      { source: 'kernel', key: '' },
      { source: 'kernel' },
      { source: 'sketch' },
      'geometría',
    ]) {
      const input = solidDocumentInput();
      const objects = input.objects as Array<Record<string, unknown>>;
      objects[0] = { ...(objects[0] as object), geometry };
      expect(
        codesOf(expectInvalid(validateSceneDocument(input))),
      ).toContain('ERR_SCENE_INVALID_OBJECT');
    }
  });
});

describe('validateSceneDocument — objetos: forma y kind', () => {
  it('rechaza objects que no es lista ni entradas no objeto', () => {
    const input = emptyDocumentInput();
    input.objects = 'no-lista';
    expect(
      codesOf(expectInvalid(validateSceneDocument(input))),
    ).toContain('ERR_SCENE_INVALID_OBJECT');

    const input2 = emptyDocumentInput();
    input2.objects = [null];
    expect(
      codesOf(expectInvalid(validateSceneDocument(input2))),
    ).toContain('ERR_SCENE_INVALID_OBJECT');
  });

  it('rechaza kind desconocido, id/name ausentes', () => {
    for (const patch of [
      { kind: 'mesh' },
      { id: '' },
      { id: undefined },
      { name: '' },
    ]) {
      const input = solidDocumentInput();
      const objects = input.objects as Array<Record<string, unknown>>;
      objects[0] = patchObject(baseSolid, patch);
      expect(
        codesOf(expectInvalid(validateSceneDocument(input))),
      ).toContain('ERR_SCENE_INVALID_OBJECT');
    }
  });
});

describe('validateSceneDocument — componentes y parámetros', () => {
  function withComponent(
    patch: Record<string, unknown>,
    options?: { components?: typeof boxComponentRegistry },
  ): SceneValidationResult {
    const input = componentDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = patchObject(baseComponent, patch);
    return validateSceneDocument(input, {
      components: options?.components ?? boxComponentRegistry,
    });
  }

  it('rechaza tipo no registrado (con registro)', () => {
    const errors = expectInvalid(withComponent({ type: 'tipo.inexistente' }));
    expect(codesOf(errors)).toContain('ERR_SCENE_UNKNOWN_COMPONENT');
  });

  it('rechaza versión distinta de la registrada', () => {
    const errors = expectInvalid(withComponent({ version: 2 }));
    expect(codesOf(errors)).toContain('ERR_SCENE_UNKNOWN_COMPONENT');
  });

  it('rechaza type/version mal formados como forma inválida', () => {
    for (const patch of [{ type: '' }, { type: undefined }, { version: 0 }, { version: '1' }]) {
      expect(codesOf(expectInvalid(withComponent(patch)))).toContain(
        'ERR_SCENE_INVALID_OBJECT',
      );
    }
  });

  it('rechaza parámetros fuera del esquema declarado', () => {
    // Bajo el mínimo, sobre el máximo y tipo incorrecto.
    for (const params of [
      { widthMm: 50 },
      { widthMm: 5000 },
      { widthMm: 'seiscientos' },
      { label: 42 },
      { lid: 'true' },
    ]) {
      const errors = expectInvalid(withComponent({ params }));
      expect(codesOf(errors)).toContain('ERR_SCENE_PARAMS_OUT_OF_RANGE');
    }
  });

  it('admite parámetros no declarados si son JSON serializable', () => {
    expectValid(
      withComponent({
        params: {
          widthMm: 600,
          extra: { nested: [1, 2, { deep: true }] },
        },
      }),
    );
  });

  it('rechaza params que no es objeto', () => {
    for (const params of ['x', 42, [], null]) {
      expect(codesOf(expectInvalid(withComponent({ params })))).toContain(
        'ERR_SCENE_PARAMS_OUT_OF_RANGE',
      );
    }
  });

  it('rechaza valores no serializables (NaN, Infinity, función, bigint)', () => {
    for (const value of [NaN, Infinity, -Infinity, () => 1, 10n, undefined]) {
      const errors = expectInvalid(
        withComponent({ params: { extra: value } }),
      );
      expect(codesOf(errors)).toContain('ERR_SCENE_PARAMS_OUT_OF_RANGE');
    }
  });

  it('rechaza una estructura circular sin desbordar la pila', () => {
    const circular: Record<string, unknown> = { widthMm: 600 };
    circular.self = circular;
    const errors = expectInvalid(withComponent({ params: circular }));
    expect(codesOf(errors)).toContain('ERR_SCENE_PARAMS_OUT_OF_RANGE');
  });

  it('rechaza una estructura más profunda que la cota de sanidad', () => {
    let deep: Record<string, unknown> = { end: true };
    for (let i = 0; i <= SCENE_LIMITS.paramsMaxDepth; i += 1) {
      deep = { nested: deep };
    }
    const errors = expectInvalid(withComponent({ params: deep }));
    expect(codesOf(errors)).toContain('ERR_SCENE_PARAMS_OUT_OF_RANGE');
  });

  it('valida parámetros anidados tipo WardrobeConfig (puente 4B-D)', () => {
    expectValid(
      withComponent({
        params: {
          config: {
            schemaVersion: 1,
            dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 600 },
            modules: [{ kind: 'shelves', shelves: 3 }],
            materials: {
              structure: { name: 'Roble', thicknessMm: 18, finish: 'mate' },
            },
          },
        },
      }),
    );
  });
});

describe('validateSceneDocument — datos corruptos y hostiles', () => {
  it('descarta claves desconocidas (reconstrucción campo a campo)', () => {
    const input = solidDocumentInput();
    input.unexpected = { evil: true };
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = { ...(objects[0] as object), extraKey: 'boom' };
    const document = expectValid(validateSceneDocument(input));
    expect('unexpected' in document).toBe(false);
    expect('extraKey' in (document.objects[0] as object)).toBe(false);
  });

  it('una clave hostil __proto__ en params no contamina el prototipo', () => {
    const input = componentDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    const hostile = JSON.parse(
      '{"widthMm": 600, "__proto__": {"polluted": true}}',
    ) as Record<string, unknown>;
    objects[0] = { ...(objects[0] as object), params: hostile };

    const document = expectValid(
      validateSceneDocument(input, { components: boxComponentRegistry }),
    );
    const [object] = document.objects;
    const params = object && 'params' in object ? object.params : undefined;

    // Sin contaminación global y sin perder el dato como propiedad propia.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(params)).toBe(Object.prototype);
    expect(Object.keys(params ?? {}).sort()).toEqual(['__proto__', 'widthMm']);
  });

  it('una clave __proto__ a nivel de documento se descarta', () => {
    const hostile = JSON.parse(
      '{"documentVersion": 1, "id": "scene-1", "name": "X", "gridStepMm": 10, "originMm": [0,0,0], "objects": [], "materials": [], "__proto__": {"polluted": true}}',
    ) as Record<string, unknown>;
    expectValid(validateSceneDocument(hostile));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('acumula múltiples errores de distintos códigos a la vez', () => {
    const input = emptyDocumentInput();
    input.documentVersion = 9;
    input.gridStepMm = 0;
    input.materials = [{ ...baseMaterial }];
    input.objects = [
      patchObject(baseSolid, { materialId: 'material-404' }),
      { ...(baseSolid as object), id: 'object-1' },
    ];
    const errors = expectInvalid(validateSceneDocument(input));
    const codes = new Set(codesOf(errors));
    expect(codes.has('ERR_SCENE_INVALID_VERSION')).toBe(true);
    expect(codes.has('ERR_SCENE_UNKNOWN_MATERIAL')).toBe(true);
    expect(codes.has('ERR_SCENE_DUPLICATE_ID')).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('es determinista: misma entrada → mismos errores, en el mismo orden', () => {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = patchObject(baseSolid, {
      materialId: 'material-404',
      transform: { positionMm: [0, 0, 1.5] },
    });
    const first = expectInvalid(validateSceneDocument(input));
    const second = expectInvalid(validateSceneDocument(input));
    expect(second).toEqual(first);
  });

  it('no muta la entrada', () => {
    const input = solidDocumentInput();
    const before = structuredClone(input);
    validateSceneDocument(input);
    expect(input).toEqual(before);
  });
});

describe('validateSceneDocument — inmutabilidad (I3) y determinismo', () => {
  it('devuelve el documento congelado en profundidad', () => {
    const document = expectValid(validateSceneDocument(solidDocumentInput()));
    expect(Object.isFrozen(document)).toBe(true);
    expect(Object.isFrozen(document.objects)).toBe(true);
    expect(Object.isFrozen(document.materials)).toBe(true);
    const [object] = document.objects;
    expect(Object.isFrozen(object)).toBe(true);
    if (object?.kind === 'solid' && object.geometry.source === 'sketch') {
      expect(Object.isFrozen(object.geometry)).toBe(true);
      expect(Object.isFrozen(object.geometry.sketch)).toBe(true);
      expect(Object.isFrozen(object.geometry.sketch.pointsMm)).toBe(true);
    } else {
      throw new Error('se esperaba un sólido con geometría de croquis');
    }
  });

  it('impide la mutación en modo estricto (los módulos son estrictos)', () => {
    const document = expectValid(validateSceneDocument(solidDocumentInput()));
    expect(() => {
      // Los módulos TS se compilan en modo estricto: mutar un array congelado
      // lanza TypeError (I3 cumplida en runtime, no solo en tipos).
      (document.objects as unknown as SceneObject[]).push(baseSolid);
    }).toThrow(TypeError);
    expect(document.objects).toHaveLength(1);
  });

  it('es determinista: dos validaciones producen documentos equivalentes', () => {
    const a = expectValid(validateSceneDocument(solidDocumentInput()));
    const b = expectValid(validateSceneDocument(solidDocumentInput()));
    expect(a).toEqual(b);
    expect(structuredClone(a)).toEqual(structuredClone(b));
  });

  it('la salida reconstruida es independiente de la entrada', () => {
    const input = solidDocumentInput();
    const document = asDocument(expectValid(validateSceneDocument(input)));
    // Mutar la entrada tras validar no afecta al documento validado.
    const objects = input.objects as Array<Record<string, unknown>>;
    (objects[0] as { name: string }).name = 'mutado';
    expect(document.objects[0]?.name).toBe('Placa');
  });
});

// ---------------------------------------------------------------------------
// Auditoría FASE-4B-A: verificaciones puntuales de contrato
// ---------------------------------------------------------------------------
describe('auditoría — espacios de nombres de IDs', () => {
  it('id de documento e id de objeto son espacios separados', () => {
    // El id del documento identifica escenas (registro externo, nextSceneId);
    // el del objeto identifica objetos DENTRO del documento. No se cruzan.
    const input = solidDocumentInput();
    input.id = 'object-1'; // igual que el objeto contenido
    const document = expectValid(validateSceneDocument(input));
    expect(document.id).toBe('object-1');
    expect(document.objects[0]?.id).toBe('object-1');
  });

  it('la unicidad se evalúa por colección, no entre colecciones', () => {
    // Un material y un objeto pueden compartir id sin ambigüedad: cada
    // referencia resuelve contra su propia colección (materialId → materials).
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = { ...(objects[0] as object), id: 'material-1' };
    expectValid(validateSceneDocument(input));
  });

  it('id de documento vacío sigue rechazándose con campo raíz "id"', () => {
    const input = solidDocumentInput();
    input.id = '';
    const errors = expectInvalid(validateSceneDocument(input));
    expect(errors.some((e) => e.code === 'ERR_SCENE_INVALID_OBJECT' && e.field === 'id')).toBe(true);
  });
});

describe('auditoría — importación y eliminación', () => {
  it('JSON importado con ids de objeto duplicados → rechazado', () => {
    // Simula la frontera real de importación: string hostil → JSON.parse →
    // validador. La unicidad sobrevive al viaje de ida y vuelta.
    const imported = JSON.parse(
      '{"documentVersion":1,"id":"scene-1","name":"X","gridStepMm":10,"originMm":[0,0,0],"materials":[{"id":"material-1","name":"M","finish":"mate","thicknessMm":18}],"objects":[' +
        '{"id":"object-1","kind":"solid","name":"A","transform":{"positionMm":[0,0,0]},"geometry":{"source":"sketch","sketch":{"plane":"ground","planeOriginMm":[0,0,0],"pointsMm":[[0,0],[100,0],[100,100]],"closed":true}},"materialId":"material-1"},' +
        '{"id":"object-1","kind":"solid","name":"B","transform":{"positionMm":[0,0,0]},"geometry":{"source":"sketch","sketch":{"plane":"ground","planeOriginMm":[0,0,0],"pointsMm":[[0,0],[100,0],[100,100]],"closed":true}},"materialId":"material-1"}]}',
    ) as unknown;
    const errors = expectInvalid(validateSceneDocument(imported));
    expect(codesOf(errors)).toContain('ERR_SCENE_DUPLICATE_ID');
  });

  it('JSON importado idéntico idéntico es válido (ida y vuelta determinista)', () => {
    const original = solidDocumentInput();
    const roundTrip = JSON.parse(JSON.stringify(original)) as unknown;
    const document = expectValid(validateSceneDocument(roundTrip));
    expect(document.objects).toHaveLength(1);
  });

  it('material eliminado pero referenciado → UNKNOWN_MATERIAL (sin referencias colgantes)', () => {
    const input = solidDocumentInput();
    input.materials = []; // eliminación incompleta: el objeto sigue apuntando
    const errors = expectInvalid(validateSceneDocument(input));
    expect(codesOf(errors)).toContain('ERR_SCENE_UNKNOWN_MATERIAL');
  });
});

describe('auditoría — inmutabilidad de objetos normalizados', () => {
  it('params anidados de un componente quedan congelados en profundidad', () => {
    const document = expectValid(
      validateSceneDocument(componentDocumentInput(), {
        components: boxComponentRegistry,
      }),
    );
    const [object] = document.objects;
    if (object?.kind !== 'component' || object.params === undefined) {
      throw new Error('se esperaba componente con params');
    }
    expect(Object.isFrozen(object.params)).toBe(true);
    // Los objetos anidados (registro estilo WardrobeConfig) también:
    const result2 = validateSceneDocument(
      {
        ...componentDocumentInput(),
        objects: [
          {
            ...baseComponent,
            params: { config: { dimensions: { widthMm: 2400 } }, tags: ['a', 'b'] },
          },
        ],
      },
      { components: boxComponentRegistry },
    );
    const doc2 = expectValid(result2);
    const [obj2] = doc2.objects;
    if (obj2?.kind !== 'component' || obj2.params === undefined) {
      throw new Error('se esperaba componente con params');
    }
    const config = obj2.params.config;
    if (
      typeof config !== 'object' ||
      config === null ||
      !('dimensions' in config)
    ) {
      throw new Error('config debía ser un objeto anidado');
    }
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.dimensions)).toBe(true);
    expect(Object.isFrozen(obj2.params.tags)).toBe(true);
  });

  it('la validación NO congela la entrada (solo la salida normalizada)', () => {
    const input = solidDocumentInput();
    expectValid(validateSceneDocument(input));
    expect(Object.isFrozen(input)).toBe(false);
    const objects = input.objects as Array<Record<string, unknown>>;
    expect(Object.isFrozen(objects[0])).toBe(false);
  });
});

describe('auditoría — ciclos y profundidades hostiles', () => {
  it('estructura circular FUERA de params termina con resultado, no cuelga', () => {
    // El recorrido del validador solo conoce campos propios y la única
    // recursión con cota está en params: un ciclo en la raíz o en un objeto
    // no puede producir bucle infinito.
    const input = solidDocumentInput();
    const holder = input as Record<string, unknown>;
    holder.self = holder; // ciclo en la raíz
    const objects = input.objects as Array<Record<string, unknown>>;
    const first = objects[0] as Record<string, unknown>;
    first.nested = { back: first }; // ciclo en un objeto
    const result = validateSceneDocument(input);
    // Termina y, como los campos desconocidos se descartan, es válido.
    expect(result.ok).toBe(true);
  });

  it('lista de croquis con referencias circulares → error, sin bucle', () => {
    const input = solidDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    const geometry = (objects[0] as { geometry: Record<string, unknown> }).geometry;
    const sketch = geometry.sketch as Record<string, unknown>;
    const points: unknown[] = [[0, 0], [100, 0], [100, 100]];
    points.push(points); // el propio array como "punto"
    sketch.pointsMm = points;
    const result = validateSceneDocument(input);
    expect(result.ok).toBe(false);
  });

  it('frontera exacta de profundidad: 31 niveles bajo params se acepta, 32 se rechaza', () => {
    function nest(levels: number): Record<string, unknown> {
      let node: Record<string, unknown> = { end: true };
      for (let i = 0; i < levels; i += 1) node = { nested: node };
      return node;
    }
    const base = componentDocumentInput();
    const objects = base.objects as Array<Record<string, unknown>>;

    objects[0] = { ...(objects[0] as object), params: nest(31) };
    expectValid(
      validateSceneDocument(base, { components: boxComponentRegistry }),
    );

    const rejected = componentDocumentInput();
    const rejectedObjects = rejected.objects as Array<Record<string, unknown>>;
    rejectedObjects[0] = { ...(rejectedObjects[0] as object), params: nest(32) };
    const errors = expectInvalid(
      validateSceneDocument(rejected, { components: boxComponentRegistry }),
    );
    expect(codesOf(errors)).toContain('ERR_SCENE_PARAMS_OUT_OF_RANGE');
  });
});

describe('auditoría — claves hostiles constructor/prototype', () => {
  it('params con claves "constructor" y "prototype" no contaminan el prototipo', () => {
    const hostile = JSON.parse(
      '{"widthMm":600,"constructor":{"prototype":{"polluted":true}},"prototype":{"x":1}}',
    ) as Record<string, unknown>;
    const input = componentDocumentInput();
    const objects = input.objects as Array<Record<string, unknown>>;
    objects[0] = { ...(objects[0] as object), params: hostile };

    const document = expectValid(
      validateSceneDocument(input, { components: boxComponentRegistry }),
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).x).toBeUndefined();
    const [object] = document.objects;
    if (object?.kind !== 'component' || object.params === undefined) {
      throw new Error('se esperaba componente con params');
    }
    // Son propiedades DENTRO del objeto params, no modifican Object.prototype.
    expect(Object.hasOwn(object.params, 'constructor')).toBe(true);
    expect(Object.hasOwn(object.params, 'prototype')).toBe(true);
    expect(Object.getPrototypeOf(object.params)).toBe(Object.prototype);
  });
});
