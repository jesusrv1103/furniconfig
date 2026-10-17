/**
 * FASE-4C-A — runtime del motor geométrico del modelador.
 *
 * Punto de integración de `AsyncGeometryKernel` con la futura
 * `SceneGeometryService` (4C-B). Clase SIN dependencias de
 * React ni del DOM: testeable en node con kernels falsos.
 *
 * Reglas de la fase:
 *
 * - **Nada de Worker por abrir la pantalla**: el runtime se
 *   construye en `idle` y NO llama a `createKernel` hasta que
 *   alguien invoque `ensureKernel()` (ninguna operación
 *   geométrica existe en 4C-A, así que en la práctica nunca).
 * - Estados: `idle → initializing → ready` (o `error`), más
 *   `restarting` para el reinicio del worker (4C-B).
 * - `dispose()` termina el kernel si existía, impide nuevas
 *   creaciones y es idempotente (montaje duplicado de
 *   React `StrictMode`: crear → disponer → crear otra vez).
 */

import type { AsyncGeometryKernel } from '@furniconfig/kernel-adapter';

/** Estados del motor geométrico (contrato de UI y tests). */
export type GeometryKernelStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'restarting'
  | 'error';

/** Opciones de creación del runtime. */
export interface ModelerGeometryRuntimeOptions {
  /**
   * Fábrica del kernel. Se invoca UNA sola vez por ciclo de
   * vida y solo bajo demanda (`ensureKernel`).
   */
  readonly createKernel: () => AsyncGeometryKernel;
  /** Notificación de cada cambio de estado (para la UI). */
  readonly onStatusChange?: (status: GeometryKernelStatus) => void;
}

/** Kernel mínimo que además puede terminarse al disponer. */
interface TerminableKernel extends AsyncGeometryKernel {
  terminate?(): void;
}

export class ModelerGeometryRuntime {
  readonly #options: ModelerGeometryRuntimeOptions;
  #status: GeometryKernelStatus = 'idle';
  #kernel: TerminableKernel | null = null;
  #creating: Promise<AsyncGeometryKernel> | null = null;
  #disposed = false;

  constructor(options: ModelerGeometryRuntimeOptions) {
    this.#options = options;
  }

  get status(): GeometryKernelStatus {
    return this.#status;
  }

  /** `true` tras `dispose()`; el runtime queda inoperante. */
  get disposed(): boolean {
    return this.#disposed;
  }

  /**
   * Garantiza un kernel listo: crea el Worker bajo demanda y
   * espera a `kernel.ready`. Llamadas concurrentes comparten
   * la misma creación (nunca se instancian dos kernels).
   *
   * Rechaza si el runtime está disponido.
   */
  ensureKernel(): Promise<AsyncGeometryKernel> {
    if (this.#disposed) {
      return Promise.reject(
        new Error('ModelerGeometryRuntime disponido: sin motor geométrico.'),
      );
    }
    if (this.#kernel !== null) {
      return Promise.resolve(this.#kernel);
    }
    if (this.#creating !== null) {
      return this.#creating;
    }

    this.#setStatus('initializing');
    let kernel: TerminableKernel;
    try {
      kernel = this.#options.createKernel();
    } catch (error) {
      this.#setStatus('error');
      return Promise.reject(error);
    }

    this.#creating = kernel.ready.then(
      () => {
        this.#creating = null;
        if (this.#disposed) {
          // El runtime se disponió mientras el Worker arrancaba:
          // no se cuelga ningún recurso.
          terminateQuietly(kernel);
          this.#setStatus('idle');
          throw new Error(
            'ModelerGeometryRuntime disponido durante la inicialización.',
          );
        }
        this.#kernel = kernel;
        this.#setStatus('ready');
        return kernel;
      },
      (error: unknown) => {
        this.#creating = null;
        if (!this.#disposed) {
          this.#setStatus('error');
        }
        throw error;
      },
    );
    return this.#creating;
  }

  /**
   * El worker entró en reinicio (watchdog o reinicio manual):
   * la UI muestra `restarting` hasta que 4C-B reconstruya la
   * geometría desde el documento y vuelva a `ready`.
   */
  notifyRestarting(): void {
    if (this.#disposed) return;
    this.#setStatus('restarting');
  }

  /** El worker volvió a estar operativo tras un reinicio. */
  notifyReady(): void {
    if (this.#disposed) return;
    this.#setStatus('ready');
  }

  /** Limpieza total: termina el kernel y bloquea nuevas creaciones. */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#kernel !== null) {
      terminateQuietly(this.#kernel);
      this.#kernel = null;
    }
    // Si hay una creación en vuelo, su continuación detecta
    // `#disposed` y termina el kernel recién creado.
    this.#setStatus('idle');
  }

  #setStatus(status: GeometryKernelStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    this.#options.onStatusChange?.(status);
  }
}

function terminateQuietly(kernel: TerminableKernel): void {
  try {
    kernel.terminate?.();
  } catch {
    // Un fallo al terminar no debe impedir la limpieza.
  }
}
