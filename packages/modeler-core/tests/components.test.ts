/**
 * FASE-4B-D — componentes paramétricos: registro, validación y
 * construcción determinista de la geometría derivada (D1).
 */

import { describe, expect, it } from 'vitest';

import {
  buildComponent,
  componentPartId,
  createComponentRegistry,
  defineComponent,
} from '../src/components.js';
import { SceneError } from '../src/errors.js';
import type { ParametricComponentDef } from '../src/types/component.js';
import {
  fullComponentRegistry,
  numberParam,
  plateComponentDef,
  unitComponentDef,
} from './fixtures.js';

function expectSceneError(fn: () => unknown, code: string): SceneError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SceneError);
    expect((error as SceneError).code).toBe(code);
    return error as SceneError;
  }
  throw new Error(`Se esperaba un SceneError con código ${code}.`);
}

describe('defineComponent (D1)', () => {
  it('acepta una definición válida y la devuelve congelada', () => {
    const def = defineComponent(plateComponentDef);
    expect(def.type).toBe('furniconfig.plate');
    expect(Object.isFrozen(def)).toBe(true);
    expect(Object.isFrozen(def.paramsSchema)).toBe(true);
  });

  it('rechaza type vacío, versión no entera y build ausente', () => {
    expectSceneError(
      () =>
        defineComponent({
          type: '',
          version: 1,
          build: () => ({ parts: [] }),
        }),
      'ERR_SCENE_INVALID_OBJECT',
    );
    expectSceneError(
      () =>
        defineComponent({
          type: 'x',
          version: 1.5,
          build: () => ({ parts: [] }),
        }),
      'ERR_SCENE_INVALID_OBJECT',
    );
    expectSceneError(
      () =>
        defineComponent({
          type: 'x',
          version: 1,
        } as unknown as ParametricComponentDef),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });

  it('rechaza esquemas con kind desconocido o min > max', () => {
    expectSceneError(
      () =>
        defineComponent({
          type: 'x',
          version: 1,
          paramsSchema: { a: { kind: 'color' } } as never,
          build: () => ({ parts: [] }),
        }),
      'ERR_SCENE_INVALID_OBJECT',
    );
    expectSceneError(
      () =>
        defineComponent({
          type: 'x',
          version: 1,
          paramsSchema: { a: { kind: 'number', min: 10, max: 5 } },
          build: () => ({ parts: [] }),
        }),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });
});

describe('createComponentRegistry (D1)', () => {
  it('registra definiciones sin duplicados y los congela', () => {
    const registry = createComponentRegistry([
      plateComponentDef,
      unitComponentDef,
    ]);
    expect(Object.keys(registry)).toEqual(['furniconfig.plate', 'furniconfig.unit']);
    expect(Object.isFrozen(registry)).toBe(true);
  });

  it('rechaza tipos duplicados (un solo version por type)', () => {
    expectSceneError(
      () => createComponentRegistry([plateComponentDef, plateComponentDef]),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });
});

describe('buildComponent (D1)', () => {
  const params = { widthMm: 1200, heightMm: 600, thicknessMm: 18 };

  it('construye la caja única con ids de pieza namespaced y estables', () => {
    const build = buildComponent(
      fullComponentRegistry,
      'object-1',
      'furniconfig.plate',
      1,
      params,
    );
    expect(build.parts).toHaveLength(1);
    const part = build.parts[0];
    expect(part?.partId).toBe(componentPartId('object-1', 'plate'));
    expect(part).toMatchObject({
      kind: 'box',
      role: 'plate',
      sizeMm: [1200, 600, 18],
      positionMm: [0, 0, 0],
    });
    // estabilidad: mismas params → mismos ids en otra "regeneración"
    const again = buildComponent(
      fullComponentRegistry,
      'object-1',
      'furniconfig.plate',
      1,
      params,
    );
    expect(again.parts[0]?.partId).toBe(part?.partId);
  });

  it('los cilindros conservan eje, longitud y diámetro (sin simplificar)', () => {
    const build = buildComponent(
      fullComponentRegistry,
      'component-2',
      'furniconfig.unit',
      1,
      { widthMm: 800, rodDiameterMm: 30 },
    );
    expect(build.parts).toHaveLength(2);
    expect(build.parts[1]).toMatchObject({
      kind: 'cylinder',
      axis: 'x',
      lengthMm: 800,
      diameterMm: 30,
      positionMm: [0, 380, 380],
    });
  });

  it('rechaza tipo no registrado y versión distinta', () => {
    expectSceneError(
      () => buildComponent(fullComponentRegistry, 'object-1', 'no.existe', 1, params),
      'ERR_SCENE_UNKNOWN_COMPONENT',
    );
    expectSceneError(
      () =>
        buildComponent(fullComponentRegistry, 'object-1', 'furniconfig.plate', 2, params),
      'ERR_SCENE_UNKNOWN_COMPONENT',
    );
  });

  it('rechaza params fuera del esquema declarado', () => {
    expectSceneError(
      () =>
        buildComponent(fullComponentRegistry, 'object-1', 'furniconfig.plate', 1, {
          widthMm: 0,
          heightMm: 600,
          thicknessMm: 18,
        }),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
    expectSceneError(
      () =>
        buildComponent(fullComponentRegistry, 'object-1', 'furniconfig.plate', 1, {
          widthMm: 1200,
          heightMm: 'alta',
          thicknessMm: 18,
        }),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
  });

  it('admite parámetros anidados no declarados (puente WardrobeConfig)', () => {
    const build = buildComponent(
      fullComponentRegistry,
      'component-9',
      'furniconfig.plate',
      1,
      {
        widthMm: 100,
        heightMm: 100,
        thicknessMm: 18,
        // estructura anidada no declarada en el esquema (como un clóset)
        config: { dimensions: { widthMm: 600, heightMm: 2200 }, modules: [{ kind: 'shelves' }] },
      },
    );
    expect(build.parts).toHaveLength(1);
  });

  it('devuelve la salida congelada (I3): no es mutable por el consumidor', () => {
    const build = buildComponent(
      fullComponentRegistry,
      'object-1',
      'furniconfig.plate',
      1,
      params,
    );
    expect(Object.isFrozen(build)).toBe(true);
    expect(Object.isFrozen(build.parts)).toBe(true);
    expect(Object.isFrozen(build.parts[0])).toBe(true);
  });

  it('es determinista ante reordenación de claves de params', () => {
    const a = buildComponent(fullComponentRegistry, 'object-1', 'furniconfig.plate', 1, {
      widthMm: 500,
      heightMm: 300,
      thicknessMm: 15,
    });
    const b = buildComponent(fullComponentRegistry, 'object-1', 'furniconfig.plate', 1, {
      thicknessMm: 15,
      widthMm: 500,
      heightMm: 300,
    });
    expect(a).toEqual(b);
  });

  it('admite el medio milímetro de centrado del motor (preserva valor exacto)', () => {
    const halfMm: ParametricComponentDef = defineComponent({
      type: 'test.half-mm',
      version: 1,
      build() {
        return {
          parts: [
            {
              kind: 'cylinder',
              partId: 'rod',
              role: 'hanging-rod',
              axis: 'z',
              lengthMm: 570,
              diameterMm: 30,
              positionMm: [861, 2067, 277.5], // centrado del motor (600 mm − 45)/2
            },
          ],
        };
      },
    });
    const registry = createComponentRegistry([halfMm]);
    const build = buildComponent(registry, 'component-3', 'test.half-mm', 1, {});
    expect(build.parts[0]).toMatchObject({ positionMm: [861, 2067, 277.5] });
  });

  it('el error de build se envuelve con código estable', () => {
    const failing: ParametricComponentDef = defineComponent({
      type: 'test.failing',
      version: 1,
      build() {
        throw new Error('boom');
      },
    });
    const registry = createComponentRegistry([failing]);
    expectSceneError(
      () => buildComponent(registry, 'object-1', 'test.failing', 1, {}),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });

  it('rechaza piezas malformadas devueltas por un build defectuoso', () => {
    const badSize: ParametricComponentDef = defineComponent({
      type: 'test.bad-size',
      version: 1,
      build() {
        return {
          parts: [
            {
              kind: 'box',
              partId: 'p',
              role: 'r',
              sizeMm: [Number.NaN, 10, 10] as never, // no finito (I1)
              positionMm: [0, 0, 0],
            },
          ],
        };
      },
    });
    const registry = createComponentRegistry([badSize]);
    expectSceneError(
      () => buildComponent(registry, 'object-1', 'test.bad-size', 1, {}),
      'ERR_SCENE_INVALID_OBJECT',
    );

    const dupIds: ParametricComponentDef = defineComponent({
      type: 'test.dup',
      version: 1,
      build() {
        const part = {
          kind: 'box' as const,
          partId: 'same',
          role: 'r',
          sizeMm: [10, 10, 10] as const,
          positionMm: [0, 0, 0] as const,
        };
        return { parts: [part, { ...part, positionMm: [20, 0, 0] as const }] };
      },
    });
    const dupRegistry = createComponentRegistry([dupIds]);
    expectSceneError(
      () => buildComponent(dupRegistry, 'object-1', 'test.dup', 1, {}),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });

  it('rechaza asociaciones malformadas (hingeSide, assemblyIndex, leafCount)', () => {
    const badLinks: ParametricComponentDef = defineComponent({
      type: 'test.bad-links',
      version: 1,
      build() {
        return {
          parts: [
            {
              kind: 'box',
              partId: 'door',
              role: 'door',
              sizeMm: [600, 2000, 18],
              positionMm: [0, 0, 0],
              hingeSide: 'center' as never, // no es left/right
            },
          ],
        };
      },
    });
    const registry = createComponentRegistry([badLinks]);
    expectSceneError(
      () => buildComponent(registry, 'object-1', 'test.bad-links', 1, {}),
      'ERR_SCENE_INVALID_OBJECT',
    );

    const badAssembly: ParametricComponentDef = defineComponent({
      type: 'test.bad-assembly',
      version: 1,
      build() {
        return {
          parts: [
            {
              kind: 'box',
              partId: 'front',
              role: 'drawer-front',
              sizeMm: [600, 200, 18],
              positionMm: [0, 0, 0],
              assemblyId: 'drawer-module-1-1',
              assemblyIndex: 0 as never, // índices 1-based
              leafCount: 3 as never, // 1|2
            },
          ],
        };
      },
    });
    const assemblyRegistry = createComponentRegistry([badAssembly]);
    expectSceneError(
      () => buildComponent(assemblyRegistry, 'object-1', 'test.bad-assembly', 1, {}),
      'ERR_SCENE_INVALID_OBJECT',
    );
  });

  it('build recibe exactamente los params validados (numberParam de fixtures)', () => {
    // el fixture plateComponentDef usa numberParam: params válidos → ok
    expect(() =>
      buildComponent(fullComponentRegistry, 'object-1', 'furniconfig.plate', 1, {
        widthMm: 400,
        heightMm: 400,
        thicknessMm: 15,
      }),
    ).not.toThrow();
    expect(numberParam({ a: 7 }, 'a')).toBe(7);
  });
});
