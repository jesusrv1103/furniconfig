/**
 * FASE-4C-A/B — pantalla del modelador 3D (ruta `#/modeler`).
 *
 * Composición:
 *
 * - `ModelerShell`: chrome (barra, panel lateral, estados) —
 *   marcado puro testeable con `renderToString`.
 * - `ModelerScene`: Canvas R3F con rejilla/ejes/vistas y la
 *   interacción de dibujo/selección (4C-B).
 *
 * Documento (§5, 4C-B): el `SceneDocument` v1 vive en
 * `useState`; CADA edición pasa por `applySceneAction`, que usa
 * los comandos existentes de `modeler-core` (`add-object`,
 * `set-sketch`, `set-extrusion`, `remove-object`) y valida el
 * resultado antes de instalarlo — nunca se muta el documento.
 *
 * Seam para 4C-C (CommandHistory): el sustituto de
 * `applySceneAction` por `executeCommand(history, command)` es
 * EXACTAMENTE esta capa; la UI no cambia.
 *
 * Motor geométrico (§6): `useModelerGeometry` sigue creando el
 * Worker de forma perezosa; `useSceneGeometry` (4C-B) lo invoca
 * en el primer sólido y publica la geometría derivada por
 * objeto. Abrir la pantalla en escena vacía NO crea el Worker.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  SCENE_LIMITS,
  createEmptySceneDocument,
  createRemoveObjectCommand,
  createRenameCommand,
  createSetExtrusionCommand,
  createSetParamsCommand,
  createSetSketchCommand,
  resolveObjectSelection,
  setSketchDimension,
  sketchDimensionMm,
  type Command,
  type SceneDocument,
  type SceneParams,
  type SelectionState,
  type Sketch2D,
  type SketchDimension,
} from '@furniconfig/modeler-core';
import {
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';

import {
  ModelerShell,
  type ObjectRowProps,
  type PendingSketchPanelProps,
  type SelectionPanelProps,
  type WardrobePanelProps,
} from './ModelerShell.js';
import { ModelerScene } from './ModelerScene.js';
import { useModelerGeometry } from '../../hooks/use-modeler-geometry.js';
import { useSceneGeometry } from '../../hooks/use-scene-geometry.js';
import {
  useModelerHistory,
  type ModelerHistory,
} from '../../hooks/use-modeler-history.js';
import {
  createCameraControlsState,
  requestFit,
  requestView,
  type ModelerCameraControlsState,
} from '../../lib/modeler/camera-controls.js';
import {
  DEFAULT_DOOR_LEAVES,
  DEFAULT_DRAWER_COUNT,
  DEFAULT_SHELVES,
  clearDoors,
  setBackPanelEnabled,
  setDimension,
  setDoorsEnabled,
  setDoorHingeSide,
  setDoorLeaves,
  setModuleCount,
  setModuleDrawers,
  setModuleKind,
  setModuleShelves,
} from '../../lib/config.js';
import {
  DEFAULT_SCENE_MATERIAL,
  applySceneAction,
  buildSolidAddCommand,
  buildWardrobeAddCommand,
  nextComponentId,
  nextSolidId,
} from '../../lib/modeler/document-actions.js';
import {
  WARDROBE_COMPONENT_TYPE,
  parseWardrobeParams,
} from '../../lib/modeler/components/wardrobe.js';
import { wardrobeSceneRegistry } from '../../lib/modeler/open-design.js';
import { partsGeometryLifecycle } from '../../lib/modeler/components/parts-to-mesh.js';
import { historyShortcut } from '../../lib/modeler/history-shortcuts.js';
import type { CameraView } from '../../lib/camera-views.js';
import type { ModelerTool } from '../../lib/modeler/drawing.js';
import { geometryLifecycle } from './use-solid-geometry.js';

import './modeler.css';

/**
 * Paso de rejilla inicial (PROVISIONAL): se fija a la celda
 * menor VISIBLE de la rejilla (100 mm) para que el snap
 * coincida con lo que el usuario ve; es un ajuste de UX, no una
 * regla de fabricación.
 */
const INITIAL_GRID_STEP_MM = 100;

/**
 * Extrusión por defecto al pulsar "Extruir" (PROVISIONAL):
 * valor de conveniencia; siempre editable antes y después.
 */
const DEFAULT_EXTRUSION_MM = 100;

/** Enteros positivos en texto de campo (lo inválido no aplica). */
function parseMm(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,7}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * Semilla del historial (C1): documento vacío con rejilla inicial y
 * el material por defecto YA presente (los sólidos lo referencian;
 * así el comando `add-object` valida contra `history.present` sin
 * necesidad de tocar el historial fuera de comandos).
 */
function createSeedDocument(): SceneDocument {
  const withGrid =
    applySceneAction(createEmptySceneDocument(), {
      type: 'set-grid-step',
      gridStepMm: INITIAL_GRID_STEP_MM,
    }) ?? createEmptySceneDocument();
  if (
    withGrid.materials.some(
      (material) => material.id === DEFAULT_SCENE_MATERIAL.id,
    )
  ) {
    return withGrid;
  }
  return { ...withGrid, materials: [...withGrid.materials, DEFAULT_SCENE_MATERIAL] };
}

export function ModelerApp(): ReactNode {
  // C1 — FUENTE ÚNICA DE VERDAD: el documento visible es
  // `history.present` (CommandHistory de modeler-core). No existe
  // un `SceneDocument` paralelo ni un `setDocument`.
  const seedDocument = useMemo(createSeedDocument, []);
  const history = useModelerHistory(seedDocument);
  const document = history.document;
  const [tool, setTool] = useState<ModelerTool>('select');
  const [camera, setCamera] = useState<ModelerCameraControlsState>(
    createCameraControlsState,
  );
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [pendingSketch, setPendingSketch] = useState<Sketch2D | null>(null);
  const [pendingExtrusionMm, setPendingExtrusionMm] = useState(
    DEFAULT_EXTRUSION_MM,
  );
  const [pendingTexts, setPendingTexts] = useState({
    width: '',
    depth: '',
    height: String(DEFAULT_EXTRUSION_MM),
  });
  /** Feedback aria-live del último deshacer/rehacer (C3). */
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  /**
   * Rechazo de la ÚLTIMA edición de params de clóset (4C-D): error
   * visible SIN tocar documento ni historial. Se limpia al cambiar
   * de selección y en cada edición aceptada.
   */
  const [wardrobeEditError, setWardrobeEditError] = useState<string | null>(
    null,
  );
  /**
   * Selección previa a una eliminación (C4): si el usuario deshace
   * el borrado, el objeto restaurado recupera su selección. Se
   * descarta al ejecutar un comando nuevo o al elegir otra
   * selección explícita (nunca resucita selecciones contra el
   * deseo del usuario).
   */
  const selectionStashRef = useRef<SelectionState | null>(null);

  const geometry = useModelerGeometry();
  const sceneGeometry = useSceneGeometry(
    document,
    geometry,
    wardrobeSceneRegistry,
  );

  const selectedObject = useMemo(() => {
    if (selection === null || selection.anchor === null) return null;
    const objectId = selection.anchor;
    const object = document.objects.find((entry) => entry.id === objectId);
    if (object === undefined || object.kind !== 'solid') return null;
    if (object.geometry.source !== 'sketch') return null;
    // Se extraen ya estrechados: la estrechez de una propiedad
    // de interfaz no sobrevive al `return` del objeto entero.
    return {
      id: object.id,
      name: object.name,
      sketch: object.geometry.sketch,
      extrusionMm: object.geometry.extrusionMm,
    };
  }, [document, selection]);

  // Clóset seleccionado (4C-D): componente de tipo
  // `furniconfig.wardrobe` con sus params leídos Y VALIDADOS por el
  // motor (`config === null` = motor los rechaza: panel reducido a
  // nombre/estado/eliminar, nunca campos que no aplican).
  const selectedWardrobe = useMemo(() => {
    if (selection === null || selection.anchor === null) return null;
    const object = document.objects.find(
      (entry) => entry.id === selection.anchor,
    );
    if (object === undefined || object.kind !== 'component') return null;
    if (object.type !== WARDROBE_COMPONENT_TYPE) return null;
    return {
      id: object.id,
      name: object.name,
      config: parseWardrobeParams(object.params),
    };
  }, [document, selection]);

  // C4 — Selección SIEMPRE coherente con el documento vigente: una
  // referencia a un objeto inexistente se anula (eliminación o
  // redo), y el undo de una eliminación restaura la selección
  // previa guardada. Los campos de propiedades se derivan del
  // documento (sin estado de texto paralelo: el borrador vive en
  // cada campo con confirmación).
  useEffect(() => {
    if (selection === null) {
      const stash = selectionStashRef.current;
      if (stash !== null && stash.anchor !== null) {
        const restored = document.objects.some(
          (object) => object.id === stash.anchor,
        );
        if (restored) {
          setSelection(
            resolveObjectSelection(document, { objectId: stash.anchor }),
          );
        }
      }
      return;
    }
    const resolved = resolveObjectSelection(document, {
      objectId: selection.anchor,
    });
    if (resolved === null) setSelection(null);
  }, [document, selection]);

  // El error de edición de clóset no sobrevive a un cambio de
  // selección (el panel nuevo no tiene por qué heredarlo).
  useEffect(() => {
    setWardrobeEditError(null);
  }, [selection]);

  // Escape cancela el croquis pendiente (operación incompleta).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setPendingSketch((current) => (current === null ? current : null));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // -------------------------------------------------------------------------
  // Historial visual (C1/C3): dispatch + Undo/Redo + atajos
  // -------------------------------------------------------------------------

  // La pasarela de atajos necesita la referencia viva del historial
  // (patrón de `use-editor-history`): el listener se registra una
  // sola vez y se limpia al desmontar.
  const historyRef = useRef(history);
  historyRef.current = history;

  const runDispatch = useCallback(
    (command: Command): ReturnType<ModelerHistory['dispatch']> => {
      const change = historyRef.current.dispatch(command);
      if (change !== null) {
        selectionStashRef.current = null; // comando nuevo: fin del "restaurar"
        setHistoryMessage(null);
      }
      return change;
    },
    [],
  );

  const handleUndo = useCallback(() => {
    const change = historyRef.current.undo();
    if (change === null) return;
    setHistoryMessage(`Deshecho: ${change.label}`);
  }, []);

  const handleRedo = useCallback(() => {
    const change = historyRef.current.redo();
    if (change === null) return;
    setHistoryMessage(`Rehecho: ${change.label}`);
  }, []);

  // Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z (C3): fuera de campos de texto,
  // una pulsación = una operación (sin `event.repeat`).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      const shortcut = historyShortcut(
        {
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
        },
        target instanceof HTMLElement
          ? { tagName: target.tagName, isContentEditable: target.isContentEditable }
          : null,
      );
      if (shortcut === null) return;
      event.preventDefault();
      if (shortcut === 'undo') handleUndo();
      else handleRedo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  // -------------------------------------------------------------------------
  // Acciones de la interfaz (todas puras vía comandos)
  // -------------------------------------------------------------------------

  const handleCreateSketch = useCallback((sketch: Sketch2D) => {
    setPendingSketch(sketch);
    setSelection(null);
    setPendingExtrusionMm(DEFAULT_EXTRUSION_MM);
    setPendingTexts({
      width: String(sketchDimensionMm(sketch, 'widthMm')),
      depth: String(sketchDimensionMm(sketch, 'depthMm')),
      height: String(DEFAULT_EXTRUSION_MM),
    });
  }, []);

  const handlePickObject = useCallback(
    (objectId: string | null) => {
      selectionStashRef.current = null; // selección explícita: fin de "restaurar"
      setSelection(
        objectId === null
          ? null
          : resolveObjectSelection(document, { objectId }),
      );
    },
    [document],
  );

  const handlePendingDimension = useCallback(
    (dimension: SketchDimension, text: string) => {
      const key = dimension === 'widthMm' ? 'width' : 'depth';
      setPendingTexts((prev) => ({ ...prev, [key]: text }));
      const value = parseMm(text);
      if (value === null || pendingSketch === null) return;
      try {
        setPendingSketch(setSketchDimension(pendingSketch, dimension, value));
      } catch {
        // Fuera de límites: se conserva el último croquis válido.
      }
    },
    [pendingSketch],
  );

  const handlePendingHeight = useCallback((text: string) => {
    setPendingTexts((prev) => ({ ...prev, height: text }));
    const value = parseMm(text);
    if (value === null || value > SCENE_LIMITS.extrusionMm.max) return;
    setPendingExtrusionMm(value);
  }, []);

  const handleCancelPending = useCallback(() => {
    setPendingSketch(null);
  }, []);

  const handleExtrude = useCallback(() => {
    if (pendingSketch === null) return;
    const objectId = nextSolidId(document);
    let change: ReturnType<ModelerHistory['dispatch']>;
    try {
      change = runDispatch(
        buildSolidAddCommand(document, pendingSketch, pendingExtrusionMm),
      );
    } catch {
      // Fábrica del comando rechazó: historial intacto.
      change = null;
    }
    if (change === null) return;
    setPendingSketch(null);
    setSelection(resolveObjectSelection(change.document, { objectId }));
  }, [document, pendingSketch, pendingExtrusionMm, runDispatch]);

  /**
   * D1 — Insertar clóset: id precalculado (mismo cálculo que la
   * fábrica del comando → misma selección), inserción reversible
   * vía `CommandHistory` y selección del componente recién creado.
   */
  const handleInsertWardrobe = useCallback(() => {
    const objectId = nextComponentId(document);
    let change: ReturnType<ModelerHistory['dispatch']>;
    try {
      change = runDispatch(buildWardrobeAddCommand(document));
    } catch {
      // Fábrica rechazó (params inválidos, id colisionado):
      // historial intacto.
      change = null;
    }
    if (change === null) return;
    setSelection(resolveObjectSelection(change.document, { objectId }));
  }, [document, runDispatch]);

  // Edición de cotas: CONFIRMACIÓN (Enter/blur/change del campo) =
  // UNA entrada de historial; el no-op de `executeCommand` descarta
  // repeticiones (Enter seguido de blur → una sola entrada).
  const handleSelectionDimension = useCallback(
    (dimension: SketchDimension, text: string) => {
      const value = parseMm(text);
      if (value === null || selectedObject === null) return;
      try {
        const sketch = setSketchDimension(
          selectedObject.sketch,
          dimension,
          value,
        );
        runDispatch(
          createSetSketchCommand(document, selectedObject.id, sketch),
        );
      } catch {
        // Fuera de límites: se conserva el último valor válido.
      }
    },
    [document, selectedObject, runDispatch],
  );

  const handleSelectionHeight = useCallback(
    (text: string) => {
      const value = parseMm(text);
      if (
        value === null ||
        selectedObject === null ||
        value > SCENE_LIMITS.extrusionMm.max
      ) {
        return;
      }
      runDispatch(
        createSetExtrusionCommand(document, selectedObject.id, value),
      );
    },
    [document, selectedObject, runDispatch],
  );

  /** Renombrar (C2): nombre vacío → fábrica `SceneError` → no-op. */
  const handleRename = useCallback(
    (text: string) => {
      if (selectedObject === null) return;
      runDispatch(createRenameCommand(document, selectedObject.id, text));
    },
    [document, selectedObject, runDispatch],
  );

  /** Eliminar por id (sólido o componente): misma ruta para ambos. */
  const handleDeleteObject = useCallback(
    (objectId: string) => {
      const change = runDispatch(createRemoveObjectCommand(document, objectId));
      if (change === null) return;
      // Captura POST-éxito: si se deshace, la selección vuelve con el
      // objeto (efecto de reconciliación C4).
      selectionStashRef.current = selection;
      setSelection(null);
    },
    [document, runDispatch, selection],
  );

  const handleDelete = useCallback(() => {
    if (selectedObject === null) return;
    handleDeleteObject(selectedObject.id);
  }, [selectedObject, handleDeleteObject]);

  // -------------------------------------------------------------------------
  // Edición paramétrica de clósets (D4): valida → construye params →
  // UN `createSetParamsCommand` → regenera → la selección se mantiene
  // (los params no tocan `selection`). Rechazo → error visible y
  // documento + historial INTACTOS (nunca una entrada por tecla: los
  // campos confirman en Enter/blur y los selectores al operar).
  // -------------------------------------------------------------------------

  const applyWardrobeParams = useCallback(
    (updater: (config: WardrobeConfig) => WardrobeConfig): boolean => {
      if (selectedWardrobe === null || selectedWardrobe.config === null) {
        return false;
      }
      let candidate: WardrobeConfig;
      try {
        candidate = updater(selectedWardrobe.config);
      } catch {
        setWardrobeEditError('Entrada no válida para este campo.');
        return false;
      }
      // El MOTOR valida (fuente única de reglas: sin duplicar
      // WARDROBE_LIMITS): fuera de rango o inconsistente → error
      // visible y NINGUNA mutación.
      const validation = validateWardrobeConfig(candidate);
      if (!validation.ok) {
        const first = validation.errors[0];
        setWardrobeEditError(
          `${first?.field ?? 'configuración'}: ${first?.message ?? 'configuración inválida'}`,
        );
        return false;
      }
      const change = runDispatch(
        createSetParamsCommand(
          document,
          selectedWardrobe.id,
          // Precedente de `open-design.ts`: la interfaz es un
          // `Record` de valores anidados; el validador garantiza
          // que los params son un WardrobeConfig v1 completo.
          validation.config as unknown as SceneParams,
        ),
      );
      if (change === null) {
        setWardrobeEditError('Comando rechazado: documento intacto.');
        return false;
      }
      setWardrobeEditError(null);
      return true;
    },
    [document, selectedWardrobe, runDispatch],
  );

  /** Dimensiones del clóset: texto → mm entero → validación del motor. */
  const handleWardrobeDimension = useCallback(
    (key: 'widthMm' | 'heightMm' | 'depthMm', text: string) => {
      const value = parseMm(text);
      if (value === null) {
        setWardrobeEditError(
          `${key === 'widthMm' ? 'Ancho' : key === 'heightMm' ? 'Alto' : 'Profundidad'}: entero en mm (mínimo 1).`,
        );
        return;
      }
      applyWardrobeParams((config) => setDimension(config, key, value));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeModuleCount = useCallback(
    (count: number) => {
      applyWardrobeParams((config) => setModuleCount(config, count));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeModuleKind = useCallback(
    (index: number, kind: 'shelves' | 'hanging' | 'drawers') => {
      applyWardrobeParams((config) => setModuleKind(config, index, kind));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeModuleShelves = useCallback(
    (index: number, text: string) => {
      const value = parseMm(text);
      if (value === null) {
        setWardrobeEditError('Entrepaños: entero en mm (mínimo 1).');
        return;
      }
      applyWardrobeParams((config) => setModuleShelves(config, index, value));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeModuleDrawers = useCallback(
    (index: number, text: string) => {
      const value = parseMm(text);
      if (value === null) {
        setWardrobeEditError('Cajones: entero en mm (mínimo 1).');
        return;
      }
      applyWardrobeParams((config) => setModuleDrawers(config, index, value));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeDoorsEnabled = useCallback(
    (enabled: boolean) => {
      applyWardrobeParams((config) => setDoorsEnabled(config, enabled));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeDoorLeaves = useCallback(
    (leaves: 1 | 2) => {
      applyWardrobeParams((config) => setDoorLeaves(config, leaves));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeDoorHinge = useCallback(
    (hingeSide: 'left' | 'right') => {
      applyWardrobeParams((config) => setDoorHingeSide(config, hingeSide));
    },
    [applyWardrobeParams],
  );

  const handleWardrobeBackPanel = useCallback(
    (enabled: boolean) => {
      applyWardrobeParams((config) => setBackPanelEnabled(config, enabled));
    },
    [applyWardrobeParams],
  );

  /** Renombrar clóset (mismo comando genérico que los sólidos). */
  const handleWardrobeRename = useCallback(
    (text: string) => {
      if (selectedWardrobe === null) return;
      runDispatch(createRenameCommand(document, selectedWardrobe.id, text));
    },
    [document, selectedWardrobe, runDispatch],
  );

  const handleViewChange = useCallback((view: CameraView) => {
    setCamera((prev) => requestView(prev, view));
  }, []);
  const handleFit = useCallback(() => setCamera((prev) => requestFit(prev)), []);

  // -------------------------------------------------------------------------
  // Derivados para la carcasa
  // -------------------------------------------------------------------------

  const objectRows: readonly ObjectRowProps[] = useMemo(
    () =>
      document.objects
        .filter(
          (object) =>
            object.kind === 'component' ||
            (object.kind === 'solid' && object.geometry.source === 'sketch'),
        )
        .map((object): ObjectRowProps => {
          const common = {
            id: object.id,
            name: object.name,
            selected: selection?.anchor === object.id,
            onSelect: () => {
              setSelection(
                resolveObjectSelection(document, { objectId: object.id }),
              );
            },
          };
          if (object.kind === 'component') {
            // Fila de componente (4C-D): estado del mapa SEPARADO
            // `componentStates` y cotas externas del clóset.
            const state = sceneGeometry.componentStates.get(object.id);
            const dims = parseWardrobeParams(object.params)?.dimensions;
            return {
              ...common,
              kind: 'component',
              dimsText:
                dims === undefined
                  ? 'params inválidos'
                  : `${dims.widthMm} × ${dims.depthMm} × ${dims.heightMm} mm`,
              status: state?.status ?? 'pending',
            };
          }
          if (object.kind !== 'solid') {
            throw new Error('objeto filtrado inválido');
          }
          if (object.geometry.source !== 'sketch') {
            throw new Error('objeto filtrado sin croquis');
          }
          const state = sceneGeometry.states.get(object.id);
          return {
            ...common,
            kind: 'solid',
            dimsText: `${sketchDimensionMm(object.geometry.sketch, 'widthMm')} × ${sketchDimensionMm(
              object.geometry.sketch,
              'depthMm',
            )} × ${object.geometry.extrusionMm} mm`,
            status: state?.status ?? 'pending',
          };
        }),
    [document, sceneGeometry.states, sceneGeometry.componentStates, selection],
  );

  const pendingPanel: PendingSketchPanelProps | null =
    pendingSketch === null
      ? null
      : {
          widthText: pendingTexts.width,
          depthText: pendingTexts.depth,
          heightText: pendingTexts.height,
          onWidthChange: (text) => handlePendingDimension('widthMm', text),
          onDepthChange: (text) => handlePendingDimension('depthMm', text),
          onHeightChange: handlePendingHeight,
          onExtrude: handleExtrude,
          onCancel: handleCancelPending,
        };

  const selectionPanel: SelectionPanelProps | null =
    selectedObject === null
      ? null
      : {
          // Derivados del documento (fuente única): undo/redo y
          // renombrar actualizan el panel sin estado de texto paralelo.
          name: selectedObject.name,
          nameText: selectedObject.name,
          onNameChange: handleRename,
          widthText: String(
            sketchDimensionMm(selectedObject.sketch, 'widthMm'),
          ),
          depthText: String(
            sketchDimensionMm(selectedObject.sketch, 'depthMm'),
          ),
          heightText: String(selectedObject.extrusionMm),
          onWidthChange: (text) => handleSelectionDimension('widthMm', text),
          onDepthChange: (text) => handleSelectionDimension('depthMm', text),
          onHeightChange: handleSelectionHeight,
          status:
            sceneGeometry.states.get(selectedObject.id)?.status ?? 'pending',
          errorMessage:
            sceneGeometry.states.get(selectedObject.id)?.errorMessage ?? null,
          onRetry: () => sceneGeometry.retry(selectedObject.id),
          onDelete: handleDelete,
        };

  // Panel contextual del clóset (D4): propiedades derivadas del
  // documento vigente (undo/redo lo actualizan sin estado paralelo).
  const wardrobePanel: WardrobePanelProps | null =
    selectedWardrobe === null
      ? null
      : {
          name: selectedWardrobe.name,
          nameText: selectedWardrobe.name,
          onNameChange: handleWardrobeRename,
          params:
            selectedWardrobe.config === null
              ? null
              : {
                  widthText: String(
                    selectedWardrobe.config.dimensions.widthMm,
                  ),
                  heightText: String(
                    selectedWardrobe.config.dimensions.heightMm,
                  ),
                  depthText: String(
                    selectedWardrobe.config.dimensions.depthMm,
                  ),
                  onWidthChange: (text) =>
                    handleWardrobeDimension('widthMm', text),
                  onHeightChange: (text) =>
                    handleWardrobeDimension('heightMm', text),
                  onDepthChange: (text) =>
                    handleWardrobeDimension('depthMm', text),
                  moduleCount: selectedWardrobe.config.modules.length,
                  onModuleCountChange: handleWardrobeModuleCount,
                  modules: selectedWardrobe.config.modules.map(
                    (module, index) => ({
                      index,
                      kind: module.kind,
                      shelvesText:
                        module.kind === 'shelves'
                          ? String(module.shelves ?? DEFAULT_SHELVES)
                          : null,
                      drawersText:
                        module.kind === 'drawers'
                          ? String(module.drawers ?? DEFAULT_DRAWER_COUNT)
                          : null,
                      onKindChange: (kind: 'shelves' | 'hanging' | 'drawers') =>
                        handleWardrobeModuleKind(index, kind),
                      onShelvesChange: (text: string) =>
                        handleWardrobeModuleShelves(index, text),
                      onDrawersChange: (text: string) =>
                        handleWardrobeModuleDrawers(index, text),
                    }),
                  ),
                  doorsEnabled: selectedWardrobe.config.doors !== undefined,
                  onDoorsEnabledChange: handleWardrobeDoorsEnabled,
                  doorLeaves:
                    selectedWardrobe.config.doors?.leaves ??
                    DEFAULT_DOOR_LEAVES,
                  onDoorLeavesChange: handleWardrobeDoorLeaves,
                  doorHinge:
                    selectedWardrobe.config.doors?.hingeSide ?? 'left',
                  onDoorHingeChange: handleWardrobeDoorHinge,
                  backPanelEnabled:
                    selectedWardrobe.config.backPanel?.enabled ?? false,
                  onBackPanelEnabledChange: handleWardrobeBackPanel,
                },
          status:
            sceneGeometry.componentStates.get(selectedWardrobe.id)?.status ??
            'pending',
          errorMessage:
            sceneGeometry.componentStates.get(selectedWardrobe.id)
              ?.errorMessage ?? null,
          editError: wardrobeEditError,
          onRetry: () => sceneGeometry.retry(selectedWardrobe.id),
          onDelete: () => {
            if (selectedWardrobe !== null) {
              handleDeleteObject(selectedWardrobe.id);
            }
          },
        };

  // Depuración para las verificaciones visuales (patrón del
  // configurador con `__wardrobeConfigDebug`).
  useEffect(() => {
    const target = window as unknown as { __modeler?: unknown };
    target.__modeler = {
      getDocument: () => document,
      getTool: () => tool,
      getSelection: () => selection,
      getStates: () =>
        Object.fromEntries(
          [...sceneGeometry.states.entries()].map(([id, state]) => [
            id,
            {
              status: state.status,
              revision: state.revision,
              errorMessage: state.errorMessage,
              // Huellas (4C-C): la malla aplicada debe corresponder
              // al estado vigente (nunca geometría obsoleta).
              fingerprint: state.fingerprint,
              appliedFingerprint: state.appliedFingerprint,
            },
          ]),
        ),
      getStats: () => sceneGeometry.stats,
      /**
       * Estados de componentes (4C-D): huellas + nº de piezas
       * (la fuente de `parts` vive aquí, separada de los sólidos).
       */
      getComponentStates: () =>
        Object.fromEntries(
          [...sceneGeometry.componentStates.entries()].map(
            ([id, state]) => [
              id,
              {
                status: state.status,
                revision: state.revision,
                errorMessage: state.errorMessage,
                fingerprint: state.fingerprint,
                appliedFingerprint: state.appliedFingerprint,
                parts: state.parts?.length ?? null,
              },
            ],
          ),
        ),
      /** Ciclo de vida de las BufferGeometry de componentes (§8 prueba 13). */
      getPartsGeometryStats: () => ({ ...partsGeometryLifecycle }),
      /** Croquis pendiente (UI, aún sin documento) para verificación visual. */
      getPending: () =>
        pendingSketch === null
          ? null
          : { sketch: pendingSketch, extrusionMm: pendingExtrusionMm },
      /** Ciclo de vida de BufferGeometry (auditoría §2, check visual 7l). */
      getGeometryStats: () => ({ ...geometryLifecycle }),
      /** Historial visual (4C-C) para verificación visual. */
      getHistory: () => ({
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        undoLabel: history.undoLabel,
        redoLabel: history.redoLabel,
        past: history.pastLength,
        future: history.futureLength,
        message: historyMessage,
      }),
    };
    return () => {
      delete target.__modeler;
    };
  }, [document, tool, selection, sceneGeometry, history, historyMessage]);

  return (
    <ModelerShell
      document={{
        name: document.name,
        objectCount: document.objects.length,
        gridStepMm: document.gridStepMm,
      }}
      engineStatus={geometry.status}
      view={camera.view}
      onViewChange={handleViewChange}
      onFit={handleFit}
      tool={tool}
      onToolChange={setTool}
      history={{
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        undoLabel: history.undoLabel,
        redoLabel: history.redoLabel,
        message: historyMessage,
      }}
      onUndo={handleUndo}
      onRedo={handleRedo}
      onInsertWardrobe={handleInsertWardrobe}
      pendingSketch={pendingPanel}
      objects={objectRows}
      selection={selectionPanel}
      wardrobe={wardrobePanel}
    >
      <ModelerScene
        viewRequest={camera.request}
        tool={tool}
        gridStepMm={document.gridStepMm}
        sceneDocument={document}
        solidStates={sceneGeometry.states}
        componentStates={sceneGeometry.componentStates}
        selection={selection}
        pendingSketch={pendingSketch}
        onCreateSketch={handleCreateSketch}
        onPickObject={handlePickObject}
      />
    </ModelerShell>
  );
}
