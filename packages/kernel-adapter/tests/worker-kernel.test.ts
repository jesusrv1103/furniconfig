/**
 * FASE-4B-C — `WorkerGeometryKernel` con `FakePort` + `FakeClock`
 * (determinista, sin hilos ni WASM): handshake, cola, emparejado por
 * epoch + requestId, fuera de orden, errores tipados, cancelación lógica,
 * terminación, watchdog (reposo y ocupado), reinicio y handles huérfanos.
 */

import { describe, expect, it } from 'vitest';

import {
  OperationCancelledError,
  WorkerGeometryKernel,
  type KernelOpRequest,
  type WorkerKernelOptions,
  type WorkerRestartInfo,
} from '../src/index.js';
import { FakeClock, FakePort } from './worker-helpers.js';

function createProxy(overrides?: Partial<WorkerKernelOptions>) {
  const clock = new FakeClock();
  const ports: FakePort[] = [];
  const restarts: WorkerRestartInfo[] = [];
  const kernel = new WorkerGeometryKernel({
    createPort: () => {
      const port = new FakePort();
      ports.push(port);
      return port;
    },
    clock,
    watchdogPollMs: 1_000,
    watchdogTimeoutMs: 10_000,
    busyTimeoutMs: 60_000,
    watchdogMissesAllowed: 2,
    maxRestarts: 3,
    onRestart: (info) => restarts.push(info),
    ...overrides,
  });
  const port = (): FakePort => {
    const current = ports.at(-1);
    if (current === undefined) throw new Error('sin puerto');
    return current;
  };
  return { kernel, clock, ports, port, restarts };
}

async function handshake(kernel: WorkerGeometryKernel, port: FakePort, initMs = 7): Promise<void> {
  port.emitReady(initMs);
  await kernel.ready;
}

describe('handshake y cola previa al ready', () => {
  it('las solicitudes previas al ready se encolan y se envían en orden al recibirlo', async () => {
    const { kernel, port } = createProxy();
    const first = kernel.box([800, 600, 18]);
    const second = kernel.box([100, 100, 100]);
    expect(port().requests).toHaveLength(0); // nada viaja sin handshake

    await handshake(kernel, port());

    const requests = port().requests;
    expect(requests).toHaveLength(2);
    expect(requests[0]?.op).toEqual({ kind: 'box', sizeMm: [800, 600, 18] });
    expect(requests[1]?.op).toEqual({ kind: 'box', sizeMm: [100, 100, 100] });
    expect(kernel.stats.state).toBe('ready');
    expect(kernel.stats.lastInitMs).toBe(7);

    port().replyOk(requests[0] as KernelOpRequest, 1);
    port().replyOk(requests[1] as KernelOpRequest, 2);
    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
  });
});

describe('emparejado por epoch + requestId', () => {
  it('respuestas fuera de orden resuelven cada solicitud con su resultado', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    // handle base para poder pedir toMesh/measure
    const seed = kernel.box([800, 600, 18]);
    port().replyOk(port().lastRequest as KernelOpRequest, 77);
    const handle = await seed;

    // dos esperas de distinto tipo: un emparejado erróneo produciría
    // kernel-status en lugar del resultado correcto
    const mesh = kernel.toMesh(handle);
    const measured = kernel.measure(handle);
    const meshRequest = port().requests.at(-2) as KernelOpRequest;
    const measureRequest = port().lastRequest as KernelOpRequest;

    port().replyOk(measureRequest, { volumeMm3: 42, boundsMm: { min: [0, 0, 0], max: [1, 1, 1] } });
    port().replyOk(meshRequest, {
      positions: new Float32Array(9),
      indices: new Uint32Array(3),
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    });

    await expect(measured).resolves.toMatchObject({ volumeMm3: 42 });
    const meshResult = await mesh;
    expect(meshResult.positions).toBeInstanceOf(Float32Array);
    expect(meshResult.indices.length).toBe(3);
  });

  it('una respuesta de un epoch antiguo se descarta y la correcta resuelve', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]);
    const request = port().lastRequest as KernelOpRequest;

    port().emit({ type: 'result', epoch: request.epoch - 1, requestId: request.requestId, ok: true, value: 99 });
    expect(kernel.stats.staleResponses).toBe(1);

    port().replyOk(request, 5);
    await expect(op).resolves.toBe(1); // handle local 1 (el 5 es la ref del worker)
  });

  it('solicitudes simultáneas se asocian correctamente (10 en vuelo)', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const ops = Array.from({ length: 10 }, (_, index) => kernel.box([index + 1, 1, 1]));
    const requests = port().requests;
    expect(requests).toHaveLength(10);
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(10);

    // responder en orden inverso, cada una con su requestId como ref del worker
    for (const request of [...requests].reverse()) {
      port().replyOk(request, request.requestId);
    }
    const values = await Promise.all(ops);
    expect(new Set(values).size).toBe(10); // handles únicos
    expect(kernel.stats.refsAlive).toBe(10);

    // el emparejado es por id: el handle de la 2.ª promesa lleva la ref del
    // worker que se respondió a su solicitud (2), no la de otra
    const second = values[1] as number;
    const mesh = kernel.toMesh(second);
    const wire = (port().lastRequest as KernelOpRequest).op as { kind: string; ref: number };
    expect(wire).toEqual({ kind: 'toMesh', ref: 2 });
  });

  it('mensajes hostiles o sin solicitud asociada no rompen nada', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]);
    const request = port().lastRequest as KernelOpRequest;

    port().emit('basura');
    port().emit(null);
    port().emit({ type: 'ready' });
    port().emit({ type: 'result', epoch: request.epoch, requestId: 1.5, ok: true, value: 1 });
    port().emit({ type: 'result', epoch: request.epoch, requestId: 999_99, ok: true, value: 1 });
    expect(kernel.stats.invalidMessages).toBe(4);
    expect(kernel.stats.unmatchedResponses).toBe(1);

    port().replyOk(request, 7);
    await expect(op).resolves.toBe(1);
  });
});

describe('errores tipados', () => {
  it('un error del worker se reconstruye como KernelError con su código estable', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]);
    const request = port().lastRequest as KernelOpRequest;

    port().replyError(request, { code: 'invalid-input', message: 'el ancho debe ser > 0' });
    await expect(op).rejects.toMatchObject({ code: 'invalid-input', message: 'el ancho debe ser > 0' });
    // sin reintento automático: no se publicó ninguna operación nueva
    expect(port().requests).toHaveLength(1);
  });

  it('valores malformados para la espera declarada → kernel-status (no cuelgan)', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const seed = kernel.box([1, 1, 1]);
    port().replyOk(port().lastRequest as KernelOpRequest, 10);
    const handle = await seed;

    const mesh = kernel.toMesh(handle);
    port().replyOk(port().lastRequest as KernelOpRequest, 'basura');
    await expect(mesh).rejects.toMatchObject({ code: 'kernel-status' });

    const measure = kernel.measure(handle);
    port().replyOk(port().lastRequest as KernelOpRequest, { volumeMm3: 'x' });
    await expect(measure).rejects.toMatchObject({ code: 'kernel-status' });

    const ref = kernel.box([2, 2, 2]);
    port().replyOk(port().lastRequest as KernelOpRequest, 3.5);
    await expect(ref).rejects.toMatchObject({ code: 'kernel-status' });
  });

  it('un fatal del worker provoca pérdida controlada con reinicio', async () => {
    const { kernel, ports, port, restarts } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]);

    port().emit({ type: 'fatal', error: { code: 'kernel-status', message: 'init del WASM reventó' } });
    await expect(op).rejects.toMatchObject({ code: 'worker-timeout' });
    expect(restarts).toHaveLength(1);
    expect(restarts[0]?.reason).toBe('worker-fatal');
    expect(restarts[0]?.willRestart).toBe(true);
    expect(ports).toHaveLength(2);
    expect(kernel.stats.epoch).toBe(2);
  });

  it('un error de puerto (crash) también se recupera con reinicio', async () => {
    const { kernel, port, restarts } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]);

    port().crash();
    await expect(op).rejects.toMatchObject({ code: 'worker-timeout' });
    expect(restarts[0]?.reason).toBe('worker-fatal');
    expect(kernel.stats.epoch).toBe(2);
  });
});

describe('cancelación lógica por clave', () => {
  it('cancela en la cola: la solicitud nunca llega a publicarse', async () => {
    const { kernel, port } = createProxy();
    const op = kernel.box([1, 1, 1], { cancelKey: 'dibujo' });

    expect(kernel.cancel('dibujo')).toBe(1);
    await expect(op).rejects.toBeInstanceOf(OperationCancelledError);

    await handshake(kernel, port());
    expect(port().requests).toHaveLength(0); // retirada antes de enviarse
  });

  it('cancela en vuelo: el llamante no espera y la ref huérfana se libera con dispose', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1], { cancelKey: 'regenerar:objeto-1' });
    const request = port().lastRequest as KernelOpRequest;

    expect(kernel.cancel('regenerar:objeto-1')).toBe(1);
    await expect(op).rejects.toBeInstanceOf(OperationCancelledError);

    // el worker terminó la operación y devolvió un sólido: se desecha
    port().replyOk(request, 42);
    const disposeRequest = port().lastRequest as KernelOpRequest;
    expect(disposeRequest.op).toEqual({ kind: 'dispose', ref: 42 });
    expect(kernel.stats.refsAlive).toBe(0);
  });

  it('una clave nueva supersede a la pendiente anterior automáticamente', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const stale = kernel.box([1, 1, 1], { cancelKey: 'regenerar:objeto-1' });
    const fresh = kernel.box([2, 2, 2], { cancelKey: 'regenerar:objeto-1' });

    await expect(stale).rejects.toBeInstanceOf(OperationCancelledError);
    const [first, second] = port().requests;
    port().replyOk(second as KernelOpRequest, 5);
    await expect(fresh).resolves.toBe(1); // handle local (primera llegada)

    // el resultado tardío de la superseded se descarta y su sólido se libera
    port().replyOk(first as KernelOpRequest, 1);
    expect(port().lastRequest?.op).toEqual({ kind: 'dispose', ref: 1 });
  });

  it('cancelar una clave inexistente no hace nada', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    expect(kernel.cancel('nadie')).toBe(0);
  });
});

describe('dispose, disposeAll y handles', () => {
  it('dispose es idempotente para el consumidor (como en el kernel síncrono)', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const box = kernel.box([1, 1, 1]);
    port().replyOk(port().lastRequest as KernelOpRequest, 1);
    const handle = await box;
    expect(kernel.stats.refsAlive).toBe(1);

    const dispose = kernel.dispose(handle);
    const request = port().lastRequest as KernelOpRequest;
    port().replyOk(request, null);
    await expect(dispose).resolves.toBeUndefined();
    expect(kernel.stats.refsAlive).toBe(0);

    const postedBefore = port().posted.length;
    await expect(kernel.dispose(handle)).resolves.toBeUndefined();
    expect(port().posted.length).toBe(postedBefore); // sin publicar nada
  });

  it('disposeAll libera el mapa de handles y vacía el worker', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const first = kernel.box([1, 1, 1]);
    port().replyOk(port().lastRequest as KernelOpRequest, 1);
    await first;
    const second = kernel.box([2, 2, 2]);
    port().replyOk(port().lastRequest as KernelOpRequest, 2);
    await second;
    expect(kernel.stats.refsAlive).toBe(2);

    const op = kernel.disposeAll();
    expect(kernel.stats.refsAlive).toBe(0); // invalidados al instante
    port().replyOk(port().lastRequest as KernelOpRequest, null);
    await expect(op).resolves.toBeUndefined();
  });
});

describe('terminación y reinicio', () => {
  it('terminate rechaza pendientes con worker-terminated y cierra el puerto', async () => {
    const { kernel, port } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]);

    kernel.terminate();
    await expect(op).rejects.toMatchObject({ code: 'worker-terminated' });
    expect(port().terminated).toBe(true);
    expect(kernel.stats.state).toBe('terminated');
    await expect(kernel.box([2, 2, 2])).rejects.toMatchObject({ code: 'worker-terminated' });
  });

  it('terminateAndRestart arranca otra instancia: epoch nuevo y handles viejos → unknown-ref', async () => {
    const { kernel, ports, port } = createProxy();
    await handshake(kernel, port());
    const box = kernel.box([1, 1, 1]);
    port().replyOk(port().lastRequest as KernelOpRequest, 1);
    const oldHandle = await box;
    expect(kernel.stats.epoch).toBe(1);

    kernel.terminateAndRestart();
    expect(ports).toHaveLength(2);
    expect(kernel.stats.epoch).toBe(2);

    // los handles de la generación anterior no se reutilizan: error estable
    const stale = kernel.toMesh(oldHandle);
    const staleRejected = expect(stale).rejects.toMatchObject({ code: 'unknown-ref' });
    await handshake(kernel, port());
    await staleRejected;

    // la instancia nueva es plenamente operativa y no reutiliza handles
    const fresh = kernel.box([3, 3, 3]);
    const request = port().lastRequest as KernelOpRequest;
    expect(request.epoch).toBe(2);
    port().replyOk(request, 1);
    const freshHandle = await fresh;
    expect(freshHandle).not.toBe(oldHandle);
    expect(kernel.stats.refsAlive).toBe(1);
  });

  it('sin presupuesto de reinicio el proxy queda abajo con worker-terminated', async () => {
    const { kernel, port } = createProxy({ maxRestarts: 1 });
    await handshake(kernel, port());

    port().crash(); // 1.º fallo → reinicia (presupuesto agotado)
    expect(kernel.stats.state).toBe('starting');
    await handshake(kernel, port());
    port().crash(); // 2.º fallo → sin presupuesto → permanente
    expect(kernel.stats.state).toBe('terminated');
    await expect(kernel.box([1, 1, 1])).rejects.toMatchObject({ code: 'worker-terminated' });
  });

  it('terminateAndRestart reanuda incluso tras un cierre permanente', async () => {
    const { kernel, ports, port } = createProxy({ autoRestart: false });
    await handshake(kernel, port());
    kernel.terminate();
    expect(kernel.stats.state).toBe('terminated');

    kernel.terminateAndRestart();
    expect(ports).toHaveLength(2);
    const op = kernel.box([1, 1, 1]);
    await handshake(kernel, port());
    const request = port().lastRequest as KernelOpRequest;
    port().replyOk(request, 4);
    const handle = await op;
    expect(kernel.stats.refsAlive).toBe(1);
    expect(handle).toBeGreaterThanOrEqual(1);
  });
});

describe('watchdog (presupuestos PROVISIONALES)', () => {
  it('en reposo envía pings y un worker que responde no se declara caído', async () => {
    const { kernel, clock, port, restarts } = createProxy();
    await handshake(kernel, port());

    // 30 s respondiendo cada ping: vida normal
    for (let step = 0; step < 30; step += 1) {
      clock.advance(1_000);
      const ping = port().lastRequest;
      if (ping?.op.kind === 'ping') port().replyOk(ping, null);
    }
    expect(restarts).toHaveLength(0);
    expect(kernel.stats.state).toBe('ready');
  });

  it('un worker mudo en reposo se declara caído tras los ticks perdidos (worker-timeout)', async () => {
    const { kernel, clock, port, restarts } = createProxy();
    await handshake(kernel, port());
    // sin responder pings: 10 s de tolerancia + 2 ticks perdidos
    clock.advance(12_000);

    expect(restarts).toHaveLength(1);
    expect(restarts[0]?.reason).toBe('worker-timeout');
    expect(restarts[0]?.willRestart).toBe(true);
    expect(kernel.stats.epoch).toBe(2);
    expect(kernel.stats.state).toBe('starting');
  });

  it('con operaciones en vuelo el presupuesto es el amplio (no se mata por un ping tardío)', async () => {
    const { kernel, clock, port, restarts } = createProxy();
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]); // en vuelo: el worker monohilo está ocupado

    clock.advance(30_000); // > 10 s de reposo, pero < 60 s ocupado
    expect(restarts).toHaveLength(0);
    expect(kernel.stats.state).toBe('ready');

    clock.advance(40_000); // supera el presupuesto ocupado → pérdida
    expect(restarts).toHaveLength(1);
    await expect(op).rejects.toMatchObject({ code: 'worker-timeout' });
  });

  it('onRestart informa del epoch perdido, motivos y presupuesto', async () => {
    const { kernel, clock, port, restarts } = createProxy({ maxRestarts: 0 });
    await handshake(kernel, port());
    const op = kernel.box([1, 1, 1]); // en vuelo → presupuesto ocupado (60 s)

    clock.advance(65_000); // supera el presupuesto ocupado + ticks perdidos
    await expect(op).rejects.toMatchObject({ code: 'worker-timeout' });
    expect(restarts).toHaveLength(1);
    expect(restarts[0]).toMatchObject({
      reason: 'worker-timeout',
      epoch: 1,
      rejectedRequests: 1,
      willRestart: false,
    });
    expect(kernel.stats.state).toBe('terminated');
  });
});
