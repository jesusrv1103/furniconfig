/**
 * FASE-4B-C — validadores runtime del protocolo del Kernel Worker.
 *
 * Los mensajes entrantes son **datos externos**: la forma se valida siempre,
 * los tipos de TypeScript no cuentan. La validación geométrica profunda
 * queda en `ManifoldKernel` (sus `KernelError` estables).
 */

import { describe, expect, it } from 'vitest';

import { KernelError } from '../src/index.js';
import {
  createKernelErrorPayload,
  isKernelErrorPayload,
  isKernelOp,
  isKernelRequest,
  isMeasureResult,
  isMeshData,
  isFiniteInteger,
  meshTransferList,
  parseWorkerResponse,
} from '../src/index.js';

const validBoxOp = { kind: 'box', sizeMm: [800, 600, 18] };

describe('isFiniteInteger', () => {
  it('acepta solo enteros finitos', () => {
    expect(isFiniteInteger(0)).toBe(true);
    expect(isFiniteInteger(-3)).toBe(true);
    expect(isFiniteInteger(1.5)).toBe(false);
    expect(isFiniteInteger(Number.NaN)).toBe(false);
    expect(isFiniteInteger(Infinity)).toBe(false);
    expect(isFiniteInteger('1')).toBe(false);
  });
});

describe('isKernelOp', () => {
  it('acepta las 13 operaciones bien formadas', () => {
    expect(isKernelOp(validBoxOp)).toBe(true);
    expect(isKernelOp({ kind: 'fromSketch', pointsMm: [[0, 0], [10, 0], [10, 5]], extrusionMm: 18 })).toBe(true);
    expect(isKernelOp({ kind: 'union', a: 1, b: 2 })).toBe(true);
    expect(isKernelOp({ kind: 'difference', a: 1, b: 2 })).toBe(true);
    expect(isKernelOp({ kind: 'intersect', a: 1, b: 2 })).toBe(true);
    expect(isKernelOp({ kind: 'translate', ref: 7, deltaMm: [1, 2, 3] })).toBe(true);
    expect(isKernelOp({ kind: 'rotateZ', ref: 7, degrees: 30.5 })).toBe(true);
    expect(isKernelOp({ kind: 'scale', ref: 7, factors: 1.5 })).toBe(true);
    expect(isKernelOp({ kind: 'scale', ref: 7, factors: [1, 2, 3] })).toBe(true);
    expect(isKernelOp({ kind: 'measure', ref: 7 })).toBe(true);
    expect(isKernelOp({ kind: 'toMesh', ref: 7 })).toBe(true);
    expect(isKernelOp({ kind: 'dispose', ref: 7 })).toBe(true);
    expect(isKernelOp({ kind: 'disposeAll' })).toBe(true);
    expect(isKernelOp({ kind: 'ping' })).toBe(true);
  });

  it('rechaza formas hostiles o incompletas', () => {
    expect(isKernelOp(null)).toBe(false);
    expect(isKernelOp('box')).toBe(false);
    expect(isKernelOp({ kind: 'explote', sizeMm: [1, 1, 1] })).toBe(false);
    expect(isKernelOp({ kind: 'box' })).toBe(false);
    expect(isKernelOp({ kind: 'box', sizeMm: [800, 600] })).toBe(false);
    expect(isKernelOp({ kind: 'box', sizeMm: [800, 600, Number.NaN] })).toBe(false);
    expect(isKernelOp({ kind: 'union', a: 1, b: '2' })).toBe(false);
    expect(isKernelOp({ kind: 'translate', ref: 7, deltaMm: [1, 2] })).toBe(false);
    expect(isKernelOp({ kind: 'rotateZ', ref: 7, degrees: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isKernelOp({ kind: 'toMesh', ref: {} })).toBe(false);
    expect(isKernelOp({ kind: 'fromSketch', pointsMm: [[0, 0]], extrusionMm: 1.5 })).toBe(false);
  });

  it('la forma geométrica se valida en el kernel, no en el protocolo', () => {
    // Un factor negativo tiene forma válida: el rechazo (invalid-input) es
    // del kernel, que lanza con su código estable.
    expect(isKernelOp({ kind: 'scale', ref: 7, factors: -1 })).toBe(true);
  });
});

describe('isKernelRequest', () => {
  it('acepta una solicitud válida y rechaza basura', () => {
    expect(isKernelRequest({ type: 'op', epoch: 1, requestId: 2, op: validBoxOp })).toBe(true);
    expect(isKernelRequest(null)).toBe(false);
    expect(isKernelRequest('hola')).toBe(false);
    expect(isKernelRequest({})).toBe(false);
    expect(isKernelRequest({ type: 'op', epoch: 1, requestId: 2 })).toBe(false);
    expect(isKernelRequest({ type: 'otro', epoch: 1, requestId: 2, op: validBoxOp })).toBe(false);
    expect(isKernelRequest({ type: 'op', epoch: '1', requestId: 2, op: validBoxOp })).toBe(false);
    expect(isKernelRequest({ type: 'op', epoch: 1, requestId: 2.5, op: validBoxOp })).toBe(false);
  });
});

describe('parseWorkerResponse', () => {
  it('parsea ready, fatal y resultados ok/err válidos', () => {
    expect(parseWorkerResponse({ type: 'ready', initMs: 12 })).toEqual({ type: 'ready', initMs: 12 });
    expect(parseWorkerResponse({ type: 'fatal', error: { code: 'kernel-status', message: 'x' } })).toEqual({
      type: 'fatal',
      error: { code: 'kernel-status', message: 'x' },
    });
    expect(
      parseWorkerResponse({ type: 'result', epoch: 1, requestId: 2, ok: true, value: 5 }),
    ).toEqual({ type: 'result', epoch: 1, requestId: 2, ok: true, value: 5 });
    expect(
      parseWorkerResponse({
        type: 'result',
        epoch: 1,
        requestId: 2,
        ok: false,
        error: { code: 'invalid-input', message: 'mal' },
      }),
    ).toEqual({
      type: 'result',
      epoch: 1,
      requestId: 2,
      ok: false,
      error: { code: 'invalid-input', message: 'mal' },
    });
  });

  it('rechaza mensajes malformados (devuelve null)', () => {
    expect(parseWorkerResponse(undefined)).toBeNull();
    expect(parseWorkerResponse('ready')).toBeNull();
    expect(parseWorkerResponse({ type: 'ready' })).toBeNull();
    expect(parseWorkerResponse({ type: 'ready', initMs: '12' })).toBeNull();
    expect(parseWorkerResponse({ type: 'result', epoch: 1, requestId: 2 })).toBeNull();
    expect(parseWorkerResponse({ type: 'result', epoch: 1, requestId: 2, ok: 'true' })).toBeNull();
    expect(
      parseWorkerResponse({ type: 'result', epoch: 1, requestId: 2, ok: false, error: { code: 'loco', message: 'x' } }),
    ).toBeNull();
    expect(parseWorkerResponse({ type: 'inventado' })).toBeNull();
  });
});

describe('isKernelErrorPayload y createKernelErrorPayload', () => {
  it('valida payloads con códigos estables', () => {
    expect(isKernelErrorPayload({ code: 'worker-timeout', message: 'x' })).toBe(true);
    expect(isKernelErrorPayload({ code: 'worker-terminated', message: 'x' })).toBe(true);
    expect(isKernelErrorPayload({ code: 'no-existe', message: 'x' })).toBe(false);
    expect(isKernelErrorPayload({ code: 'invalid-input' })).toBe(false);
    expect(isKernelErrorPayload(null)).toBe(false);
  });

  it('serializa KernelError conservando código y mensaje', () => {
    const payload = createKernelErrorPayload(new KernelError('invalid-input', 'croquis degenerado'));
    expect(payload).toEqual({ code: 'invalid-input', message: 'croquis degenerado' });
  });

  it('las excepciones no tipadas no se ocultan (viajan con su mensaje)', () => {
    expect(createKernelErrorPayload(new TypeError('boom'))).toEqual({
      code: 'kernel-status',
      message: 'TypeError: boom',
    });
    expect(createKernelErrorPayload('texto raro')).toEqual({
      code: 'kernel-status',
      message: 'Excepción no tipada: texto raro',
    });
  });
});

describe('isMeasureResult / isMeshData', () => {
  it('acepta resultados bien formados', () => {
    expect(
      isMeasureResult({ volumeMm3: 123, boundsMm: { min: [0, 0, 0], max: [1, 2, 3] } }),
    ).toBe(true);
    expect(
      isMeshData({ positions: new Float32Array(9), indices: new Uint32Array(3), bounds: { min: [0, 0, 0], max: [1, 1, 1] } }),
    ).toBe(true);
  });

  it('rechaza valores hostiles (sin tipado que los salve)', () => {
    expect(isMeasureResult({ volumeMm3: Number.NaN, boundsMm: { min: [0, 0, 0], max: [1, 2, 3] } })).toBe(false);
    expect(isMeasureResult({ volumeMm3: 1, boundsMm: { min: [0, 0], max: [1, 2, 3] } })).toBe(false);
    expect(isMeasureResult(null)).toBe(false);
    // arrays planos en lugar de TypedArrays: no valen como malla
    expect(isMeshData({ positions: [0, 0, 0], indices: [0, 0, 0], bounds: { min: [0, 0, 0], max: [1, 1, 1] } })).toBe(false);
    expect(isMeshData({ positions: new Float32Array(9), indices: new Uint32Array(3) })).toBe(false);
  });
});

describe('meshTransferList', () => {
  it('expone los dos buffers ArrayBuffer como transferibles', () => {
    const mesh = {
      positions: new Float32Array(9),
      indices: new Uint32Array(3),
      bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] },
    };
    const transfer = meshTransferList(mesh);
    expect(transfer).toHaveLength(2);
    expect(transfer[0]).toBe(mesh.positions.buffer);
    expect(transfer[1]).toBe(mesh.indices.buffer);
    for (const buffer of transfer) {
      expect(buffer).toBeInstanceOf(ArrayBuffer);
    }
  });
});
