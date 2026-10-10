import { useEffect, useMemo, useRef, useState } from 'react';
import type { WardrobeConfig } from '@furniconfig/geometry-core';
import { resetConfig } from '../lib/config.js';
import {
  createAutosaveScheduler,
  type AutosaveScheduler,
} from '../lib/designs/autosave.js';
import { describeDesignError, DesignStorageError } from '../lib/designs/errors.js';
import { DesignLibrary } from '../lib/designs/library.js';
import { createLocalStorageDesignStorage } from '../lib/designs/local-storage.js';
import type { DesignStorage } from '../lib/designs/repository.js';
import {
  DESIGN_SESSION_VERSION,
  type DesignSummary,
} from '../lib/designs/types.js';

export type DesignStatusTone = 'success' | 'error' | 'info';

export interface DesignStatus {
  tone: DesignStatusTone;
  text: string;
}

export interface DesignSessionState {
  /** `true` cuando la sesión y la lista se han cargado. */
  hydrated: boolean;
  designs: readonly DesignSummary[];
  activeId: string | null;
  activeName: string | null;
  /** `true` si la configuración difiere de la última escritura. */
  dirty: boolean;
  status: DesignStatus | null;
}

export interface DesignSessionActions {
  createDesign(name: string): Promise<boolean>;
  saveNow(): Promise<boolean>;
  openDesign(id: string): Promise<boolean>;
  renameDesign(id: string, name: string): Promise<boolean>;
  duplicateDesign(id: string): Promise<boolean>;
  deleteDesign(id: string): Promise<boolean>;
  newProject(): Promise<boolean>;
  importDesign(text: string): Promise<boolean>;
  exportDesign(id: string): Promise<string | null>;
}

export interface DesignSession {
  state: DesignSessionState;
  actions: DesignSessionActions;
}

export interface UseDesignSessionOptions {
  config: WardrobeConfig;
  onConfigChange: (config: WardrobeConfig) => void;
  /** Adaptador inyectable (por defecto, `localStorage`). */
  storage?: DesignStorage;
  /** Retraso del guardado automático en ms (por defecto, 1000). */
  autosaveDelayMs?: number;
}

const DEFAULT_AUTOSAVE_DELAY_MS = 1000;

/**
 * Sesión de diseños: hidratación de la sesión anterior, guardado
 * automático con debounce y acciones CRUD sobre `DesignLibrary`.
 *
 * El hook solo orquesta estado React: toda la lógica vive en la capa
 * pura (`lib/designs`) para poder probarla sin DOM. La configuración
 * pertenece a `App`; aquí solo se pide recomponerla (`onConfigChange`).
 */
export function useDesignSession({
  config,
  onConfigChange,
  storage,
  autosaveDelayMs = DEFAULT_AUTOSAVE_DELAY_MS,
}: UseDesignSessionOptions): DesignSession {
  const storageRef = useMemo<DesignStorage>(
    () => storage ?? createLocalStorageDesignStorage(),
    [storage],
  );
  const libraryRef = useMemo(() => new DesignLibrary({ repository: storageRef }), [storageRef]);

  const [state, setState] = useState<{
    hydrated: boolean;
    designs: DesignSummary[];
    activeId: string | null;
    dirty: boolean;
    status: DesignStatus | null;
  }>(() => ({
    hydrated: false,
    designs: [],
    activeId: null,
    dirty: false,
    status: null,
  }));

  // Última configuración conocida (para acciones y guardado automático).
  const configRef = useRef(config);
  // Configuración vista por el efecto de persistencia: permite
  // distinguir "edición del usuario" de "cambio intencional" (abrir,
  // restaurar sesión, nuevo proyecto).
  const prevConfigRef = useRef(config);
  const activeIdRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const fail = (error: unknown): void => {
    setState((prev) => ({
      ...prev,
      status: { tone: 'error', text: describeDesignError(error) },
    }));
  };

  const runAction = async (operation: () => Promise<void>): Promise<boolean> => {
    if (busyRef.current) {
      return false;
    }
    busyRef.current = true;
    try {
      await operation();
      return true;
    } catch (error) {
      fail(error);
      return false;
    } finally {
      busyRef.current = false;
    }
  };

  const autosave = useMemo<AutosaveScheduler>(
    () =>
      createAutosaveScheduler({
        delayMs: autosaveDelayMs,
        save: async () => {
          const id = activeIdRef.current;
          if (id === null) {
            return;
          }
          const snapshot = configRef.current;
          const record = await libraryRef.saveActive(id, snapshot);
          // Si la configuración cambió durante la escritura, el nuevo
          // cambio ya reprogramó el guardado: no se limpia `dirty`.
          if (configRef.current !== snapshot) {
            return;
          }
          setState((prev) =>
            prev.activeId === id
              ? {
                  ...prev,
                  dirty: false,
                  status: {
                    tone: 'success',
                    text: `Guardado automático de «${record.name}».`,
                  },
                }
              : prev,
          );
        },
        onError: fail,
      }),
    [libraryRef, autosaveDelayMs],
  );

  // E1: mantener la referencia de configuración siempre actualizada.
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // E2: hidratación — recuperar sesión (borrador + diseño activo) y lista.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let restoredConfig: WardrobeConfig | null = null;
      let restoredActiveId: string | null = null;
      let restoredDirty = false;
      let status: DesignStatus | null = null;

      try {
        const session = await storageRef.load();
        if (session) {
          const activeExists =
            session.activeId === null ||
            (await storageRef.get(session.activeId)) !== null;
          restoredConfig = session.config;
          restoredActiveId = activeExists ? session.activeId : null;
          restoredDirty = activeExists && session.dirty;
          if (session.activeId !== null && !activeExists) {
            status = {
              tone: 'info',
              text: 'El diseño activo ya no existe; la configuración se recuperó como borrador.',
            };
          }
        }
      } catch (error) {
        status = { tone: 'error', text: describeDesignError(error) };
      }

      let designs: DesignSummary[] = [];
      try {
        designs = await storageRef.list();
      } catch (error) {
        status = { tone: 'error', text: describeDesignError(error) };
      }

      if (cancelled) {
        return;
      }

      if (restoredConfig) {
        // La restauración NO es una edición: se marca para que el
        // efecto de persistencia no lo confunda con `dirty`.
        configRef.current = restoredConfig;
        prevConfigRef.current = restoredConfig;
        onConfigChange(restoredConfig);
      }
      activeIdRef.current = restoredActiveId;
      setState({
        hydrated: true,
        designs,
        activeId: restoredActiveId,
        dirty: restoredDirty,
        status,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [storageRef, onConfigChange]);

  // E3: persistir la sesión en cada cambio y programar el guardado
  // automático del diseño activo.
  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    const configChanged = prevConfigRef.current !== config;
    prevConfigRef.current = config;
    const dirtyNow =
      configChanged && state.activeId !== null ? true : state.dirty;
    activeIdRef.current = state.activeId;

    if (dirtyNow !== state.dirty) {
      setState((prev) => (prev.dirty === dirtyNow ? prev : { ...prev, dirty: dirtyNow }));
    }

    void storageRef
      .save({
        storageVersion: DESIGN_SESSION_VERSION,
        config,
        activeId: state.activeId,
        dirty: dirtyNow,
      })
      .then(() => {
        // Un error de guardado anterior (p. ej. una
        // configuración inválida transitoria) no debe
        // quedar permanente: al persistir con una
        // configuración válida se limpia el estado.
        setState((prev) =>
          prev.status?.tone === 'error' ? { ...prev, status: null } : prev,
        );
      })
      .catch((error: unknown) => fail(error));

    if (state.activeId !== null && dirtyNow) {
      autosave.schedule();
    } else {
      autosave.cancel();
    }
  }, [config, state.activeId, state.dirty, state.hydrated, storageRef, autosave]);

  // E4: no dejar temporizadores huérfanos al desmontar.
  useEffect(() => () => autosave.cancel(), [autosave]);

  const actions: DesignSessionActions = {
    async createDesign(name) {
      return runAction(async () => {
        const record = await libraryRef.create(name, configRef.current);
        const designs = await libraryRef.list();
        activeIdRef.current = record.id;
        setState((prev) => ({
          ...prev,
          designs,
          activeId: record.id,
          dirty: false,
          status: { tone: 'success', text: `Diseño «${record.name}» creado.` },
        }));
      });
    },

    async saveNow() {
      return runAction(async () => {
        const id = activeIdRef.current;
        if (id === null) {
          throw new DesignStorageError(
            'not-found',
            'No hay un diseño activo para guardar.',
          );
        }
        const record = await libraryRef.saveActive(id, configRef.current);
        const designs = await libraryRef.list();
        setState((prev) => ({
          ...prev,
          designs,
          dirty: false,
          status: { tone: 'success', text: `Diseño «${record.name}» guardado.` },
        }));
      });
    },

    async openDesign(id) {
      return runAction(async () => {
        const record = await libraryRef.get(id);
        if (!record) {
          throw new DesignStorageError('not-found', 'El diseño ya no existe.');
        }
        configRef.current = record.config;
        prevConfigRef.current = record.config;
        onConfigChange(record.config);
        activeIdRef.current = id;
        const designs = await libraryRef.list();
        setState((prev) => ({
          ...prev,
          designs,
          activeId: id,
          dirty: false,
          status: { tone: 'success', text: `Diseño «${record.name}» abierto.` },
        }));
      });
    },

    async renameDesign(id, name) {
      return runAction(async () => {
        const record = await libraryRef.rename(id, name);
        const designs = await libraryRef.list();
        setState((prev) => ({
          ...prev,
          designs,
          status: {
            tone: 'success',
            text: `Diseño renombrado a «${record.name}».`,
          },
        }));
      });
    },

    async duplicateDesign(id) {
      return runAction(async () => {
        const copy = await libraryRef.duplicate(id);
        const designs = await libraryRef.list();
        setState((prev) => ({
          ...prev,
          designs,
          status: { tone: 'success', text: `Copia creada: «${copy.name}».` },
        }));
      });
    },

    async deleteDesign(id) {
      return runAction(async () => {
        const existing = await libraryRef.get(id);
        await libraryRef.remove(id);
        const designs = await libraryRef.list();
        const wasActive = activeIdRef.current === id;
        if (wasActive) {
          activeIdRef.current = null;
        }
        const name = existing?.name ?? id;
        setState((prev) => ({
          ...prev,
          designs,
          activeId: wasActive ? null : prev.activeId,
          dirty: wasActive ? false : prev.dirty,
          status: {
            tone: 'success',
            text: wasActive
              ? `Diseño «${name}» eliminado. La configuración actual se conserva como borrador.`
              : `Diseño «${name}» eliminado.`,
          },
        }));
      });
    },

    async newProject() {
      return runAction(async () => {
        const fresh = resetConfig();
        configRef.current = fresh;
        prevConfigRef.current = fresh;
        onConfigChange(fresh);
        activeIdRef.current = null;
        setState((prev) => ({
          ...prev,
          activeId: null,
          dirty: false,
          status: {
            tone: 'info',
            text: 'Nuevo proyecto creado: el diseño anterior se conserva en la lista.',
          },
        }));
      });
    },

    async importDesign(text) {
      // Un archivo importado NUNCA toca el diseño activo: solo se
      // añade a la lista (y si el JSON es inválido, ni eso).
      return runAction(async () => {
        const record = await libraryRef.importJson(text);
        const designs = await libraryRef.list();
        setState((prev) => ({
          ...prev,
          designs,
          status: { tone: 'success', text: `Diseño «${record.name}» importado.` },
        }));
      });
    },

    async exportDesign(id) {
      try {
        const json = await libraryRef.exportJson(id);
        const record = await libraryRef.get(id);
        setState((prev) => ({
          ...prev,
          status: {
            tone: 'success',
            text: `Diseño «${record?.name ?? id}» exportado.`,
          },
        }));
        return json;
      } catch (error) {
        fail(error);
        return null;
      }
    },
  };

  const activeName =
    state.activeId !== null
      ? (state.designs.find((design) => design.id === state.activeId)?.name ??
        null)
      : null;

  return {
    state: {
      hydrated: state.hydrated,
      designs: state.designs,
      activeId: state.activeId,
      activeName,
      dirty: state.dirty,
      status: state.status,
    },
    actions,
  };
}
