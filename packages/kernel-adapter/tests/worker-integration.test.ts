/**
 * FASE-4B-C — integración real: proxy + sesión del worker comunicados por un
 * `MessageChannel` global de Node (structured clone y **transfer**
 * reales, WASM de Manifold real). La verificación con hilos aislados y
 * Chromium real vive en el experimento `experiments/worker-perf` (§9).
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  ManifoldKernel,
  WorkerGeometryKernel,
  startKernelWorker,
  type KernelWorkerSession,
  type WorkerKernelOptions,
} from '../src/index.js';
import { expectClosedMesh, expectValidMesh } from './helpers.js';
import { NodePortAdapter, SpyPort } from './worker-helpers.js';

interface Linked {
  kernel: WorkerGeometryKernel;
  sessions: KernelWorkerSession[];
  spies: SpyPort[];
  adapters: NodePortAdapter[];
}

const openLinks: Linked[] = [];

function createLinkedKernel(overrides?: Partial<WorkerKernelOptions>): Linked {
  const sessions: KernelWorkerSession[] = [];
  const spies: SpyPort[] = [];
  const adapters: NodePortAdapter[] = [];
  const kernel = new WorkerGeometryKernel({
    createPort: () => {
      const channel = new MessageChannel();
      const workerSide = new NodePortAdapter(channel.port2);
      const spy = new SpyPort(workerSide);
      adapters.push(new NodePortAdapter(channel.port1), workerSide);
      spies.push(spy);
      sessions.push(startKernelWorker(spy, new ManifoldKernel()));
      const proxySide = adapters[adapters.length - 2] as NodePortAdapter;
      return proxySide;
    },
    ...overrides,
  });
  const link = { kernel, sessions, spies, adapters };
  openLinks.push(link);
  return link;
}

afterEach(() => {
  for (const link of openLinks.splice(0)) {
    link.kernel.terminate();
    for (const session of link.sessions) session.close();
    for (const adapter of link.adapters) adapter.terminate();
  }
});

const mm = (value: number): number => +value.toFixed(6); // exactitud de dobles

describe('integración worker real (structured clone + WASM)', () => {
  it('handshake real y operación básica: box con medidas exactas y malla cerrada', async () => {
    const { kernel } = createLinkedKernel();
    await kernel.ready;
    expect(kernel.stats.lastInitMs).toBeGreaterThan(0);

    const handle = await kernel.box([800, 600, 18]);
    const mesh = await kernel.toMesh(handle);
    expectValidMesh(mesh);
    expectClosedMesh(mesh);
    expect(mesh.bounds.min).toEqual([0, 0, 0]);
    expect(mesh.bounds.max).toEqual([800, 600, 18]);

    const measure = await kernel.measure(handle);
    expect(mm(measure.volumeMm3)).toBe(8_640_000);
  });

  it('toMesh transfiere sus ArrayBuffer (zero-copy) y la malla llega intacta', async () => {
    const { kernel, spies } = createLinkedKernel();
    await kernel.ready;
    const handle = await kernel.box([1200, 600, 18]);

    const mesh = await kernel.toMesh(handle);
    const spy = spies[0] as SpyPort;

    // el worker publicó exactamente una respuesta con transfer (la malla)
    const transferred = spy.posted.filter(
      ({ transfer }) => transfer !== undefined && transfer.length === 2,
    );
    expect(transferred, 'toMesh debe transferir sus dos buffers').toHaveLength(1);
    const response = transferred[0]?.message as {
      ok?: boolean;
      value?: { positions?: unknown; indices?: unknown };
    };
    expect(response.ok).toBe(true);
    expect(response.value?.positions).toBeInstanceOf(Float32Array);

    // el emisor ya no conserva los bytes (detach real, no copia)
    for (const buffer of spy.transferredBuffers) {
      expect(buffer.byteLength).toBe(0);
    }
    // el receptor los recibió completos y utilizables
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.positions[0]).toBe(0);
    expect(mesh.indices.length % 3).toBe(0);
  });

  it('fromSketch + difference: volumen exacto y errores tipados que cruzan el borde', async () => {
    const { kernel } = createLinkedKernel();
    await kernel.ready;

    const plate = await kernel.fromSketch(
      [
        [0, 0],
        [1200, 0],
        [1200, 600],
        [0, 600],
      ],
      18,
    );
    const hole = await kernel.box([200, 200, 100]);
    const holed = await kernel.difference(plate, hole);
    const measure = await kernel.measure(holed);
    expect(mm(measure.volumeMm3)).toBe((1200 * 600 - 200 * 200) * 18);

    // un croquis auto-intersechado se rechaza con el código estable del kernel
    await expect(
      kernel.fromSketch(
        [
          [0, 0],
          [100, 100],
          [100, 0],
          [0, 100],
        ],
        18,
      ),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('solicitudes concurrentes reales se emparejan correctamente', async () => {
    const { kernel } = createLinkedKernel();
    await kernel.ready;

    const sizes: Array<[number, number, number]> = Array.from(
      { length: 10 },
      (_, index) => [10 + index, 20 + index, 30 + index] as [number, number, number],
    );
    const handles = await Promise.all(sizes.map((size) => kernel.box(size)));
    const measures = await Promise.all(handles.map((handle) => kernel.measure(handle)));

    sizes.forEach((size, index) => {
      const measure = measures[index];
      expect(measure).toBeDefined();
      expect(measure?.boundsMm.max).toEqual(size);
      expect(mm(measure?.volumeMm3 ?? 0)).toBe(size[0] * size[1] * size[2]);
    });
  });

  it('cancelación real: el sólido huérfano se libera en el worker (sin fugas)', async () => {
    const { kernel, sessions } = createLinkedKernel();
    await kernel.ready;
    const session = sessions[0] as KernelWorkerSession;

    const op = kernel.box([50, 50, 50], { cancelKey: 'regenerar:objeto-1' });
    expect(kernel.cancel('regenerar:objeto-1')).toBe(1);
    await expect(op).rejects.toMatchObject({ name: 'OperationCancelledError' });

    // el worker terminó la operación y creó un sólido: el proxy lo desecha
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(session.kernel.liveCount).toBe(0);
  });

  it('dispose y disposeAll end-to-end liberan sólidos del worker', async () => {
    const { kernel, sessions } = createLinkedKernel();
    await kernel.ready;
    const session = sessions[0] as KernelWorkerSession;

    const handle = await kernel.box([10, 10, 10]);
    expect(session.kernel.liveCount).toBe(1);
    await kernel.dispose(handle);
    expect(session.kernel.liveCount).toBe(0);
    // dispose de un handle ya liberado: resuelve sin tocar el worker
    await expect(kernel.dispose(handle)).resolves.toBeUndefined();
    expect(session.kernel.liveCount).toBe(0);

    const a = await kernel.box([10, 10, 10]);
    expect(a).toBeDefined();
    expect(session.kernel.liveCount).toBe(1);
    await kernel.disposeAll();
    expect(session.kernel.liveCount).toBe(0);
  });

  it('tras terminateAndRestart los handles viejos dan unknown-ref y el worker nuevo opera', async () => {
    const { kernel, sessions } = createLinkedKernel();
    await kernel.ready;
    const session = sessions[0] as KernelWorkerSession;
    const oldHandle = await kernel.box([5, 5, 5]);

    kernel.terminateAndRestart();
    session.close();

    await expect(kernel.toMesh(oldHandle)).rejects.toMatchObject({ code: 'unknown-ref' });

    // la sesión nueva (segundo createPort) queda lista y operativa
    const fresh = await kernel.box([7, 7, 7]);
    const measure = await kernel.measure(fresh);
    expect(mm(measure.volumeMm3)).toBe(343);
    expect(kernel.stats.epoch).toBe(2);
  });

  it('determinismo: dos operaciones idénticas producen mallas idénticas a través del worker', async () => {
    const { kernel } = createLinkedKernel();
    await kernel.ready;

    const run = async (): Promise<{ positions: Float32Array; indices: Uint32Array }> => {
      const plate = await kernel.fromSketch(
        [
          [0, 0],
          [300, 0],
          [300, 200],
          [0, 200],
        ],
        18,
      );
      const cutter = await kernel.box([80, 80, 100]);
      const holed = await kernel.difference(plate, cutter);
      return kernel.toMesh(holed);
    };

    const first = await run();
    const second = await run();
    expect(Array.from(first.positions)).toEqual(Array.from(second.positions));
    expect(Array.from(first.indices)).toEqual(Array.from(second.indices));
  });
});
