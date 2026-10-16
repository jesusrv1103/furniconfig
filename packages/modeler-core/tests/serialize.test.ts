/**
 * Pruebas de la serialización en SceneEnvelope (FASE-4B-B, paso 8 del MVP).
 *
 * Cubre, según el pedido de la fase: round-trip sin pérdida, marcadores y
 * versión, JSON hostil (malformado, no estructural, bombas de
 * anidamiento), versiones desconocidas sin migración silenciosa, ids
 * duplicados, params anidados, claves hostiles sin contaminación de
 * prototipos, tolerancia hacia adelante (`geometryCache` ignorada) y el
 * resultado discriminado del parser (nunca lanza).
 */

import { describe, expect, it } from 'vitest';
import { SceneError, type SceneErrorCode, type SceneIssue } from '../src/errors.js';
import {
  SCENE_FORMAT,
  SCENE_FORMAT_VERSION,
  parseSceneEnvelope,
  serializeScene,
  type ParseSceneEnvelopeResult,
} from '../src/serialize.js';
import { validateSceneDocument } from '../src/validate.js';
import type { ComponentInstance, SceneParams } from '../src/types/document.js';
import {
  asDocument,
  baseComponent,
  baseMaterial,
  baseSolid,
  boxComponentRegistry,
  componentDocumentInput,
  rectSketch,
  solidDocumentInput,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers locales
// ---------------------------------------------------------------------------

function validated(input: unknown) {
  const result = validateSceneDocument(input);
  if (!result.ok) {
    throw new Error(
      `fixture de prueba inválida: ${JSON.stringify(result.errors)}`,
    );
  }
  return result.document;
}

function expectInvalidResult(result: ParseSceneEnvelopeResult): {
  code: SceneErrorCode;
  message: string;
  issues: readonly SceneIssue[];
} {
  if (result.ok) {
    throw new Error('se esperaba un resultado inválido');
  }
  return { code: result.code, message: result.message, issues: result.issues };
}

function expectSceneError(fn: () => unknown, code: SceneErrorCode): SceneError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SceneError);
    const sceneError = error as SceneError;
    expect(sceneError.code).toBe(code);
    return sceneError;
  }
  throw new Error(`se esperaba SceneError ${code} pero no se lanzó nada`);
}

/** Sobre JSON a partir de un documento (y claves extra opcionales del sobre). */
function envelopeText(
  document: unknown,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    format: SCENE_FORMAT,
    version: SCENE_FORMAT_VERSION,
    document,
    ...extra,
  });
}

/** Documento rico: sólido + componente con params anidados + 2 materiales. */
function richInput(): Record<string, unknown> {
  return {
    ...componentDocumentInput(),
    gridStepMm: 25,
    originMm: [5, 0, 5],
    materials: [
      { ...baseMaterial },
      { id: 'material-2', name: 'Contrachapado', finish: 'natural', thicknessMm: 12 },
    ],
    objects: [
      { ...baseSolid },
      {
        ...baseComponent,
        params: {
          widthMm: 700,
          config: { dims: { w: 600 }, tags: ['x', 'y'], on: false },
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// serializeScene + round-trip
// ---------------------------------------------------------------------------

describe('serializeScene / parseSceneEnvelope (round-trip)', () => {
  it('round-trip nominal: el documento sobrevive intacto y congelado', () => {
    const doc = validated(solidDocumentInput());
    const text = serializeScene(doc);
    const result = parseSceneEnvelope(text);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).toEqual(doc);
      expect(Object.isFrozen(result.document)).toBe(true);
    }
  });

  it('round-trip preserva materiales, origen, rejilla y params anidados', () => {
    const doc = validated(richInput());
    const result = parseSceneEnvelope(serializeScene(doc));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document).toEqual(doc);
      const component = result.document.objects.find(
        (candidate) => candidate.id === 'component-1',
      );
      expect(component?.kind === 'component' ? component.params : undefined).toEqual({
        widthMm: 700,
        config: { dims: { w: 600 }, tags: ['x', 'y'], on: false },
      });
      expect(result.document.materials.length).toBe(2);
      expect(result.document.gridStepMm).toBe(25);
      expect(result.document.originMm).toEqual([5, 0, 5]);
    }
  });

  it('el sobre contiene exactamente format, version y document', () => {
    const raw: unknown = JSON.parse(serializeScene(validated(solidDocumentInput())));
    expect(raw).toBeTypeOf('object');
    const record = raw as Record<string, unknown>;
    expect(record.format).toBe('furniconfig-scene');
    expect(record.version).toBe(1);
    expect(SCENE_FORMAT).toBe('furniconfig-scene');
    expect(SCENE_FORMAT_VERSION).toBe(1);
    expect(Object.keys(record).sort()).toEqual(['document', 'format', 'version']);
  });

  it('la serialización es estable (re-serializar la salida da el mismo texto)', () => {
    const doc = validated(richInput());
    const text1 = serializeScene(doc);
    const parsed = parseSceneEnvelope(text1);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(serializeScene(parsed.document)).toBe(text1);
    }
  });

  it('serializeScene rechaza un documento inválido antes de escribir', () => {
    const invalid = asDocument({
      ...solidDocumentInput(),
      objects: [{ ...baseSolid, materialId: 'material-99' }],
    });
    expectSceneError(
      () => serializeScene(invalid),
      'ERR_SCENE_UNKNOWN_MATERIAL',
    );
  });

  it('serializeScene valida params contra el registro cuando se aporta', () => {
    const inRange = asDocument({
      ...componentDocumentInput(),
      objects: [{ ...baseComponent, params: { widthMm: 99_999 } }],
    });
    // Sin registro: solo validación estructural, escribe sin más.
    expect(() => serializeScene(inRange)).not.toThrow();
    // Con registro: el rango del esquema se cumple y falla antes de escribir.
    expectSceneError(
      () => serializeScene(inRange, { components: boxComponentRegistry }),
      'ERR_SCENE_PARAMS_OUT_OF_RANGE',
    );
  });
});

// ---------------------------------------------------------------------------
// JSON hostil y sobres malformados (el parser nunca lanza)
// ---------------------------------------------------------------------------

describe('parseSceneEnvelope (JSON hostil)', () => {
  it('rechaza JSON malformado con ERR_SCENE_ENVELOPE_INVALID', () => {
    for (const text of ['', '{', 'not json', '[1,2,', 'NaN']) {
      const { code, issues } = expectInvalidResult(parseSceneEnvelope(text));
      expect(code).toBe('ERR_SCENE_ENVELOPE_INVALID');
      expect(issues).toEqual([]);
    }
  });

  it('rechaza contenido JSON que no es un sobre-objeto', () => {
    for (const text of ['null', '[]', '42', '"cadena"']) {
      const { code } = expectInvalidResult(parseSceneEnvelope(text));
      expect(code).toBe('ERR_SCENE_ENVELOPE_INVALID');
    }
  });

  it('rechaza marcadores de formato incorrectos o ausentes', () => {
    const wrongMarker = JSON.stringify({
      format: 'furniconfig-design',
      version: SCENE_FORMAT_VERSION,
      document: solidDocumentInput(),
    });
    const noMarker = JSON.stringify({
      version: SCENE_FORMAT_VERSION,
      document: solidDocumentInput(),
    });
    for (const text of [wrongMarker, noMarker]) {
      const { code } = expectInvalidResult(parseSceneEnvelope(text));
      expect(code).toBe('ERR_SCENE_ENVELOPE_INVALID');
    }
  });

  it('rechaza versiones desconocidas sin migración silenciosa', () => {
    for (const version of [2, '1', null, undefined]) {
      const text = JSON.stringify({
        format: SCENE_FORMAT,
        version,
        // Documento v1 válido dentro: se rechaza por la versión del sobre,
        // antes de validar el documento (issues vacías).
        document: solidDocumentInput(),
      });
      const { code, message, issues } = expectInvalidResult(
        parseSceneEnvelope(text),
      );
      expect(code).toBe('ERR_SCENE_ENVELOPE_VERSION');
      expect(issues).toEqual([]);
      expect(message).toContain('Sin migración automática');
    }
  });

  it('rechaza sobres sin documento o con documento no-objeto', () => {
    const texts = [
      JSON.stringify({ format: SCENE_FORMAT, version: SCENE_FORMAT_VERSION }),
      envelopeText(null),
      envelopeText('hola'),
      envelopeText([1, 2, 3]),
    ];
    for (const text of texts) {
      const { code } = expectInvalidResult(parseSceneEnvelope(text));
      expect(code).toBe('ERR_SCENE_ENVELOPE_INVALID');
    }
  });

  it('acepta una lista de entradas hostiles sin lanzar excepciones', () => {
    const hostile = [
      ...['', '{', 'not json', 'null', '[]', '42', '"texto"'],
      '{"format":"furniconfig-scene"}',
      '{"format":"otro","version":1}',
      '{"format":"furniconfig-scene","version":99}',
      'undefined',
    ];
    for (const text of hostile) {
      expect(() => parseSceneEnvelope(text)).not.toThrow();
      expect(parseSceneEnvelope(text).ok).toBe(false);
    }
  });

  it('rechaza un texto que no es cadena sin lanzar (frontera JS)', () => {
    const { code } = expectInvalidResult(
      parseSceneEnvelope(undefined as unknown as string),
    );
    expect(code).toBe('ERR_SCENE_ENVELOPE_INVALID');
  });

  it('una bomba de anidamiento en el JSON no desborda el parser', () => {
    const bomb = `${'['.repeat(20_000)}${']'.repeat(20_000)}`;
    expect(() => parseSceneEnvelope(bomb)).not.toThrow();
    expect(parseSceneEnvelope(bomb).ok).toBe(false);
  });

  it('params hiperprofundos en el documento se rechazan con la cota del validador', () => {
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 200; i += 1) {
      deep = { nested: deep };
    }
    const text = envelopeText({
      ...componentDocumentInput(),
      objects: [{ ...baseComponent, params: deep }],
    });
    const { code } = expectInvalidResult(parseSceneEnvelope(text));
    expect(code).toBe('ERR_SCENE_PARAMS_OUT_OF_RANGE');
  });
});

// ---------------------------------------------------------------------------
// El parser reutiliza validateSceneDocument (códigos estables)
// ---------------------------------------------------------------------------

describe('parseSceneEnvelope (validación del documento)', () => {
  const cases: ReadonlyArray<{
    name: string;
    input: Record<string, unknown>;
    code: SceneErrorCode;
  }> = [
    {
      name: 'ids duplicados',
      input: {
        ...solidDocumentInput(),
        objects: [{ ...baseSolid }, { ...baseSolid }],
      },
      code: 'ERR_SCENE_DUPLICATE_ID',
    },
    {
      name: 'versión de documento desconocida',
      input: { ...solidDocumentInput(), documentVersion: 2 },
      code: 'ERR_SCENE_INVALID_VERSION',
    },
    {
      name: 'material desconocido',
      input: {
        ...solidDocumentInput(),
        objects: [{ ...baseSolid, materialId: 'material-99' }],
      },
      code: 'ERR_SCENE_UNKNOWN_MATERIAL',
    },
    {
      name: 'croquis degenerado (menos de 3 vértices)',
      input: {
        ...solidDocumentInput(),
        objects: [
          {
            ...baseSolid,
            geometry: {
              source: 'sketch',
              sketch: { ...rectSketch, pointsMm: [[0, 0], [100, 0]] },
              extrusionMm: 18,
            },
          },
        ],
      },
      code: 'ERR_SCENE_DEGENERATE_SKETCH',
    },
    {
      name: 'extrusión inválida',
      input: {
        ...solidDocumentInput(),
        objects: [
          {
            ...baseSolid,
            geometry: {
              source: 'sketch',
              sketch: { ...rectSketch },
              extrusionMm: 0,
            },
          },
        ],
      },
      code: 'ERR_SCENE_INVALID_EXTRUSION',
    },
  ];

  it('reutiliza los códigos del validador y transporta los issues', () => {
    for (const { name, input, code } of cases) {
      const { code: actual, issues, message } = expectInvalidResult(
        parseSceneEnvelope(envelopeText(input)),
      );
      expect(actual, `caso: ${name}`).toBe(code);
      expect(issues.length, `caso: ${name}`).toBeGreaterThan(0);
      expect(issues[0]?.field.length ?? 0).toBeGreaterThan(0);
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Seguridad de prototipos y tolerancia hacia adelante
// ---------------------------------------------------------------------------

describe('parseSceneEnvelope (seguridad y tolerancia)', () => {
  it('una clave hostil __proto__ en el sobre no contamina prototipos', () => {
    const input = solidDocumentInput();
    Object.defineProperty(input, '__proto__', {
      value: { polluted: true },
      enumerable: true,
    });
    const result = parseSceneEnvelope(envelopeText(input));
    expect(result.ok).toBe(true);
    // Clave desconocida descartada por el validador; prototipos intactos.
    expect((({} as Record<string, unknown>).polluted)).toBeUndefined();
    if (result.ok) {
      expect(Object.getPrototypeOf(result.document)).toBe(Object.prototype);
      expect(
        Object.hasOwn(result.document as unknown as object, '__proto__'),
      ).toBe(false);
    }
  });

  it('una clave hostil __proto__ dentro de params queda como dato inocuo', () => {
    const params: Record<string, unknown> = { widthMm: 600 };
    Object.defineProperty(params, '__proto__', {
      value: { polluted: 1 },
      enumerable: true,
    });
    const text = envelopeText({
      ...componentDocumentInput(),
      objects: [{ ...baseComponent, params }],
    });

    const result = parseSceneEnvelope(text);
    expect(result.ok).toBe(true);
    expect((({} as Record<string, unknown>).polluted)).toBeUndefined();
    if (result.ok) {
      const component = result.document.objects.find(
        (candidate) => candidate.id === 'component-1',
      ) as ComponentInstance | undefined;
      const parsedParams = component?.params as
        | Record<string, unknown>
        | undefined;
      expect(parsedParams).toBeDefined();
      expect(Object.getPrototypeOf(parsedParams ?? {})).toBe(Object.prototype);
      expect(parsedParams?.polluted).toBeUndefined();
      expect(Object.hasOwn(parsedParams ?? {}, '__proto__')).toBe(true);
    }
  });

  it('ignora claves desconocidas del sobre (tolerancia hacia adelante)', () => {
    const text = envelopeText(solidDocumentInput(), {
      geometryCache: { 'mesh-1': { junk: true } },
      futureField: { anything: 1 },
    });
    const result = parseSceneEnvelope(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Solo claves conocidas del documento; nada del sobre se cuela.
      expect(Object.keys(result.document).sort()).toEqual([
        'documentVersion',
        'gridStepMm',
        'id',
        'materials',
        'name',
        'objects',
        'originMm',
      ]);
      expect(Object.hasOwn(result.document, 'geometryCache')).toBe(false);
      // Re-serializar no arrastra las claves ajenas del sobre.
      const reserialized: unknown = JSON.parse(serializeScene(result.document));
      expect(
        Object.keys(reserialized as Record<string, unknown>).sort(),
      ).toEqual(['document', 'format', 'version']);
    }
  });

  it('round-trip con registro de componentes: acepta params en rango y rechaza fuera', () => {
    const doc = validated(componentDocumentInput());
    const text = serializeScene(doc, { components: boxComponentRegistry });
    const okResult = parseSceneEnvelope(text, {
      components: boxComponentRegistry,
    });
    expect(okResult.ok).toBe(true);

    const outOfRange = envelopeText({
      ...componentDocumentInput(),
      objects: [{ ...baseComponent, params: { widthMm: 99_999 } }],
    });
    // Sin registro: solo estructura → pasa.
    expect(parseSceneEnvelope(outOfRange).ok).toBe(true);
    // Con registro: el esquema decide → ERR_SCENE_PARAMS_OUT_OF_RANGE.
    const { code, issues } = expectInvalidResult(
      parseSceneEnvelope(outOfRange, { components: boxComponentRegistry }),
    );
    expect(code).toBe('ERR_SCENE_PARAMS_OUT_OF_RANGE');
    expect(issues.length).toBeGreaterThan(0);
  });

  it('los params del sobre vuelven como SceneParams (tipado y orden irrelevante)', () => {
    const doc = validated(componentDocumentInput());
    const result = parseSceneEnvelope(serializeScene(doc));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const component = result.document.objects.find(
        (candidate) => candidate.id === 'component-1',
      );
      const params: SceneParams | undefined =
        component?.kind === 'component' ? component.params : undefined;
      expect(params).toEqual({ widthMm: 600, label: 'Caja alta', lid: true });
    }
  });

  it('una importación fallida no altera ni secuestra documentos existentes', () => {
    const existing = validated(solidDocumentInput());
    const snapshot = validated(solidDocumentInput());

    // (a) Fallo estructural: el parser es puro, el documento no se toca.
    expect(parseSceneEnvelope('{corrupto').ok).toBe(false);
    expect(existing).toEqual(snapshot);

    // (b) Fallo de validación con otro documento dentro: el resultado no
    // alias con ningún documento vivo (el validador reconstruye) y los
    // documentos existentes siguen intactos.
    const failing = parseSceneEnvelope(
      envelopeText({
        ...solidDocumentInput(),
        objects: [{ ...baseSolid, materialId: 'material-ghost' }],
      }),
    );
    expect(failing.ok).toBe(false);
    expect(existing).toEqual(snapshot);
    expect(existing.objects[0]).not.toBe(snapshot.objects[0]);
  });
});
