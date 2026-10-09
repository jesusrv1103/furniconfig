import { describe, expect, it } from 'vitest';
import { createAutosaveScheduler } from '../src/lib/designs/autosave.js';

/** Temporizadores manuales: las pruebas disparan los timers a mano. */
function makeManualTimers() {
  let nextId = 1;
  const pending = new Map<number, () => void>();
  return {
    timers: {
      setTimer(callback: () => void, _delayMs: number): unknown {
        const id = nextId;
        nextId += 1;
        pending.set(id, callback);
        return id;
      },
      clearTimer(handle: unknown): void {
        pending.delete(handle as number);
      },
    },
    pendingCount: () => pending.size,
    fireAll(): void {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) {
        callback();
      }
    },
  };
}

/** Cede el turno a la microtarea de ejecución del scheduler. */
function tick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('createAutosaveScheduler (guardado automático con debounce)', () => {
  it('programa un guardado que se ejecuta al vencer el plazo', async () => {
    const manual = makeManualTimers();
    let saves = 0;
    const scheduler = createAutosaveScheduler({
      delayMs: 1000,
      save: () => {
        saves += 1;
      },
      timers: manual.timers,
    });

    scheduler.schedule();
    expect(manual.pendingCount()).toBe(1);
    expect(saves).toBe(0);

    manual.fireAll();
    await tick();
    expect(saves).toBe(1);
  });

  it('el debounce reemplaza el temporizador: solo un guardado', async () => {
    const manual = makeManualTimers();
    let saves = 0;
    const scheduler = createAutosaveScheduler({
      delayMs: 1000,
      save: () => {
        saves += 1;
      },
      timers: manual.timers,
    });

    scheduler.schedule();
    scheduler.schedule();
    scheduler.schedule();
    expect(manual.pendingCount()).toBe(1); // un solo temporizador vivo

    manual.fireAll();
    await tick();
    expect(saves).toBe(1);
  });

  it('cancelar impide el guardado pendiente', async () => {
    const manual = makeManualTimers();
    let saves = 0;
    const scheduler = createAutosaveScheduler({
      delayMs: 1000,
      save: () => {
        saves += 1;
      },
      timers: manual.timers,
    });

    scheduler.schedule();
    scheduler.cancel();
    expect(manual.pendingCount()).toBe(0);

    manual.fireAll();
    await tick();
    expect(saves).toBe(0);
  });

  it('flush ejecuta de inmediato solo si hay guardado pendiente', async () => {
    const manual = makeManualTimers();
    let saves = 0;
    const scheduler = createAutosaveScheduler({
      delayMs: 1000,
      save: () => {
        saves += 1;
      },
      timers: manual.timers,
    });

    scheduler.flush(); // nada pendiente
    await tick();
    expect(saves).toBe(0);

    scheduler.schedule();
    scheduler.flush();
    await tick();
    expect(saves).toBe(1);
    expect(manual.pendingCount()).toBe(0); // el temporizador se limpió
  });

  it('un fallo del guardado va a onError y no escapa', async () => {
    const manual = makeManualTimers();
    const errors: unknown[] = [];
    const scheduler = createAutosaveScheduler({
      delayMs: 1000,
      save: () => Promise.reject(new Error('cuota llena')),
      onError: (error) => errors.push(error),
      timers: manual.timers,
    });

    scheduler.schedule();
    manual.fireAll();
    await tick();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('cuota llena');
  });

  it('permite reprogramar tras cancelar y tras ejecutar', async () => {
    const manual = makeManualTimers();
    let saves = 0;
    const scheduler = createAutosaveScheduler({
      delayMs: 1000,
      save: () => {
        saves += 1;
      },
      timers: manual.timers,
    });

    scheduler.schedule();
    scheduler.cancel();
    scheduler.schedule();
    manual.fireAll();
    await tick();

    scheduler.schedule();
    manual.fireAll();
    await tick();
    expect(saves).toBe(2);
  });
});
