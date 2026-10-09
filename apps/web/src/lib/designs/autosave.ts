export interface AutosaveTimers {
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface AutosaveSchedulerOptions {
  /** Retraso del guardado (debounce). */
  delayMs: number;
  /** Acción de guardado; sus errores se envían a `onError`. */
  save: () => void | Promise<void>;
  onError?: (error: unknown) => void;
  /** Reloj de temporizadores inyectable (pruebas deterministas). */
  timers?: AutosaveTimers;
}

export interface AutosaveScheduler {
  /** (Re)programa el guardado; cualquier cambio reinicia la ventana. */
  schedule(): void;
  /** Cancela un guardado pendiente. */
  cancel(): void;
  /** Ejecuta de inmediato el guardado pendiente, si lo hay. */
  flush(): void;
}

const defaultTimers: AutosaveTimers = {
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Guardado automático con debounce y temporizadores inyectables.
 * Un solo guardado pendiente como máximo; `save` nunca se lanza hacia
 * fuera (los errores pasan a `onError`).
 */
export function createAutosaveScheduler(
  options: AutosaveSchedulerOptions,
): AutosaveScheduler {
  const timers = options.timers ?? defaultTimers;
  let handle: unknown = null;
  let pending = false;

  const run = (): void => {
    handle = null;
    if (!pending) {
      return;
    }
    pending = false;
    void Promise.resolve()
      .then(options.save)
      .catch((error: unknown) => {
        options.onError?.(error);
      });
  };

  return {
    schedule() {
      pending = true;
      if (handle !== null) {
        timers.clearTimer(handle);
      }
      handle = timers.setTimer(run, options.delayMs);
    },
    cancel() {
      if (handle !== null) {
        timers.clearTimer(handle);
        handle = null;
      }
      pending = false;
    },
    flush() {
      if (!pending) {
        return;
      }
      if (handle !== null) {
        timers.clearTimer(handle);
        handle = null;
      }
      run();
    },
  };
}
