/**
 * FASE-4C-A §6 — runtime del motor geométrico.
 *
 * Cubre las reglas de la fase:
 * - abrir la pantalla NO crea el Worker (fábrica intacta hasta
 *   `ensureKernel`);
 * - máquina de estados `idle → initializing → ready / error`
 *   más `restarting`;
 * - una sola creación ante llamadas concurrentes;
 * - limpieza: `dispose` termina el kernel, bloquea nuevas
 *   creaciones y admite ciclos crear→disponer→crear
 *   (montaje duplicado de React StrictMode).
 */

import { describe, expect, it, vi } from 'vitest';

import type { AsyncGeometryKernel } from '@furniconfig/kernel-adapter';

import { ModelerGeometryRuntime } from '../../src/lib/modeler/geometry-runtime.js';

interface FakeKernel extends AsyncGeometryKernel {
  terminate?(): void;
}

function makeKernel(ready: Promise<void> = Promise.resolve()): FakeKernel {
  return {
    name: 'fake-runtime',
    ready,
    terminate: vi.fn(),
    box: () => Promise.reject(new Error('no usado')),
    fromSketch: () => Promise.reject(new Error('no usado')),
    union: () => Promise.reject(new Error('no usado')),
    difference: () => Promise.reject(new Error('no usado')),
    intersect: () => Promise.reject(new Error('no usado')),
    translate: () => Promise.reject(new Error('no usado')),
    rotateZ: () => Promise.reject(new Error('no usado')),
    scale: () => Promise.reject(new Error('no usado')),
    measure: () => Promise.reject(new Error('no usado')),
    toMesh: () => Promise.reject(new Error('no usado')),
    dispose: () => Promise.resolve(),
    disposeAll: () => Promise.resolve(),
  } as unknown as FakeKernel;
}

describe('ModelerGeometryRuntime (4C-A)', () => {
  it('arranca en idle SIN invocar la fábrica del Worker', () => {
    const createKernel = vi.fn(() => makeKernel());
    const runtime = new ModelerGeometryRuntime({ createKernel });

    expect(runtime.status).toBe('idle');
    expect(runtime.disposed).toBe(false);
    // nada de leer estado ni construir debe tocar el Worker:
    expect(runtime.status).toBe('idle');
    expect(createKernel).not.toHaveBeenCalled();
  });

  it('ensureKernel crea bajo demanda y transiciona a ready', async () => {
    const createKernel = vi.fn(() => makeKernel());
    const statuses: string[] = [];
    const runtime = new ModelerGeometryRuntime({
      createKernel,
      onStatusChange: (status) => statuses.push(status),
    });

    const kernel = await runtime.ensureKernel();
    expect(createKernel).toHaveBeenCalledTimes(1);
    expect(runtime.status).toBe('ready');
    expect(statuses).toEqual(['initializing', 'ready']);
    // segunda llamada reutiliza la MISMA instancia
    expect(await runtime.ensureKernel()).toBe(kernel);
    expect(createKernel).toHaveBeenCalledTimes(1);
  });

  it('llamadas concurrentes comparten una única creación', async () => {
    const createKernel = vi.fn(() => makeKernel());
    const runtime = new ModelerGeometryRuntime({ createKernel });

    const [a, b, c] = await Promise.all([
      runtime.ensureKernel(),
      runtime.ensureKernel(),
      runtime.ensureKernel(),
    ]);
    expect(createKernel).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('un kernel listo con error de arranque pasa a error y permite reintentar', async () => {
    let attempt = 0;
    const createKernel = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? makeKernel(Promise.reject(new Error('WASM caído')))
        : makeKernel();
    });
    const runtime = new ModelerGeometryRuntime({ createKernel });

    await expect(runtime.ensureKernel()).rejects.toThrow('WASM caído');
    expect(runtime.status).toBe('error');

    // reintento limpio
    await expect(runtime.ensureKernel()).resolves.toBeDefined();
    expect(runtime.status).toBe('ready');
    expect(createKernel).toHaveBeenCalledTimes(2);
  });

  it('rechaza si la fábrica lanza de forma síncrona (estado error)', async () => {
    const runtime = new ModelerGeometryRuntime({
      createKernel: () => {
        throw new Error('sin permiso para crear Worker');
      },
    });
    await expect(runtime.ensureKernel()).rejects.toThrow(
      'sin permiso para crear Worker',
    );
    expect(runtime.status).toBe('error');
  });

  it('expone los estados de reinicio (restarting → ready)', () => {
    const statuses: string[] = [];
    const runtime = new ModelerGeometryRuntime({
      createKernel: () => makeKernel(),
      onStatusChange: (status) => statuses.push(status),
    });
    runtime.notifyRestarting();
    runtime.notifyReady();
    expect(statuses).toEqual(['restarting', 'ready']);
  });

  it('dispose termina el kernel y bloquea nuevas creaciones', async () => {
    const createKernel = vi.fn(() => makeKernel());
    const runtime = new ModelerGeometryRuntime({ createKernel });
    const kernel = await runtime.ensureKernel();

    runtime.dispose();

    expect(runtime.disposed).toBe(true);
    expect((kernel as FakeKernel).terminate).toHaveBeenCalledTimes(1);
    await expect(runtime.ensureKernel()).rejects.toThrow(/disponido/);
    expect(createKernel).toHaveBeenCalledTimes(1);
  });

  it('dispose es idempotente (StrictMode: crear → disponer → crear)', async () => {
    const createKernel = vi.fn(() => makeKernel());

    // ciclo 1 (montaje)
    const first = new ModelerGeometryRuntime({ createKernel });
    const firstKernel = await first.ensureKernel();
    first.dispose();
    first.dispose(); // segunda invocación inofensiva
    expect((firstKernel as FakeKernel).terminate).toHaveBeenCalledTimes(1);

    // ciclo 2 (remontaje de StrictMode): runtime NUEVO e independiente
    const second = new ModelerGeometryRuntime({ createKernel });
    expect(second.status).toBe('idle');
    await expect(second.ensureKernel()).resolves.toBeDefined();
    expect(second.status).toBe('ready');
    expect(createKernel).toHaveBeenCalledTimes(2);

    second.dispose();
  });

  it('si se dispone mientras el Worker arranca, termina el recién creado', async () => {
    let resolveReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const kernel = makeKernel(ready);
    const createKernel = vi.fn(() => kernel);
    const runtime = new ModelerGeometryRuntime({ createKernel });

    const pending = runtime.ensureKernel();
    runtime.dispose(); // desmontaje durante la inicialización
    resolveReady();

    await expect(pending).rejects.toThrow(/disponido durante/);
    expect(kernel.terminate).toHaveBeenCalledTimes(1);
    expect(runtime.status).toBe('idle');
  });
});
