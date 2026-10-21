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
  type MmPoint3,
  type SceneDocument,
  type SceneParams,
  type SelectionState,
  type Sketch2D,
  type SketchDimension,
} from '@furniconfig/modeler-core';
import {
  validateWardrobeConfig,
  distributeModules,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';

import {
  ModelerShell,
  type CardActionsProps,
  type DesignsPanelProps,
  type ModelerSaveState,
  type MoveWord,
  type ObjectRowProps,
  type PendingSketchPanelProps,
  type PositionPanelProps,
  type SelectionPanelProps,
  type WardrobePanelProps,
} from './ModelerShell.js';
import { ModelerScene } from './ModelerScene.js';
import { WelcomeScreen, formatDraftAge, type WelcomeDraftCard } from './WelcomeScreen.js';
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
  distributionInput,
} from '../../lib/config.js';
import {
  DEFAULT_SCENE_MATERIAL,
  applySceneAction,
  buildDuplicateObjectCommand,
  buildSolidAddCommand,
  buildWardrobeAddCommand,
  buildWardrobeSeedDocument,
  nextComponentId,
  nextSolidId,
} from '../../lib/modeler/document-actions.js';
import {
  buildObjectMoveCommand,
  getObjectPositionMm,
  offsetPositionMm,
  parsePositionMm,
  type MoveDraft,
} from '../../lib/modeler/transform.js';
import {
  clearSceneDraft,
  createSceneDesign,
  deleteSceneDesign,
  duplicateSceneDesign,
  getDefaultSceneDesignStorage,
  listSceneDesigns,
  readSceneDesign,
  readSceneDraft,
  renameSceneDesign,
  saveSceneDesign,
  saveSceneDraft,
  type SceneDesignSummary,
  type SceneDraftReadResult,
} from '../../lib/modeler/design-store.js';
import {
  WARDROBE_COMPONENT_TYPE,
  parseWardrobeParams,
} from '../../lib/modeler/components/wardrobe.js';
import { wardrobeSceneRegistry } from '../../lib/modeler/open-design.js';
import { partsGeometryLifecycle } from '../../lib/modeler/components/parts-to-mesh.js';
import { historyShortcut } from '../../lib/modeler/history-shortcuts.js';
import type { Aabb, CameraView } from '../../lib/camera-views.js';
import type { ModelerTool } from '../../lib/modeler/drawing.js';
import type { ModelerMode } from '../../lib/modeler/modes.js';
import { computeSceneBounds, DEFAULT_SCENE_BOUNDS } from '../../lib/modeler/scene-bounds.js';
import { geometryLifecycle } from './use-solid-geometry.js';
import {
  ModelerDialog,
  type ModelerDialogSpec,
} from './ModelerDialog.js';

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
   * WAVE-02 B2 — rechazo de la ÚLTIMA duplicación (tarjeta
   * contextual): error visible, documento e historial intactos. Se
   * limpia al cambiar de selección y en cada duplicación aceptada.
   */
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  /**
   * WAVE-02 BLOQUE 3 (UX-C) — diálogo modal PROPIO abierto (o
   * `null`). Sustituye a `window.prompt`/`window.confirm`: mismo
   * flujo, pero accesible, verificable y con validación en la app
   * (el diálogo se queda abierto con el error si hace falta).
   */
  const [dialog, setDialog] = useState<ModelerDialogSpec | null>(null);
  /** Elemento con foco antes de abrir el diálogo (se restaura al cerrar). */
  const dialogTriggerRef = useRef<HTMLElement | null>(null);

  /** Abre el diálogo guardando el disparador para devolverle el foco. */
  const openDialog = useCallback((spec: ModelerDialogSpec): void => {
    // NOTA: `document` local = SceneDocument (estado); el DOM global
    // se alcanza vía `window.document`.
    const active = window.document.activeElement;
    dialogTriggerRef.current = active instanceof HTMLElement ? active : null;
    setDialog(spec);
  }, []);

  /** Cierra el diálogo y devuelve el foco a su disparador. */
  const closeDialog = useCallback((): void => {
    setDialog(null);
    dialogTriggerRef.current?.focus();
    dialogTriggerRef.current = null;
  }, []);
  /**
   * Selección previa a una eliminación (C4): si el usuario deshace
   * el borrado, el objeto restaurado recupera su selección. Se
   * descarta al ejecutar un comando nuevo o al elegir otra
   * selección explícita (nunca resucita selecciones contra el
   * deseo del usuario).
   */
  const selectionStashRef = useRef<SelectionState | null>(null);

  /**
   * WAVE-01 BLOQUE 2 — distribución espacial: borrador de arrastre
   * (previsualización SIN mutar el documento; el commit genera UNA
   * entrada de historial), snap del arrastre a la rejilla del
   * documento y rechazo visible de la ÚLTIMA edición de posición.
   */
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [positionError, setPositionError] = useState<string | null>(null);

  /**
   * WAVE-01 BLOQUE 3 — persistencia LOCAL de diseños (namespace
   * propio `furniconfig.modeler.designs`, aislado del configurador):
   * listado, diseño activo, foco del panel, mensajes y la instantánea
   * JSON del último guardar/abrir para detectar cambios sin guardar.
   * Nunca almacena mallas ni historial (solo `SceneDocument`).
   *
   * WAVE-02 BLOQUE 3: la instantánea pasa a ser BASELINE GLOBAL
   * (se fija al abrir/guardar/crear, incluso sin diseño activo), de
   * modo que «Cambios sin guardar» aparece desde la primera
   * modificación aunque el proyecto todavía no tenga nombre.
   */
  const [designStorage] = useState(() => getDefaultSceneDesignStorage());
  const [designSummaries, setDesignSummaries] = useState<
    readonly SceneDesignSummary[]
  >([]);
  const [activeDesign, setActiveDesign] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [designFocusId, setDesignFocusId] = useState<string | null>(null);
  const [designMessage, setDesignMessage] = useState<string | null>(null);
  const [designError, setDesignError] = useState<string | null>(null);
  const [designSavedJson, setDesignSavedJson] = useState<string | null>(() =>
    JSON.stringify(seedDocument),
  );

  /**
   * WAVE-02 BLOQUE 0 — pantalla de inicio vs editor: la primera
   * visita NUNCA cae en la escena técnica vacía (auditoría P-01).
   */
  const [screen, setScreen] = useState<'welcome' | 'editor'>('welcome');
  /** WAVE-02 BLOQUE 4 — modo de presentación (persistido en sesión). */
  const [mode, setMode] = useState<ModelerMode>('simple');
  /** Borrador de sesión leído al montar (BLOQUE 3: recuperación segura). */
  const [draftInfo, setDraftInfo] = useState<SceneDraftReadResult | null>(null);
  /** Error de una acción de la pantalla de inicio (apertura fallida…). */
  const [welcomeError, setWelcomeError] = useState<string | null>(null);
  /** Pista breve «cómo editarlo» tras crear el primer clóset (B0). */
  const [startHint, setStartHint] = useState<string | null>(null);
  /**
   * WAVE-02 BLOQUE 1 — caja de encuadre vigente. SOLO se recalcula en
   * momentos explícitos (crear el primer mueble / «Encuadrar» /
   * abrir un diseño): las ediciones NO reencuadran.
   */
  const [framedBounds, setFramedBounds] = useState<Aabb>(DEFAULT_SCENE_BOUNDS);

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

  // -------------------------------------------------------------------------
  // WAVE-01 BLOQUE 2 — posición autoritativa del objeto seleccionado:
  // clóset → `transform.positionMm`; sólido → esquina mínima del
  // croquis (la malla, el picking y el kernel derivan del croquis).
  // El arrastre solo se ofrece con geometría DERIVADA lista (la
  // previsualización desplaza la malla/piezas reales).
  // -------------------------------------------------------------------------

  const selectedObjectId = selection?.anchor ?? null;

  const selectedPositionMm = useMemo(
    () =>
      selectedObjectId === null
        ? null
        : getObjectPositionMm(document, selectedObjectId),
    [document, selectedObjectId],
  );

  const selectedDraggable = useMemo(() => {
    if (selectedObjectId === null) return false;
    const object = document.objects.find(
      (entry) => entry.id === selectedObjectId,
    );
    if (object === undefined) return false;
    if (object.kind === 'solid') {
      return sceneGeometry.states.get(object.id)?.status === 'ready';
    }
    return sceneGeometry.componentStates.get(object.id)?.status === 'ready';
  }, [
    document,
    selectedObjectId,
    sceneGeometry.states,
    sceneGeometry.componentStates,
  ]);

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
  // selección (el panel nuevo no tiene por qué heredarlo); lo
  // mismo aplica al error de posición y al borrador de arrastre
  // (WAVE-01): un arrastre nunca cruza selecciones.
  useEffect(() => {
    setWardrobeEditError(null);
    setPositionError(null);
    setDuplicateError(null);
    setMoveDraft(null);
  }, [selection]);

  // Escape cancela el arrastre activo (WAVE-01: SIN commit) o el
  // croquis pendiente (operación incompleta).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setMoveDraft((current) => (current === null ? current : null));
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
        // WAVE-02: la pista de bienvenida se retira con la primera
        // edición (ya cumplió su función de «cómo editarlo»).
        setStartHint(null);
      }
      return change;
    },
    [],
  );

  const handleUndo = useCallback(() => {
    const change = historyRef.current.undo();
    if (change === null) return;
    setHistoryMessage(`Deshecho: ${change.label}`);
    setStartHint(null);
  }, []);

  const handleRedo = useCallback(() => {
    const change = historyRef.current.redo();
    if (change === null) return;
    setHistoryMessage(`Rehecho: ${change.label}`);
    setStartHint(null);
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
      setStartHint(null);
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
   *
   * WAVE-02 BLOQUE 1: el encuadre automático ocurre SOLO al crear el
   * PRIMER mueble de la escena; insertar junto a otros no reencuadra
   * (evita reencuadres inesperados durante el trabajo).
   */
  const handleInsertWardrobe = useCallback(() => {
    const objectId = nextComponentId(document);
    const hadWardrobe = document.objects.some(
      (object) =>
        object.kind === 'component' && object.type === WARDROBE_COMPONENT_TYPE,
    );
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
    if (!hadWardrobe) {
      setFramedBounds(computeSceneBounds(change.document));
      setCamera((prev) => requestFit(prev));
    }
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
  // WAVE-01 BLOQUE 2 — mover objetos (UNA entrada de historial por
  // gesto/confirmación; el error de validación es visible y deja
  // documento e historial intactos).
  // -------------------------------------------------------------------------

  /** Commit de posición para cualquier objeto (sólido o clóset). */
  const applyObjectPosition = useCallback(
    (objectId: string, positionMm: MmPoint3) => {
      let change: ReturnType<ModelerHistory['dispatch']>;
      try {
        change = runDispatch(
          buildObjectMoveCommand(document, objectId, positionMm),
        );
      } catch {
        setPositionError('Posición no válida: mm enteros con signo.');
        return;
      }
      if (change === null) {
        // No-op (misma posición) o conflicto de precondición.
        setPositionError(null);
        return;
      }
      setPositionError(null);
      const name =
        document.objects.find((entry) => entry.id === objectId)?.name ??
        objectId;
      setHistoryMessage(`Movido: ${name}`);
    },
    [document, runDispatch],
  );

  /** Campos X/Z: texto → entero con signo → UN comando. */
  const handlePositionField = useCallback(
    (axis: 'x' | 'z', text: string) => {
      const value = parsePositionMm(text);
      if (
        value === null ||
        selectedPositionMm === null ||
        selectedObjectId === null
      ) {
        setPositionError('Posición: entero en mm con signo (p. ej. -250).');
        return;
      }
      const target: MmPoint3 =
        axis === 'x'
          ? [value, selectedPositionMm[1], selectedPositionMm[2]]
          : [selectedPositionMm[0], selectedPositionMm[1], value];
      applyObjectPosition(selectedObjectId, target);
    },
    [selectedPositionMm, selectedObjectId, applyObjectPosition],
  );

  /** Flechas de ajuste: UN desplazamiento por clic (mm enteros). */
  const handleNudge = useCallback(
    (dxMm: number, dzMm: number) => {
      if (selectedPositionMm === null || selectedObjectId === null) return;
      applyObjectPosition(
        selectedObjectId,
        offsetPositionMm(selectedPositionMm, dxMm, dzMm),
      );
    },
    [selectedPositionMm, selectedObjectId, applyObjectPosition],
  );

  /**
   * WAVE-02 B2 — «mover con palabras» de la tarjeta contextual:
   * UN clic = UN desplazamiento = UNA entrada de historial (misma
   * canalización `handleNudge` → `applyObjectPosition` que las
   * flechas del panel avanzado). Convención de suelo: X crece a la
   * derecha, Z «hacia atrás» → «Adelante» = −Z. El paso es el paso
   * de rejilla vigente del documento (100 mm por defecto).
   */
  const handleMoveWords = useCallback(
    (direction: MoveWord) => {
      const step = document.gridStepMm;
      switch (direction) {
        case 'left':
          handleNudge(-step, 0);
          break;
        case 'right':
          handleNudge(step, 0);
          break;
        case 'forward':
          handleNudge(0, -step);
          break;
        case 'back':
          handleNudge(0, step);
          break;
      }
    },
    [document.gridStepMm, handleNudge],
  );

  /**
   * WAVE-02 B2 — «Duplicar» de la tarjeta: UNA entrada de historial
   * (`buildDuplicateObjectCommand` termina en UN `add-object`) y la
   * copia queda seleccionada. Rechazo visible (nunca silencioso):
   * fuera de límites o no reutilizable → mensaje y documento +
   * historial intactos.
   */
  const handleDuplicateObject = useCallback(() => {
    if (selectedObjectId === null) return;
    const source = document.objects.find(
      (entry) => entry.id === selectedObjectId,
    );
    if (source === undefined) return;
    const newId =
      source.kind === 'solid'
        ? nextSolidId(document)
        : nextComponentId(document);
    let change: ReturnType<ModelerHistory['dispatch']>;
    try {
      const command = buildDuplicateObjectCommand(document, selectedObjectId);
      if (command === null) {
        setDuplicateError(
          'Este objeto no se puede duplicar aquí (sin una copia utilizable).',
        );
        return;
      }
      change = runDispatch(command);
    } catch {
      setDuplicateError(
        'No se pudo duplicar: la copia saldría de los límites de la escena. Documento intacto.',
      );
      return;
    }
    if (change === null) {
      setDuplicateError('No se pudo duplicar: documento intacto.');
      return;
    }
    setDuplicateError(null);
    const resolved = resolveObjectSelection(change.document, {
      objectId: newId,
    });
    setSelection(resolved);
    setHistoryMessage(`Duplicado: ${source.name}`);
  }, [document, runDispatch, selectedObjectId]);

  /**
   * WAVE-02 B2 — acciones de la tarjeta contextual (modo sencillo):
   * `null` sin selección → no hay tarjeta. Un clóset solo es
   * «reutilizable» si sus params siguen legibles (copia utilizable).
   */
  const cardActions: CardActionsProps | null = useMemo(() => {
    if (selection === null || selection.anchor === null) return null;
    const object = document.objects.find(
      (entry) => entry.id === selection.anchor,
    );
    if (object === undefined) return null;
    return {
      onMoveWords: handleMoveWords,
      canDuplicate:
        object.kind === 'solid' ||
        (selectedWardrobe !== null && selectedWardrobe.config !== null),
      onDuplicate: handleDuplicateObject,
      duplicateError,
    };
  }, [
    selection,
    document,
    selectedWardrobe,
    handleMoveWords,
    handleDuplicateObject,
    duplicateError,
  ]);

  /** Borrador de arrastre (desde la escena): sin mutar documento. */
  const handleMoveDraftChange = useCallback(
    (draft: MoveDraft | null) => {
      setMoveDraft((current) => {
        if (draft === null) return current === null ? current : null;
        if (
          current !== null &&
          current.objectId === draft.objectId &&
          current.positionMm[0] === draft.positionMm[0] &&
          current.positionMm[1] === draft.positionMm[1] &&
          current.positionMm[2] === draft.positionMm[2]
        ) {
          return current;
        }
        return draft;
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // WAVE-01 BLOQUE 3 — diseños locales (CRUD sobre `design-store`).
  // Diálogos nativos prompt/confirm (patrón de `DesignSection` del
  // configurador); apertura → historial VACÍO y estados limpios, y la
  // geometría se regenera por los circuitos existentes del documento.
  // -------------------------------------------------------------------------

  const refreshDesigns = useCallback(() => {
    setDesignSummaries(
      designStorage === null ? [] : listSceneDesigns(designStorage),
    );
  }, [designStorage]);

  useEffect(() => {
    refreshDesigns();
  }, [refreshDesigns]);

  const designDocumentJson = useMemo(
    () => JSON.stringify(document),
    [document],
  );

  /** Ediciones posteriores al último guardar/abrir/crear (BASELINE
   * GLOBAL, WAVE-02 B3): funciona aunque no haya diseño activo.
   * `null` = sin referencia guardada (p. ej. recién creado con
   * «Crear clóset») → la escena cuenta como «sin guardar»: nada la
   * respalda todavía en ningún diseño. */
  const designDirty = designDocumentJson !== designSavedJson;

  /** Chip global de guardado (WAVE-02 B3). */
  const saveState: ModelerSaveState = designDirty
    ? activeDesign !== null
      ? 'dirty'
      : 'dirty-unsaved'
    : activeDesign !== null
      ? 'saved'
      : 'clean';

  // -------------------------------------------------------------------------
  // WAVE-02 BLOQUE 3 — borrador de sesión: escritura debounced mientras se
  // edita (SOLO en el editor: la pantalla de inicio nunca pisa un borrador
  // existente), flush al volver al inicio y al ocultar la pestaña.
  // -------------------------------------------------------------------------

  const writeDraft = useCallback(() => {
    if (screen !== 'editor' || designStorage === null) return;
    saveSceneDraft(designStorage, document, {
      activeDesignId: activeDesign?.id ?? null,
      mode,
    });
  }, [screen, designStorage, document, activeDesign, mode]);

  useEffect(() => {
    if (screen !== 'editor') return;
    const timer = window.setTimeout(writeDraft, 300);
    return () => window.clearTimeout(timer);
  }, [screen, writeDraft]);

  useEffect(() => {
    if (screen !== 'editor') return;
    const flush = (): void => {
      writeDraft();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [screen, writeDraft]);

  // Lectura del borrador al montar (recuperación segura tras recargar:
  // validado por `parseSceneEnvelope`; nunca se restaura nada inválido).
  useEffect(() => {
    if (designStorage === null) return;
    setDraftInfo(readSceneDraft(designStorage));
  }, [designStorage]);

  /**
   * Instala un documento de diseño en la pantalla: historial NUEVO
   * (Deshacer no vuelve al documento anterior), selección y
   * borradores limpios; la geometría derivada del documento anterior
   * se libera por el circuito normal (nada de mallas en storage).
   */
  const applyDesignDocument = useCallback(
    (next: SceneDocument, design: { id: string; name: string } | null) => {
      history.reset(next);
      setSelection(null);
      selectionStashRef.current = null;
      setPendingSketch(null);
      setMoveDraft(null);
      setPositionError(null);
      setWardrobeEditError(null);
      setActiveDesign(design);
      setDesignFocusId(design === null ? null : design.id);
      setDesignSavedJson(JSON.stringify(next));
      setDesignError(null);
    },
    [history],
  );

  /**
   * WAVE-02 BLOQUE 0 — entrada al editor desde la pantalla de inicio:
   * instala el documento, fija el modo y ENCUADRA el contenido (la
   * cámara se centra en el mueble recién creado o en el diseño
   * abierto; después nada reencuadra solo).
   */
  const enterEditor = useCallback(
    (
      next: SceneDocument,
      design: { id: string; name: string } | null,
      nextMode: ModelerMode,
    ) => {
      applyDesignDocument(next, design);
      setMode(nextMode);
      setScreen('editor');
      setWelcomeError(null);
      setStartHint(null);
      if (next.objects.length > 0) {
        setFramedBounds(computeSceneBounds(next));
        setCamera((prev) => requestFit(prev));
      } else {
        setFramedBounds(DEFAULT_SCENE_BOUNDS);
      }
    },
    [applyDesignDocument],
  );

  // -------------------------------------------------------------------------
  // WAVE-02 BLOQUE 0 — acciones de la pantalla de inicio.
  // -------------------------------------------------------------------------

  /** «Crear clóset»: documento inicial con UN clóset válido + encuadre. */
  const handleWelcomeCreateCloset = useCallback(() => {
    const next = buildWardrobeSeedDocument(seedDocument);
    if (next === null) {
      setWelcomeError(
        'No se pudo crear el clóset (configuración inicial rechazada). Prueba con «Diseño libre».',
      );
      return;
    }
    enterEditor(next, null, 'simple');
    // Sin diseño que la respalde: la escena recién creada cuenta como
    // «Cambios sin guardar» (chip «Cambios sin guardar») desde el
    // primer momento (regla B3: ni una sola edición sin señalar).
    setDesignSavedJson(null);
    const created = next.objects[next.objects.length - 1];
    setSelection(
      created === undefined
        ? null
        : resolveObjectSelection(next, { objectId: created.id }),
    );
    setDesignMessage(null);
    setStartHint(
      'Este es tu clóset: cambia sus medidas en «Propiedades» y arrástralo sobre el suelo para colocarlo.',
    );
    setHistoryMessage('Clóset creado');
  }, [enterEditor, seedDocument]);

  /** «Continuar»: recupera el borrador de sesión validado (B3). */
  const handleWelcomeContinueDraft = useCallback(() => {
    if (draftInfo === null || !draftInfo.ok) return;
    const { document: draftDocument, meta } = draftInfo;
    let design: { id: string; name: string } | null = null;
    let baseline = JSON.stringify(draftDocument);
    if (designStorage !== null && meta.activeDesignId !== null) {
      const saved = readSceneDesign(designStorage, meta.activeDesignId);
      if (saved.ok) {
        design = { id: saved.id, name: saved.document.name };
        // El borrador del diseño activo se compara CON su última
        // versión guardada: «cambios sin guardar» = lo que difiere.
        // El nombre del documento NO es contenido editable en sesión
        // (la etiqueta del diseño vive en la entrada del listado y el
        // sobre guardado usa el nombre del diseño): se normaliza para
        // que la comparación refleje solo el CONTENIDO de la escena.
        baseline = JSON.stringify({
          ...saved.document,
          name: draftDocument.name,
        });
      }
    }
    applyDesignDocument(draftDocument, design);
    setDesignSavedJson(baseline);
    setMode(meta.mode);
    setScreen('editor');
    setWelcomeError(null);
    setStartHint(null);
    setDesignMessage('Sesión recuperada: seguimos donde lo dejaste.');
    setDesignError(null);
    setHistoryMessage('Sesión recuperada');
    if (draftDocument.objects.length > 0) {
      setFramedBounds(computeSceneBounds(draftDocument));
      setCamera((prev) => requestFit(prev));
    } else {
      setFramedBounds(DEFAULT_SCENE_BOUNDS);
    }
    refreshDesigns();
  }, [draftInfo, designStorage, applyDesignDocument, refreshDesigns]);

  /** «Abrir» un diseño guardado desde la bienvenida. */
  const handleWelcomeOpenDesign = useCallback(
    (id: string) => {
      if (designStorage === null) {
        setWelcomeError(
          'Almacenamiento local no disponible: no se puede abrir.',
        );
        return;
      }
      const result = readSceneDesign(designStorage, id);
      if (!result.ok) {
        // Corrupto/incompatible: expuesto; el registro NO se borra.
        setWelcomeError(result.message);
        return;
      }
      enterEditor(result.document, { id, name: result.document.name }, 'simple');
      setDesignFocusId(id);
      setDesignMessage(`Abierto: ${result.document.name}`);
      setHistoryMessage(`Abierto: ${result.document.name}`);
      refreshDesigns();
    },
    [designStorage, enterEditor, refreshDesigns],
  );

  /** «Diseño libre»: escena vacía en MODO AVANZADO (escape técnico). */
  const handleWelcomeFreeDesign = useCallback(() => {
    enterEditor(createSeedDocument(), null, 'advanced');
    setDesignMessage(null);
  }, [enterEditor]);

  /** «Descartar borrador»: acción EXPLÍCITA del usuario (nunca auto). */
  const handleWelcomeDiscardDraft = useCallback(() => {
    if (designStorage === null) return;
    openDialog({
      kind: 'confirm',
      title: 'Descartar borrador',
      description:
        '¿Descartar el borrador de sesión? Se perderá el trabajo que no esté guardado.',
      confirmLabel: 'Descartar',
      onConfirm: () => {
        if (designStorage === null) return;
        clearSceneDraft(designStorage);
        setDraftInfo(readSceneDraft(designStorage));
        setDesignMessage('Borrador descartado.');
        setWelcomeError(null);
        closeDialog();
      },
      onCancel: closeDialog,
    });
  }, [designStorage, openDialog, closeDialog]);

  /** «Inicio»: vuelve a la bienvenida (el borrador ya está escrito). */
  const handleHome = useCallback(() => {
    writeDraft();
    setScreen('welcome');
    setWelcomeError(null);
    if (designStorage !== null) setDraftInfo(readSceneDraft(designStorage));
    refreshDesigns();
  }, [writeDraft, designStorage, refreshDesigns]);

  /** Cambio de modo: SOLO presentación (documento/selección intactos). */
  const handleModeChange = useCallback((next: ModelerMode) => {
    setMode(next);
  }, []);

  /** Guardar como: NUEVO id determinista con nombre (diálogo propio). */
  const handleDesignSaveAs = useCallback(() => {
    if (designStorage === null) {
      setDesignError('Almacenamiento local no disponible: no se guardó nada.');
      setDesignMessage(null);
      return;
    }
    const proposed =
      activeDesign === null ? document.name : `${activeDesign.name} (copia)`;
    openDialog({
      kind: 'prompt',
      title: 'Guardar como',
      description: 'Elige un nombre para el nuevo proyecto (se guarda en este navegador).',
      initialValue: proposed,
      confirmLabel: 'Guardar',
      onConfirm: (value) => {
        if (designStorage === null) return;
        const name = value.trim();
        if (name === '') {
          setDialog((current) =>
            current === null
              ? null
              : { ...current, error: 'El nombre no puede estar vacío.' },
          );
          return;
        }
        const result = createSceneDesign(designStorage, { ...document, name });
        if (!result.ok) {
          setDialog((current) =>
            current === null ? null : { ...current, error: result.message },
          );
          return;
        }
        setActiveDesign({ id: result.id, name });
        setDesignFocusId(result.id);
        setDesignSavedJson(designDocumentJson);
        setDesignMessage(`Guardado: ${name}`);
        setDesignError(null);
        refreshDesigns();
        setHistoryMessage(`Guardado: ${name}`);
        closeDialog();
      },
      onCancel: closeDialog,
    });
  }, [
    designStorage,
    activeDesign,
    document,
    designDocumentJson,
    refreshDesigns,
    openDialog,
    closeDialog,
  ]);

  /** Guardar: SOLO sobrescribe el diseño activo (explícito, nunca automático). */
  const handleDesignSave = useCallback(() => {
    if (designStorage === null) {
      setDesignError('Almacenamiento local no disponible: no se guardó nada.');
      setDesignMessage(null);
      return;
    }
    if (activeDesign === null) {
      handleDesignSaveAs(); // sin diseño asociado → exige nombre nuevo
      return;
    }
    const result = saveSceneDesign(designStorage, activeDesign.id, {
      ...document,
      name: activeDesign.name,
    });
    if (!result.ok) {
      setDesignError(result.message);
      setDesignMessage(null);
      return;
    }
    setDesignSavedJson(designDocumentJson);
    setDesignMessage(`Guardado: ${activeDesign.name}`);
    setDesignError(null);
    refreshDesigns();
    setHistoryMessage(`Guardado: ${activeDesign.name}`);
  }, [
    designStorage,
    activeDesign,
    document,
    designDocumentJson,
    refreshDesigns,
    handleDesignSaveAs,
  ]);

  /** Selección en el selector → intento de apertura (con guardia de cambios). */
  const handleDesignFocusChange = useCallback(
    (id: string) => {
      setDesignFocusId(id);
      if (designStorage === null) {
        setDesignError(
          'Almacenamiento local no disponible: no se puede abrir.',
        );
        setDesignMessage(null);
        return;
      }
      if (designDirty) {
        openDialog({
          kind: 'confirm',
          title: 'Cambios sin guardar',
          description: `Hay cambios sin guardar en «${activeDesign?.name ?? 'la escena'}». Al abrir «${id}» se perderán. ¿Continuar?`,
          confirmLabel: 'Abrir de todos modos',
          onConfirm: () => {
            if (designStorage === null) return;
            const confirmed = readSceneDesign(designStorage, id);
            if (!confirmed.ok) {
              setDesignError(confirmed.message);
              setDesignMessage(null);
              closeDialog();
              return;
            }
            applyDesignDocument(confirmed.document, {
              id,
              name: confirmed.document.name,
            });
            setDesignMessage(`Abierto: ${confirmed.document.name}`);
            refreshDesigns();
            setHistoryMessage(`Abierto: ${confirmed.document.name}`);
            closeDialog();
          },
          onCancel: () => {
            setDesignFocusId(activeDesign?.id ?? null); // cancelar: selector intacto
            closeDialog();
          },
        });
        return;
      }
      const result = readSceneDesign(designStorage, id);
      if (!result.ok) {
        // Corrupto/incompatible: visible con su código; el foco queda en
        // la entrada para poder ELIMINARLA (única operación sin parseo).
        setDesignError(result.message);
        setDesignMessage(null);
        return;
      }
      applyDesignDocument(result.document, {
        id,
        name: result.document.name,
      });
      setDesignMessage(`Abierto: ${result.document.name}`);
      refreshDesigns();
      setHistoryMessage(`Abierto: ${result.document.name}`);
    },
    [
      designStorage,
      designDirty,
      activeDesign,
      applyDesignDocument,
      refreshDesigns,
      openDialog,
      closeDialog,
    ],
  );

  /** Nuevo diseño: escena semilla con guardia de cambios sin guardar. */
  const handleDesignNew = useCallback(() => {
    if (designDirty) {
      openDialog({
        kind: 'confirm',
        title: 'Cambios sin guardar',
        description: `Hay cambios sin guardar en «${activeDesign?.name ?? 'la escena'}». Al crear un proyecto nuevo se perderán. ¿Continuar?`,
        confirmLabel: 'Crear de todos modos',
        onConfirm: () => {
          applyDesignDocument(createSeedDocument(), null);
          setDesignMessage('Nueva escena');
          setHistoryMessage('Nueva escena');
          closeDialog();
        },
        onCancel: closeDialog,
      });
      return;
    }
    applyDesignDocument(createSeedDocument(), null);
    setDesignMessage('Nueva escena');
    setHistoryMessage('Nueva escena');
  }, [designDirty, activeDesign, applyDesignDocument, openDialog, closeDialog]);

  /** Renombrar la entrada con foco (el id y el resto no cambian). */
  const handleDesignRename = useCallback(() => {
    const id = designFocusId ?? activeDesign?.id ?? null;
    if (id === null) {
      setDesignError('No hay ningún proyecto seleccionado para renombrar.');
      setDesignMessage(null);
      return;
    }
    if (designStorage === null) {
      setDesignError('Almacenamiento local no disponible.');
      setDesignMessage(null);
      return;
    }
    const current =
      designSummaries.find((entry) => entry.id === id)?.name ??
      activeDesign?.name ??
      id;
    openDialog({
      kind: 'prompt',
      title: 'Renombrar proyecto',
      description: `Nuevo nombre para «${current}» (el id y el contenido no cambian).`,
      initialValue: current,
      confirmLabel: 'Renombrar',
      onConfirm: (value) => {
        if (designStorage === null) return;
        const trimmed = value.trim();
        if (trimmed === '') {
          // UX-C: nombre vacío → diálogo SIGUE ABIERTO con error
          // visible (role=alert); nada se ejecuta.
          setDialog((currentSpec) =>
            currentSpec === null
              ? null
              : {
                  ...currentSpec,
                  error: 'El nombre no puede estar vacío.',
                },
          );
          return;
        }
        if (trimmed === current) {
          closeDialog(); // sin cambios: se cierra sin tocar nada
          return;
        }
        const result = renameSceneDesign(designStorage, id, trimmed);
        if (!result.ok) {
          setDialog((currentSpec) =>
            currentSpec === null ? null : { ...currentSpec, error: result.message },
          );
          return;
        }
        if (activeDesign?.id === id) setActiveDesign({ id, name: trimmed });
        refreshDesigns();
        setDesignMessage(`Renombrado: ${trimmed}`);
        setDesignError(null);
        closeDialog();
      },
      onCancel: closeDialog,
    });
  }, [
    designFocusId,
    activeDesign,
    designStorage,
    designSummaries,
    refreshDesigns,
    openDialog,
    closeDialog,
  ]);

  /** Duplicar la entrada con foco a un id determinista nuevo. */
  const handleDesignDuplicate = useCallback(() => {
    const id = designFocusId ?? activeDesign?.id ?? null;
    if (id === null) {
      setDesignError('No hay ningún proyecto seleccionado para duplicar.');
      setDesignMessage(null);
      return;
    }
    if (designStorage === null) {
      setDesignError('Almacenamiento local no disponible.');
      setDesignMessage(null);
      return;
    }
    const currentName =
      designSummaries.find((entry) => entry.id === id)?.name ?? 'proyecto';
    const result = duplicateSceneDesign(designStorage, id);
    if (!result.ok) {
      setDesignError(result.message);
      setDesignMessage(null);
      return;
    }
    setDesignFocusId(result.id);
    refreshDesigns();
    setDesignMessage(`Duplicado: «${currentName}» → ${result.id}`);
    setDesignError(null);
  }, [designFocusId, activeDesign, designStorage, designSummaries, refreshDesigns]);

  /** Eliminar la entrada con foco (confirmación obligatoria). */
  const handleDesignDelete = useCallback(() => {
    const id = designFocusId ?? activeDesign?.id ?? null;
    if (id === null) {
      setDesignError('No hay ningún proyecto seleccionado para eliminar.');
      setDesignMessage(null);
      return;
    }
    if (designStorage === null) {
      setDesignError('Almacenamiento local no disponible.');
      setDesignMessage(null);
      return;
    }
    const name = designSummaries.find((entry) => entry.id === id)?.name ?? id;
    openDialog({
      kind: 'confirm',
      title: 'Eliminar proyecto',
      description: `¿Eliminar el proyecto «${name}»? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      onConfirm: () => {
        if (designStorage === null) return;
        const result = deleteSceneDesign(designStorage, id);
        if (!result.ok) {
          setDesignError(result.message);
          setDesignMessage(null);
          closeDialog();
          return;
        }
        if (activeDesign?.id === id) {
          // La escena SIGUE abierta en pantalla; solo retira su registro.
          // El baseline se conserva: el chip sigue reflejando con honestidad
          // si el contenido tiene o no cambios sin guardar.
          setActiveDesign(null);
        }
        setDesignFocusId(null);
        refreshDesigns();
        setDesignMessage(`Eliminado: ${name}`);
        setDesignError(null);
        setHistoryMessage(`Eliminado: ${name}`);
        closeDialog();
      },
      onCancel: closeDialog,
    });
  }, [
    designFocusId,
    activeDesign,
    designStorage,
    designSummaries,
    refreshDesigns,
    openDialog,
    closeDialog,
  ]);

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
      // WAVE-02 B2 (auditoría P-05): validar rangos NO basta — el
      // reparto entre módulos debe ser REALIZABLE (`distributeModules`,
      // misma función que ejecuta la derivación). Si falla, se RECHAZA
      // el cambio con el mensaje del propio motor y el documento queda
      // intacto: antes el cambio se aplicaba, la derivación fallaba
      // después y el mueble se quedaba sin malla con un «Generando…»
      // falso. Aquí: error claro, medidas originales conservadas y
      // NINGUNA sustitución silenciosa.
      try {
        distributeModules(distributionInput(candidate));
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'el reparto entre módulos no es posible con estas medidas.';
        setWardrobeEditError(`No se aplicó el cambio: ${message}`);
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
  /**
   * WAVE-02 BLOQUE 1 — «Encuadrar»: recalcula la caja REAL de los
   * objetos y re-aplica la vista activa sobre ella (acción explícita
   * del usuario; nada más reencuadra).
   */
  const handleFit = useCallback(() => {
    setFramedBounds(computeSceneBounds(historyRef.current.document));
    setCamera((prev) => requestFit(prev));
  }, []);

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

  // WAVE-01: panel de posición (común a sólidos y clósets) con
  // propiedades derivadas del documento (undo/redo lo actualizan).
  const positionPanel: PositionPanelProps | null =
    selectedObjectId === null || selectedPositionMm === null
      ? null
      : {
          xText: String(selectedPositionMm[0]),
          zText: String(selectedPositionMm[2]),
          onXChange: (text) => handlePositionField('x', text),
          onZChange: (text) => handlePositionField('z', text),
          onNudge: handleNudge,
          nudgeStepMm: document.gridStepMm,
          snapEnabled,
          onSnapChange: setSnapEnabled,
          snapStepMm: document.gridStepMm,
          errorMessage: positionError,
          draggable: selectedDraggable,
        };

  // WAVE-01 BLOQUE 3: panel de diseños (siempre presente; con
  // `storageAvailable=false` lo dice explícitamente en lugar de
  // fingir botones operativos).
  const designsPanel: DesignsPanelProps = {
    designs: designSummaries,
    activeId: activeDesign?.id ?? null,
    focusId: designFocusId,
    dirty: designDirty,
    storageAvailable: designStorage !== null,
    onNew: handleDesignNew,
    onSave: handleDesignSave,
    onSaveAs: handleDesignSaveAs,
    onFocusChange: handleDesignFocusChange,
    onRename: handleDesignRename,
    onDuplicate: handleDesignDuplicate,
    onDelete: handleDesignDelete,
    message: designMessage,
    error: designError,
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
      /** WAVE-01: estado de distribución espacial para verificación visual. */
      getTransformState: () => ({
        moveDraft,
        snapEnabled,
        positionError,
        selectedPositionMm,
        selectedDraggable,
      }),
      /** WAVE-01 BLOQUE 3: estado de diseños locales para verificación visual. */
      getDesigns: () => ({
        summaries: designSummaries,
        activeDesign,
        focusId: designFocusId,
        dirty: designDirty,
        message: designMessage,
        error: designError,
        storageAvailable: designStorage !== null,
      }),
      /** WAVE-02: pantalla, modo, chip de guardado y encuadre. */
      getScreen: () => screen,
      getMode: () => mode,
      getSaveState: () => saveState,
      getStartHint: () => startHint,
      getFramedBounds: () => framedBounds,
      getDraft: () =>
        draftInfo === null
          ? null
          : draftInfo.ok
            ? {
                ok: true,
                name: draftInfo.document.name,
                objectCount: draftInfo.document.objects.length,
                meta: draftInfo.meta,
              }
            : { ok: false, code: draftInfo.code, message: draftInfo.message },
    };
    return () => {
      delete target.__modeler;
    };
  }, [
    document,
    tool,
    selection,
    sceneGeometry,
    history,
    historyMessage,
    moveDraft,
    snapEnabled,
    positionError,
    selectedPositionMm,
    selectedDraggable,
    designSummaries,
    activeDesign,
    designFocusId,
    designDirty,
    designMessage,
    designError,
    designStorage,
    screen,
    mode,
    saveState,
    startHint,
    framedBounds,
    draftInfo,
  ]);

  // Tarjeta de «Continuar» de la bienvenida (B3): nombre, antigüedad y
  // tamaño del borrador; un borrador dañado se muestra como dañado.
  const draftCard: WelcomeDraftCard | null = useMemo(() => {
    if (draftInfo === null) return null;
    if (!draftInfo.ok) {
      return draftInfo.code === 'ERR_DRAFT_MISSING'
        ? null
        : { corrupted: true, message: draftInfo.message };
    }
    const summary =
      draftInfo.meta.activeDesignId === null
        ? undefined
        : designSummaries.find(
            (entry) => entry.id === draftInfo.meta.activeDesignId,
          );
    return {
      corrupted: false,
      name: draftInfo.document.name,
      designName: summary !== undefined && !summary.corrupted ? summary.name : null,
      objectCount: draftInfo.document.objects.length,
      ageText: formatDraftAge(draftInfo.meta.updatedAt, Date.now()),
    };
  }, [draftInfo, designSummaries]);

  if (screen === 'welcome') {
    return (
      <>
        <WelcomeScreen
          storageAvailable={designStorage !== null}
          designs={designSummaries}
          draft={draftCard}
          error={welcomeError}
          onCreateCloset={handleWelcomeCreateCloset}
          onContinueDraft={handleWelcomeContinueDraft}
          onDiscardDraft={handleWelcomeDiscardDraft}
          onOpenDesign={handleWelcomeOpenDesign}
          onFreeDesign={handleWelcomeFreeDesign}
        />
        {dialog !== null && <ModelerDialog dialog={dialog} />}
      </>
    );
  }

  return (
    <>
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
      position={positionPanel}
      designs={designsPanel}
      mode={mode}
      onModeChange={handleModeChange}
      onHome={handleHome}
      saveState={saveState}
      startHint={startHint}
      cardActions={cardActions}
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
        moveDraft={moveDraft}
        snapGridStepMm={snapEnabled ? document.gridStepMm : null}
        onMoveDraftChange={handleMoveDraftChange}
        onObjectMove={applyObjectPosition}
        mode={mode}
        bounds={framedBounds}
      />
      </ModelerShell>
      {dialog !== null && <ModelerDialog dialog={dialog} />}
    </>
  );
}
