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
  createSetSketchCommand,
  resolveObjectSelection,
  setSketchDimension,
  sketchDimensionMm,
  type Command,
  type SceneDocument,
  type SelectionState,
  type Sketch2D,
  type SketchDimension,
} from '@furniconfig/modeler-core';

import {
  ModelerShell,
  type ObjectRowProps,
  type PendingSketchPanelProps,
  type SelectionPanelProps,
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
  DEFAULT_SCENE_MATERIAL,
  applySceneAction,
  buildSolidAddCommand,
  nextSolidId,
} from '../../lib/modeler/document-actions.js';
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
   * Selección previa a una eliminación (C4): si el usuario deshace
   * el borrado, el objeto restaurado recupera su selección. Se
   * descarta al ejecutar un comando nuevo o al elegir otra
   * selección explícita (nunca resucita selecciones contra el
   * deseo del usuario).
   */
  const selectionStashRef = useRef<SelectionState | null>(null);

  const geometry = useModelerGeometry();
  const sceneGeometry = useSceneGeometry(document, geometry);

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

  const handleDelete = useCallback(() => {
    if (selectedObject === null) return;
    const change = runDispatch(
      createRemoveObjectCommand(document, selectedObject.id),
    );
    if (change === null) return;
    // Captura POST-éxito: si se deshace, la selección vuelve con el
    // objeto (efecto de reconciliación C4).
    selectionStashRef.current = selection;
    setSelection(null);
  }, [document, selectedObject, runDispatch, selection]);

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
            object.kind === 'solid' && object.geometry.source === 'sketch',
        )
        .map((object) => {
          if (object.kind !== 'solid') {
            throw new Error('objeto filtrado inválido');
          }
          if (object.geometry.source !== 'sketch') {
            throw new Error('objeto filtrado sin croquis');
          }
          const state = sceneGeometry.states.get(object.id);
          return {
            id: object.id,
            name: object.name,
            dimsText: `${sketchDimensionMm(object.geometry.sketch, 'widthMm')} × ${sketchDimensionMm(
              object.geometry.sketch,
              'depthMm',
            )} × ${object.geometry.extrusionMm} mm`,
            status: state?.status ?? 'pending',
            selected: selection?.anchor === object.id,
            onSelect: () => {
              setSelection(resolveObjectSelection(document, { objectId: object.id }));
            },
          };
        }),
    [document, sceneGeometry.states, selection],
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
      pendingSketch={pendingPanel}
      objects={objectRows}
      selection={selectionPanel}
    >
      <ModelerScene
        viewRequest={camera.request}
        tool={tool}
        gridStepMm={document.gridStepMm}
        sceneDocument={document}
        solidStates={sceneGeometry.states}
        selection={selection}
        pendingSketch={pendingSketch}
        onCreateSketch={handleCreateSketch}
        onPickObject={handlePickObject}
      />
    </ModelerShell>
  );
}
