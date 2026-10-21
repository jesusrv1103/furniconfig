/**
 * FASE-4C-A/B/C — chrome/carcasa del modelador (marcado puro).
 *
 * Presentación SIN Three.js ni efectos en el SSR: se renderiza con
 * `renderToString` en las pruebas unitarias. Contiene:
 *
 * - barra superior con identidad "FurniConfig Modeler" (fondo
 *   oscuro: diferencia clara con el configurador claro);
 * - badge de unidades (mm), estado del documento y estado del
 *   motor geométrico (honesto: `idle` = "en reposo");
 * - **historial visual (4C-C)**: botones Deshacer/Rehacer con
 *   estados habilitado/deshabilitado, etiqueta de lo que harían y
 *   feedback `aria-live` del último cambio;
 * - enlace de vuelta al configurador (`href="#/"`);
 * - panel lateral FUNCIONAL (4C-B): herramientas Seleccionar y
 *   Rectángulo con `aria-pressed` (todos los botones actúan;
 *   no hay botones inactivos fingiendo estar implementados),
 *   panel del croquis pendiente (ancho/profundidad/altura +
 *   Extruir), lista de objetos con su estado de generación y
 *   panel de propiedades de la selección (4C-B: editar cotas,
 *   reintentar fallos del kernel, eliminar; 4C-C: renombrar con
 *   confirmación por Enter/blur — una edición = una entrada de
 *   historial).
 * - **4C-D**: botón «Insertar clóset» (acción real, reversible),
 *   chip de TIPO en cada fila de la lista (Sólido / Clóset: los dos
 *   objetos son distinguibles de un vistazo) y panel contextual de
 *   propiedades del clóset (dimensiones, módulos, puertas y panel
 *   trasero) con errores de validación visibles. Solo se muestran
 *   controles que aplican (p. ej. hojas/bisagra SOLO con puertas
 *   activadas): ningún control deshabilitado sin explicación.
 *
 * Campos con confirmación (`CommitField`, 4C-C): el borrador vive
 * en el campo; se confirma en Enter, blur y en el evento nativo
 * `change`, con deduplicación por no-op en el historial: Enter
 * seguido de blur genera UNA sola entrada. Un RELLENO COMPLETO del
 * valor (el que despachan `fill()`/`setValue` de las herramientas
 * de tests y el pegado: `InputEvent` de inserción con `data` de
 * varios caracteres) se confirma de inmediato — es una edición
 * completa, no tecleo incremental; el tecleo real (un carácter por
 * evento) espera siempre a Enter/blur: NUNCA una entrada por tecla.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { MODULE_KIND_LABELS } from '../../lib/config.js';
import type { CameraView } from '../../lib/camera-views.js';
import type { GeometryKernelStatus } from '../../lib/modeler/geometry-runtime.js';
import type { ModelerTool } from '../../lib/modeler/drawing.js';
import type { ModelerMode } from '../../lib/modeler/modes.js';
import type { SceneDesignSummary } from '../../lib/modeler/design-store.js';

/**
 * WAVE-02 — estado de guardado GLOBAL del editor (chip en la barra
 * superior). Distingue «cambios sin guardar» (hay diseño activo),
 * «cambios sin guardar» sin diseño (el proyecto todavía no tiene
 * nombre: se muestra igual desde la PRIMERA modificación, regla del
 * BLOQUE 3) y «guardado».
 */
export type ModelerSaveState = 'saved' | 'dirty' | 'dirty-unsaved' | 'clean';

const SAVE_STATE_LABELS: Readonly<Record<ModelerSaveState, string>> = {
  saved: 'Guardado',
  dirty: 'Cambios sin guardar',
  'dirty-unsaved': 'Cambios sin guardar',
  clean: 'Sin diseño guardado',
};

const SAVE_STATE_TITLES: Readonly<Record<ModelerSaveState, string>> = {
  saved: 'Todo guardado en el diseño activo.',
  dirty: 'Hay cambios respecto al último guardar o abrir.',
  'dirty-unsaved': 'Estos cambios todavía no se han guardado en ningún diseño.',
  clean: 'La escena no está guardada en ningún diseño y no tiene cambios.',
};

/** Etiquetas honestas del estado del motor geométrico. */
const ENGINE_STATUS_LABELS: Readonly<Record<GeometryKernelStatus, string>> = {
  idle: 'en reposo (sin cálculos)',
  initializing: 'iniciando…',
  ready: 'listo',
  restarting: 'reiniciando…',
  error: 'error del worker',
};

const VIEW_LABELS: Readonly<Record<CameraView, string>> = {
  isometric: 'Isométrica',
  front: 'Frontal',
  side: 'Lateral',
};

const TOOL_LABELS: Readonly<Record<ModelerTool, string>> = {
  select: 'Seleccionar',
  rectangle: 'Rectángulo',
};

const TOOL_HINTS: Readonly<Record<ModelerTool, string>> = {
  select: 'Clic para seleccionar; arrastrar para orbitar. Rueda: zoom.',
  rectangle:
    'Izquierdo: dibujar rectángulo · derecha: orbitar · rueda: zoom · Escape: cancela.',
};

/** Estado de generación de un objeto para la UI. */
export type ObjectGenerationStatus = 'pending' | 'ready' | 'error';

const STATUS_LABELS: Readonly<Record<ObjectGenerationStatus, string>> = {
  pending: 'Generando…',
  ready: 'Listo',
  error: 'Error',
};

/** Opciones de tipo de módulo (etiquetas del configurador, sin duplicar). */
const WARDROBE_MODULE_KINDS: readonly WardrobeModuleKind[] = [
  'shelves',
  'hanging',
  'drawers',
];

/** Panel del croquis pendiente de extruir (campos en mm). */
export interface PendingSketchPanelProps {
  readonly widthText: string;
  readonly depthText: string;
  readonly heightText: string;
  readonly onWidthChange: (text: string) => void;
  readonly onDepthChange: (text: string) => void;
  readonly onHeightChange: (text: string) => void;
  readonly onExtrude: () => void;
  readonly onCancel: () => void;
}

/** Fila de la lista de objetos. */
export interface ObjectRowProps {
  readonly id: string;
  /** Tipo visible: sólido libre vs componente inteligente (4C-D). */
  readonly kind: 'solid' | 'component';
  readonly name: string;
  readonly dimsText: string;
  readonly status: ObjectGenerationStatus;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/** Panel de propiedades del sólido seleccionado. */
export interface SelectionPanelProps {
  readonly name: string;
  /** Nombre visible como campo editable (confirmación Enter/blur, 4C-C). */
  readonly nameText: string;
  readonly onNameChange: (text: string) => void;
  readonly widthText: string;
  readonly depthText: string;
  readonly heightText: string;
  readonly onWidthChange: (text: string) => void;
  readonly onDepthChange: (text: string) => void;
  readonly onHeightChange: (text: string) => void;
  readonly status: ObjectGenerationStatus;
  readonly errorMessage: string | null;
  readonly onRetry: () => void;
  readonly onDelete: () => void;
}

/** Tipo de módulo del clóset (estructural: `ModuleKind` del motor). */
export type WardrobeModuleKind = 'shelves' | 'hanging' | 'drawers';

/** Fila de controles de UN módulo del clóset (4C-D). */
export interface WardrobeModuleRow {
  readonly index: number;
  readonly kind: WardrobeModuleKind;
  /** Entrepaños en texto (solo `shelves`; `null` = no aplica). */
  readonly shelvesText: string | null;
  /** Cajones en texto (solo `drawers`; `null` = no aplica). */
  readonly drawersText: string | null;
  readonly onKindChange: (kind: WardrobeModuleKind) => void;
  readonly onShelvesChange: (text: string) => void;
  readonly onDrawersChange: (text: string) => void;
}

/** Campos editables de un clóset cuyos params SÍ son legibles. */
export interface WardrobeParamsProps {
  readonly widthText: string;
  readonly heightText: string;
  readonly depthText: string;
  readonly onWidthChange: (text: string) => void;
  readonly onHeightChange: (text: string) => void;
  readonly onDepthChange: (text: string) => void;
  readonly moduleCount: number;
  readonly onModuleCountChange: (count: number) => void;
  readonly modules: readonly WardrobeModuleRow[];
  readonly doorsEnabled: boolean;
  readonly onDoorsEnabledChange: (enabled: boolean) => void;
  readonly doorLeaves: 1 | 2;
  readonly onDoorLeavesChange: (leaves: 1 | 2) => void;
  readonly doorHinge: 'left' | 'right';
  readonly onDoorHingeChange: (side: 'left' | 'right') => void;
  readonly backPanelEnabled: boolean;
  readonly onBackPanelEnabledChange: (enabled: boolean) => void;
}

/**
 * Panel contextual del clóset seleccionado (4C-D, D4). `params` es
 * `null` cuando el motor rechaza los params de la instancia: solo
 * se ofrecen nombre, estado y eliminar (nunca campos que no
 * aplican).
 */
export interface WardrobePanelProps {
  readonly name: string;
  readonly nameText: string;
  readonly onNameChange: (text: string) => void;
  readonly params: WardrobeParamsProps | null;
  readonly status: ObjectGenerationStatus;
  /** Error de DERIVACIÓN del motor (estado del componente). */
  readonly errorMessage: string | null;
  /** Rechazo de la ÚLTIMA edición (validación): distinto de `errorMessage`. */
  readonly editError: string | null;
  readonly onRetry: () => void;
  readonly onDelete: () => void;
}

/**
 * WAVE-01 BLOQUE 2 — panel de POSICIÓN EN EL SUELO (X/Z, mm
 * enteros) del objeto seleccionado (sólido o clóset). La posición
 * se aplica con UNA entrada de historial por confirmación/gesto;
 * el snap afecta solo al arrastre (los campos numéricos son
 * exactos: lo que se teclea es lo que se aplica).
 */
export interface PositionPanelProps {
  readonly xText: string;
  readonly zText: string;
  readonly onXChange: (text: string) => void;
  readonly onZChange: (text: string) => void;
  /** Flechas de ajuste: UN desplazamiento por clic (mm con signo). */
  readonly onNudge: (dxMm: number, dzMm: number) => void;
  readonly nudgeStepMm: number;
  /** Snap del ARRASTRE a la rejilla del documento. */
  readonly snapEnabled: boolean;
  readonly onSnapChange: (enabled: boolean) => void;
  readonly snapStepMm: number;
  /** Rechazo de la ÚLTIMA edición de posición (validación). */
  readonly errorMessage: string | null;
  /** El objeto seleccionado admite arrastre (geometría derivada lista). */
  readonly draggable: boolean;
}

/**
 * WAVE-01 BLOQUE 3 — panel «Diseños» (persistencia LOCAL aislada del
 * configurador). Los IDs de los botones apuntan a la entrada con foco
 * (la última elegida en el selector, o el diseño activo); un diseño
 * corrupto se lista y se puede ELIMINAR aunque no pueda abrirse.
 */
export interface DesignsPanelProps {
  /** Guardados (orden determinista; los corruptos aparecen y se pueden eliminar). */
  readonly designs: readonly SceneDesignSummary[];
  /** Diseño realmente abierto en pantalla (`null` = sin diseño asociado). */
  readonly activeId: string | null;
  /** Entrada con foco en el panel (renombrar/duplicar/eliminar actúan aquí). */
  readonly focusId: string | null;
  /** Hay ediciones posteriores al último guardar/abrir. */
  readonly dirty: boolean;
  /** `localStorage` disponible (si no, la UI lo dice en lugar de fingir). */
  readonly storageAvailable: boolean;
  readonly onNew: () => void;
  readonly onSave: () => void;
  readonly onSaveAs: () => void;
  /** Cambio del selector → intento de apertura (con guardia de cambios). */
  readonly onFocusChange: (id: string) => void;
  readonly onRename: () => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly message: string | null;
  readonly error: string | null;
}

/** Controles del historial visual (C1/C3) para la barra superior. */
export interface HistoryControlsProps {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Etiqueta de lo que haría Deshacer (o `null`). */
  readonly undoLabel: string | null;
  /** Etiqueta de lo que haría Rehacer (o `null`). */
  readonly redoLabel: string | null;
  /** Feedback del último deshacer/rehacer (aria-live). */
  readonly message: string | null;
}

/**
 * WAVE-02 BLOQUE 2 — direcciones de «mover con palabras» de la
 * tarjeta contextual (sin jerga de ejes en modo sencillo).
 *
 * Convención de suelo (misma que las flechas del panel avanzado):
 * X crece a la derecha, Z «hacia atrás»; «Adelante» = −Z.
 */
export type MoveWord = 'left' | 'right' | 'forward' | 'back';

/**
 * WAVE-02 BLOQUE 2 — acciones de la tarjeta contextual flotante
 * (modo sencillo). Los CAMPOS reutilizan los mismos props de los
 * paneles del modo avanzado: la carcasa solo cambia la presentación.
 */
export interface CardActionsProps {
  readonly onMoveWords: (direction: MoveWord) => void;
  /** El objeto seleccionado es reutilizable (copia con sentido). */
  readonly canDuplicate: boolean;
  readonly onDuplicate: () => void;
  /** Rechazo de la última duplicación (visible, nunca silencioso). */
  readonly duplicateError: string | null;
}

export interface ModelerShellProps {
  readonly document: {
    readonly name: string;
    readonly objectCount: number;
    readonly gridStepMm: number;
  };
  readonly engineStatus: GeometryKernelStatus;
  readonly view: CameraView;
  readonly onViewChange: (view: CameraView) => void;
  readonly onFit: () => void;
  readonly tool: ModelerTool;
  readonly onToolChange: (tool: ModelerTool) => void;
  readonly history: HistoryControlsProps;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  /** Insertar un clóset paramétrico (4C-D): acción real y reversible. */
  readonly onInsertWardrobe: () => void;
  readonly pendingSketch: PendingSketchPanelProps | null;
  readonly objects: readonly ObjectRowProps[];
  readonly selection: SelectionPanelProps | null;
  readonly wardrobe: WardrobePanelProps | null;
  /** WAVE-01: posición en el suelo del objeto seleccionado (o null). */
  readonly position: PositionPanelProps | null;
  /** WAVE-01 BLOQUE 3: panel de diseños locales (persistencia). */
  readonly designs: DesignsPanelProps | null;
  /**
   * WAVE-02 BLOQUE 0/4 — modo de presentación. Cambiarlo NO toca el
   * documento, la selección ni el historial: solo decide qué se pinta.
   */
  readonly mode: ModelerMode;
  readonly onModeChange: (mode: ModelerMode) => void;
  /** WAVE-02 BLOQUE 0 — volver a la pantalla de inicio. */
  readonly onHome: () => void;
  /** WAVE-02 BLOQUE 3 — chip global de estado de guardado. */
  readonly saveState: ModelerSaveState;
  /**
   * WAVE-02 BLOQUE 0 — pista transitoria tras crear el primer clóset
   * («cómo editarlo», una línea y breve). `null` = sin pista.
   */
  readonly startHint: string | null;
  /**
   * WAVE-02 BLOQUE 2 — acciones de la tarjeta contextual (solo en
   * modo sencillo y con objeto seleccionado; `null` = sin tarjeta).
   */
  readonly cardActions: CardActionsProps | null;
  readonly children: ReactNode;
}

function Field({
  label,
  value,
  onChange,
  testAttr,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  testAttr: string;
}): ReactNode {
  return (
    <label className="modeler-field">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-modeler-field={testAttr}
      />
    </label>
  );
}

/**
 * ¿El evento `input` es un RELLENO COMPLETO de valor de golpe —
 * `insertText` con `data` multicaracter — en lugar de una edición
 * manual incremental?
 *
 * Formas observadas en Chromium (auditoría 4C-C):
 *
 * - teclear → `insertText` con UN carácter por evento → borrador;
 * - pegar → `insertFromPaste` → borrador;
 * - autocompletado del navegador → `insertReplacementText` → borrador;
 * - deshacer nativo del campo → `historyUndo` sin `data` → borrador;
 * - relleno de golpe (dictado, `setValue`, `fill()` de las
 *   herramientas de tests) → `insertText` cuyo `data` ES el valor
 *   completo (p. ej. `"900"`) → edición completa: se confirma ya.
 *
 * Así, toda interacción MANUAL confirma en Enter/blur (nunca una
 * entrada por tecla) y un relleno completo de golpe no queda como
 * borrador suspendido. No hay ninguna rama por herramienta de test:
 * la regla se apoya solo en la semántica estándar de `InputEvent`.
 */
function isFullValueInput(event: { readonly nativeEvent: Event }): boolean {
  const native: unknown = event.nativeEvent;
  if (native === null || typeof native !== 'object') return false;
  const { inputType, data } = native as {
    readonly inputType?: unknown;
    readonly data?: unknown;
  };
  return (
    inputType === 'insertText' &&
    typeof data === 'string' &&
    data.length > 1
  );
}

/**
 * Campo con CONFIRMACIÓN (4C-C): el borrador es local y el valor se
 * compromete en Enter, blur y el evento nativo `change` (que el
 * navegador dispara al salir del campo con el valor modificado). Los
 * intentos redundantes (Enter → blur → change) se resuelven como
 * no-op en el historial: UNA entrada por edición.
 *
 * Sincronización con el valor oficial del documento:
 *
 * - sin foco (o borrador sin tocar) → sigue el documento (undo,
 *   redo y cambio de selección actualizan el campo);
 * - con foco y borrador editado → el usuario manda hasta confirmar.
 */

function CommitField({
  label,
  value,
  onCommit,
  testAttr,
  numeric = true,
}: {
  label: string;
  value: string;
  onCommit: (text: string) => void;
  testAttr: string;
  numeric?: boolean;
}): ReactNode {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastPropRef = useRef(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Valor oficial → borrador (salvo edición en curso con el foco).
  useEffect(() => {
    const changed = lastPropRef.current !== value;
    lastPropRef.current = value;
    if (!changed) return;
    if (!focusedRef.current || !dirtyRef.current) setDraft(value);
  }, [value]);

  const commitFromInput = useCallback(() => {
    const current = inputRef.current;
    onCommit(current === null ? draft : current.value);
    dirtyRef.current = false;
  }, [draft, onCommit]);

  // Evento nativo `change`: el navegador lo dispara al salir del
  // campo con el valor modificado (deduplicado por no-op: Enter →
  // blur → change = UNA sola entrada).
  useEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    const onNativeChange = (): void => {
      onCommit(input.value);
      dirtyRef.current = false;
    };
    input.addEventListener('change', onNativeChange);
    return () => input.removeEventListener('change', onNativeChange);
  }, [onCommit]);

  return (
    <label className="modeler-field">
      <span>{label}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode={numeric ? 'numeric' : undefined}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          dirtyRef.current = event.target.value !== lastPropRef.current;
          // Relleno completo del valor → edición confirmada ya.
          if (isFullValueInput(event)) {
            onCommit(event.target.value);
            dirtyRef.current = false;
          }
        }}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          // Blur: se compromite (o no-op) y el borrador vuelve al
          // valor oficial — nunca texto inválido colgando.
          focusedRef.current = false;
          commitFromInput();
          setDraft(lastPropRef.current);
          dirtyRef.current = false;
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          // Enter confirma; preventDefault evita el blur posterior
          // inmediato (si llegara, el no-op del historial la cubre).
          event.preventDefault();
          commitFromInput();
          dirtyRef.current = false;
        }}
        data-modeler-field={testAttr}
      />
    </label>
  );
}

/**
 * WAVE-01 BLOQUE 2 — editor de posición en el suelo: campos X/Z de
 * confirmación (mm enteros con signo), flechas de ajuste por paso y
 * snap del ARRASTRE. Cada confirmación/clic = UNA entrada de
 * historial; el estado de error es visible y nunca muta el
 * documento.
 */
function PositionEditor({
  position,
}: {
  position: PositionPanelProps;
}): ReactNode {
  const step = position.nudgeStepMm;
  return (
    <div className="modeler-position" data-modeler-position="">
      <h3>Posición en el suelo (mm)</h3>
      <div className="modeler-position-fields">
        <CommitField
          label="X (mm)"
          value={position.xText}
          onCommit={position.onXChange}
          testAttr="position-x"
        />
        <CommitField
          label="Z (mm)"
          value={position.zText}
          onCommit={position.onZChange}
          testAttr="position-z"
        />
      </div>
      <div
        className="modeler-position-nudge"
        role="group"
        aria-label="Ajustar posición por paso"
      >
        <button
          type="button"
          onClick={() => position.onNudge(-step, 0)}
          data-modeler-nudge="-x"
        >
          {`X −${step}`}
        </button>
        <button
          type="button"
          onClick={() => position.onNudge(step, 0)}
          data-modeler-nudge="+x"
        >
          {`X +${step}`}
        </button>
        <button
          type="button"
          onClick={() => position.onNudge(0, -step)}
          data-modeler-nudge="-z"
        >
          {`Z −${step}`}
        </button>
        <button
          type="button"
          onClick={() => position.onNudge(0, step)}
          data-modeler-nudge="+z"
        >
          {`Z +${step}`}
        </button>
      </div>
      <label className="modeler-position-snap">
        <input
          type="checkbox"
          checked={position.snapEnabled}
          onChange={(event) => position.onSnapChange(event.target.checked)}
          data-modeler-snap=""
        />
        <span>Ajustar arrastre a rejilla ({position.snapStepMm} mm)</span>
      </label>
      <p className="modeler-hint" data-modeler-drag-hint="">
        {position.draggable
          ? position.snapEnabled
            ? `Arrastra el objeto sobre el suelo (snap ${position.snapStepMm} mm); Escape cancela.`
            : 'Arrastra el objeto sobre el suelo (posiciones exactas); Escape cancela.'
          : 'Generando geometría: el arrastre se habilita al completarse.'}
      </p>
      {position.errorMessage !== null && (
        <p className="modeler-error" data-modeler-position-error="">
          {position.errorMessage}
        </p>
      )}
    </div>
  );
}

export function ModelerShell(props: ModelerShellProps): ReactNode {
  const {
    document,
    engineStatus,
    view,
    onViewChange,
    onFit,
    tool,
    onToolChange,
    history,
    onUndo,
    onRedo,
    onInsertWardrobe,
    pendingSketch,
    objects,
    selection,
    wardrobe,
    position,
    designs,
    mode,
    onModeChange,
    onHome,
    saveState,
    startHint,
    cardActions,
    children,
  } = props;

  return (
    <div className="modeler-root" data-modeler="" data-mode={mode}>
      <header className="modeler-topbar">
        <div className="modeler-brand">
          <span className="modeler-brand-name">FurniConfig Modeler</span>
          <span
            className="modeler-badge modeler-badge--units"
            data-modeler-units=""
          >
            mm
          </span>
        </div>
        <p className="modeler-doc-state" data-modeler-doc-state="">
          {mode === 'simple'
            ? `${document.name} · ${document.objectCount} ${
                document.objectCount === 1 ? 'objeto' : 'objetos'
              }`
            : `Escena libre · ${document.objectCount} objetos · rejilla ${document.gridStepMm} mm`}
        </p>
        <div
          className="modeler-history"
          role="group"
          aria-label="Historial de operaciones"
          data-modeler-history=""
        >
          <button
            type="button"
            onClick={onUndo}
            disabled={!history.canUndo}
            aria-label={
              history.undoLabel !== null
                ? `Deshacer: ${history.undoLabel}`
                : 'Deshacer'
            }
            title={
              history.undoLabel !== null
                ? `Deshacer: ${history.undoLabel} (Ctrl+Z)`
                : 'Deshacer (Ctrl+Z)'
            }
            data-modeler-undo=""
          >
            Deshacer
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!history.canRedo}
            aria-label={
              history.redoLabel !== null
                ? `Rehacer: ${history.redoLabel}`
                : 'Rehacer'
            }
            title={
              history.redoLabel !== null
                ? `Rehacer: ${history.redoLabel} (Ctrl+Mayús+Z)`
                : 'Rehacer (Ctrl+Mayús+Z)'
            }
            data-modeler-redo=""
          >
            Rehacer
          </button>
          <p
            className="modeler-history-status"
            role="status"
            aria-live="polite"
            data-modeler-history-status=""
          >
            {history.message ?? ''}
          </p>
        </div>
        {/* WAVE-02 BLOQUE 3 — chip global de guardado: visible desde la
            barra en AMBOS modos y desde la primera modificación. */}
        <span
          className="modeler-save-chip"
          data-modeler-save-chip=""
          data-save-state={saveState}
          role="status"
          title={SAVE_STATE_TITLES[saveState]}
        >
          {SAVE_STATE_LABELS[saveState]}
        </span>
        <div className="modeler-topbar-right">
          {/* WAVE-02 BLOQUE 4 — interruptor de modo (cambio SOLO de
              presentación: documento, selección e historial intactos). */}
          <label className="modeler-mode" data-modeler-mode-switch="">
            <input
              type="checkbox"
              checked={mode === 'advanced'}
              onChange={(event) =>
                onModeChange(event.target.checked ? 'advanced' : 'simple')
              }
              data-modeler-mode=""
            />
            <span>Modo avanzado</span>
          </label>
          <button
            type="button"
            className="modeler-home"
            onClick={onHome}
            data-modeler-home=""
            title="Volver a la pantalla de inicio"
          >
            Inicio
          </button>
          {/* La jerga del motor SOLO en modo avanzado (BLOQUE 4). */}
          {mode === 'advanced' && (
            <span
              className="modeler-engine"
              data-modeler-engine=""
              data-status={engineStatus}
              role="status"
            >
              Motor geométrico: {ENGINE_STATUS_LABELS[engineStatus]}
            </span>
          )}
          <a
            className="modeler-back"
            href="#/"
            data-modeler-back=""
            aria-label="Volver al configurador de clósets"
          >
            Volver al configurador
          </a>
        </div>
      </header>

      <div className="modeler-body">
        <aside className="modeler-sidebar" aria-label="Panel del modelador">
          <section aria-labelledby="modeler-view-heading">
            <h2 id="modeler-view-heading">Vista</h2>
            <div
              className="modeler-view-buttons"
              role="group"
              aria-label="Vistas de cámara"
              data-modeler-view=""
            >
              {(['isometric', 'front', 'side'] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={view === entry}
                  onClick={() => onViewChange(entry)}
                >
                  {VIEW_LABELS[entry]}
                </button>
              ))}
              <button
                type="button"
                className="modeler-fit-button"
                onClick={onFit}
                aria-label="Ajustar la vista a la escena"
                data-modeler-fit=""
              >
                {mode === 'simple' ? 'Encuadrar' : 'Ajustar'}
              </button>
            </div>
          </section>

          <section aria-labelledby="modeler-tools-heading" data-modeler-tools="">
            <h2 id="modeler-tools-heading">Herramientas</h2>
            <div className="modeler-view-buttons">
              {(['select', 'rectangle'] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={tool === entry}
                  onClick={() => onToolChange(entry)}
                  data-modeler-tool={entry}
                >
                  {TOOL_LABELS[entry]}
                </button>
              ))}
            </div>
            <p className="modeler-hint">{TOOL_HINTS[tool]}</p>
          </section>

          {/* WAVE-01 BLOQUE 3 — diseños locales (guardado en el
              navegador con namespace propio; los diálogos prompt /
              confirm vive en la pantalla, patrón de DesignSection). */}
          {designs !== null && (
            <section
              aria-labelledby="modeler-designs-heading"
              data-modeler-designs=""
            >
              <h2 id="modeler-designs-heading">Diseños</h2>
              <label className="modeler-field">
                <span>Diseño guardado</span>
                <select
                  data-modeler-design-select=""
                  value={designs.focusId ?? designs.activeId ?? ''}
                  onChange={(event) => {
                    if (event.target.value !== '') {
                      designs.onFocusChange(event.target.value);
                    }
                  }}
                >
                  <option value="">
                    {designs.activeId === null
                      ? '— escena sin diseño —'
                      : '— elegir diseño —'}
                  </option>
                  {designs.designs.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.corrupted
                        ? `${entry.id} (dañado, no legible)`
                        : entry.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="modeler-view-buttons">
                <button
                  type="button"
                  onClick={designs.onNew}
                  data-modeler-design-new=""
                >
                  Nuevo
                </button>
                <button
                  type="button"
                  onClick={designs.onSave}
                  data-modeler-design-save=""
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={designs.onSaveAs}
                  data-modeler-design-save-as=""
                >
                  Guardar como
                </button>
                <button
                  type="button"
                  onClick={designs.onRename}
                  data-modeler-design-rename=""
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  onClick={designs.onDuplicate}
                  data-modeler-design-duplicate=""
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  onClick={designs.onDelete}
                  data-modeler-design-delete=""
                >
                  Eliminar
                </button>
              </div>
              {designs.dirty && (
                <p className="modeler-hint" data-modeler-design-dirty="">
                  Cambios sin guardar
                </p>
              )}
              {designs.message !== null && (
                <p
                  className="modeler-hint"
                  data-modeler-design-message=""
                  aria-live="polite"
                >
                  {designs.message}
                </p>
              )}
              {designs.error !== null && (
                <p className="modeler-error" data-modeler-design-error="">
                  {designs.error}
                </p>
              )}
              {!designs.storageAvailable && (
                <p className="modeler-hint" data-modeler-design-nostorage="">
                  Almacenamiento local no disponible: el guardado de diseños
                  está inactivo en este navegador.
                </p>
              )}
              <p className="modeler-hint">
                Guardado local en tu navegador (namespace propio del
                modelador, separado del configurador). Al abrir un diseño se
                regenera su geometría y se limpia el historial.
              </p>
            </section>
          )}

          <section aria-labelledby="modeler-insert-heading" data-modeler-insert="">
            <h2 id="modeler-insert-heading">Añadir</h2>
            <div className="modeler-view-buttons">
              <button
                type="button"
                onClick={onInsertWardrobe}
                data-modeler-insert-wardrobe=""
              >
                Insertar clóset
              </button>
            </div>
            <p className="modeler-hint">
              Clóset paramétrico listo para editar; se inserta seleccionado y
              se deshace/rehace como cualquier otro cambio.
            </p>
          </section>

          {pendingSketch !== null && (
            <section
              aria-labelledby="modeler-pending-heading"
              data-modeler-pending=""
            >
              <h2 id="modeler-pending-heading">Croquis sin extruir</h2>
              <Field
                label="Ancho (mm)"
                value={pendingSketch.widthText}
                onChange={pendingSketch.onWidthChange}
                testAttr="pending-width"
              />
              <Field
                label="Profundidad (mm)"
                value={pendingSketch.depthText}
                onChange={pendingSketch.onDepthChange}
                testAttr="pending-depth"
              />
              <Field
                label="Altura (mm)"
                value={pendingSketch.heightText}
                onChange={pendingSketch.onHeightChange}
                testAttr="pending-height"
              />
              <div className="modeler-view-buttons">
                <button
                  type="button"
                  onClick={pendingSketch.onExtrude}
                  data-modeler-extrude=""
                >
                  Extruir
                </button>
                <button type="button" onClick={pendingSketch.onCancel}>
                  Cancelar croquis
                </button>
              </div>
            </section>
          )}

          <section aria-labelledby="modeler-objects-heading" data-modeler-objects="">
            <h2 id="modeler-objects-heading">Objetos</h2>
            {objects.length === 0 ? (
              <p className="modeler-hint">
                Sin objetos todavía. Dibuja un rectángulo o inserta un clóset.
              </p>
            ) : (
              <ul className="modeler-object-list">
                {objects.map((object) => (
                  <li key={object.id}>
                    <button
                      type="button"
                      aria-pressed={object.selected}
                      onClick={object.onSelect}
                      data-modeler-object={object.id}
                      data-object-kind={object.kind}
                    >
                      <span
                        className="modeler-object-kind"
                        data-modeler-object-kind={object.kind}
                      >
                        {object.kind === 'component' ? 'Clóset' : 'Sólido'}
                      </span>
                      <span>{object.name}</span>
                      <span className="modeler-object-dims">{object.dimsText}</span>
                      <span
                        className="modeler-object-status"
                        data-modeler-object-status={object.id}
                      >
                        {STATUS_LABELS[object.status]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* WAVE-02 BLOQUE 2: en modo sencillo esta sección la
              sustituye la TARJETA contextual sobre el visor (los
              campos y handlers son los MISMOS: solo cambia la
              presentación; nada de lógica duplicada). */}
          {mode === 'advanced' && (
            <section aria-labelledby="modeler-props-heading" data-modeler-props="">
              <h2 id="modeler-props-heading">Propiedades</h2>
              {/* WAVE-01: posición en el suelo del objeto seleccionado
                  (común a sólidos y clósets; UN comando por gesto). */}
              {position !== null && <PositionEditor position={position} />}
              {selection === null && wardrobe === null ? (
                <p className="modeler-hint">
                  Selecciona un sólido o un clóset (herramienta Seleccionar) para
                  ver y editar sus propiedades.
                </p>
              ) : selection !== null ? (
                <SolidPropsBody selection={selection} />
              ) : wardrobe !== null ? (
                <WardrobePropsBody wardrobe={wardrobe} />
              ) : null}
            </section>
          )}

          <section aria-labelledby="modeler-doc-heading">
            <h2 id="modeler-doc-heading">Documento</h2>
            <dl className="modeler-doc-details">
              <div>
                <dt>Nombre</dt>
                <dd>{document.name}</dd>
              </div>
              <div>
                <dt>Objetos</dt>
                <dd>{document.objectCount}</dd>
              </div>
              <div>
                <dt>Rejilla (snap)</dt>
                <dd>{document.gridStepMm} mm</dd>
              </div>
            </dl>
          </section>
        </aside>

        <main className="modeler-viewport" data-modeler-viewport="">
          {/* WAVE-02 BLOQUE 0 — pista breve «cómo editarlo» tras crear
              el primer clóset (una línea, se retira sola al editar). */}
          {startHint !== null && (
            <p
              className="modeler-start-hint"
              role="status"
              data-modeler-start-hint=""
            >
              {startHint}
            </p>
          )}
          {children}
          {/* WAVE-02 BLOQUE 2 — tarjeta contextual flotante (modo
              sencillo): los campos reutilizan los MISMOS props de los
              paneles del modo avanzado (SolidPropsBody /
              WardrobePropsBody); aquí se añade solo mover con
              palabras y duplicar. Cada gesto = UNA entrada de
              historial. Sin rotación Y (contrato v1 intacto). */}
          {mode === 'simple' && cardActions !== null && (
            <aside
              className="modeler-card"
              data-modeler-card=""
              aria-label="Editar el objeto seleccionado"
            >
              <span
                className="modeler-card-title"
                data-modeler-card-title=""
              >
                {wardrobe !== null ? 'Tu clóset' : 'Tu objeto'}
              </span>
              {selection !== null && <SolidPropsBody selection={selection} />}
              {wardrobe !== null && <WardrobePropsBody wardrobe={wardrobe} />}
              {position !== null && (
                <div
                  className="modeler-card-move"
                  role="group"
                  aria-label="Mover el objeto"
                >
                  <p
                    className="modeler-card-position"
                    data-modeler-card-position=""
                  >
                    Posición: X {position.xText} mm · Z {position.zText} mm
                  </p>
                  <div className="modeler-card-move-grid">
                    <button
                      type="button"
                      onClick={() => cardActions.onMoveWords('left')}
                      data-modeler-move="left"
                    >
                      ← Izquierda
                    </button>
                    <button
                      type="button"
                      onClick={() => cardActions.onMoveWords('right')}
                      data-modeler-move="right"
                    >
                      → Derecha
                    </button>
                    <button
                      type="button"
                      onClick={() => cardActions.onMoveWords('forward')}
                      data-modeler-move="forward"
                    >
                      ↑ Adelante
                    </button>
                    <button
                      type="button"
                      onClick={() => cardActions.onMoveWords('back')}
                      data-modeler-move="back"
                    >
                      ↓ Atrás
                    </button>
                  </div>
                  {position.errorMessage !== null && (
                    <p
                      className="modeler-error"
                      data-modeler-position-error=""
                    >
                      {position.errorMessage}
                    </p>
                  )}
                </div>
              )}
              {cardActions.duplicateError !== null && (
                <p
                  className="modeler-error"
                  role="alert"
                  data-modeler-duplicate-error=""
                >
                  {cardActions.duplicateError}
                </p>
              )}
              {cardActions.canDuplicate && (
                <div className="modeler-card-actions">
                  <button
                    type="button"
                    className="modeler-card-duplicate"
                    onClick={cardActions.onDuplicate}
                    data-modeler-duplicate=""
                  >
                    Duplicar
                  </button>
                </div>
              )}
            </aside>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * WAVE-02 BLOQUE 2 — cuerpo de propiedades del SÓLIDO seleccionado.
 * Extraído del panel del modo avanzado para reutilizarse SIN
 * duplicar marcado en la tarjeta contextual del modo sencillo (los
 * `data-*` son idénticos: una sola presencia en cada modo).
 */
function SolidPropsBody(props: {
  readonly selection: SelectionPanelProps;
}): ReactNode {
  const { selection } = props;
  return (
    <>
      <p className="modeler-selection-name">{selection.name}</p>
      <CommitField
        label="Nombre"
        value={selection.nameText}
        onCommit={selection.onNameChange}
        testAttr="selection-name"
        numeric={false}
      />
      <CommitField
        label="Ancho (mm)"
        value={selection.widthText}
        onCommit={selection.onWidthChange}
        testAttr="selection-width"
      />
      <CommitField
        label="Profundidad (mm)"
        value={selection.depthText}
        onCommit={selection.onDepthChange}
        testAttr="selection-depth"
      />
      <CommitField
        label="Altura (mm)"
        value={selection.heightText}
        onCommit={selection.onHeightChange}
        testAttr="selection-height"
      />
      <p
        className="modeler-hint"
        data-modeler-selection-status=""
        data-status={selection.status}
      >
        Generación: {STATUS_LABELS[selection.status]}
      </p>
      {selection.errorMessage !== null && (
        <p className="modeler-error" data-modeler-selection-error="">
          {selection.errorMessage}
        </p>
      )}
      <div className="modeler-view-buttons">
        {selection.status === 'error' && (
          <button
            type="button"
            onClick={selection.onRetry}
            data-modeler-retry=""
          >
            Reintentar
          </button>
        )}
        <button
          type="button"
          onClick={selection.onDelete}
          data-modeler-delete=""
        >
          Eliminar
        </button>
      </div>
    </>
  );
}

/**
 * WAVE-02 BLOQUE 2 — cuerpo de propiedades del CLÓSET seleccionado
 * (nombre, dimensiones, módulos, puertas, estructura, estado y
 * errores). Igual que el sólido: compartido entre el panel
 * avanzado y la tarjeta sencilla.
 */
function WardrobePropsBody(props: {
  readonly wardrobe: WardrobePanelProps;
}): ReactNode {
  const { wardrobe } = props;
  return (
    <>
      <p className="modeler-selection-name">{wardrobe.name}</p>
      <CommitField
        label="Nombre"
        value={wardrobe.nameText}
        onCommit={wardrobe.onNameChange}
        testAttr="wardrobe-name"
        numeric={false}
      />
      {wardrobe.params !== null && (
        <>
          <CommitField
            label="Ancho (mm)"
            value={wardrobe.params.widthText}
            onCommit={wardrobe.params.onWidthChange}
            testAttr="wardrobe-width"
          />
          <CommitField
            label="Alto (mm)"
            value={wardrobe.params.heightText}
            onCommit={wardrobe.params.onHeightChange}
            testAttr="wardrobe-height"
          />
          <CommitField
            label="Profundidad (mm)"
            value={wardrobe.params.depthText}
            onCommit={wardrobe.params.onDepthChange}
            testAttr="wardrobe-depth"
          />

          <h3 className="modeler-subheading">Módulos</h3>
          <label className="modeler-field">
            <span>Número de módulos</span>
            <select
              value={wardrobe.params.moduleCount}
              onChange={(event) =>
                wardrobe.params?.onModuleCountChange(Number(event.target.value))
              }
              data-modeler-module-count=""
            >
              {[1, 2, 3, 4].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <ul className="modeler-module-list">
            {wardrobe.params.modules.map((moduleRow) => (
              <li key={moduleRow.index}>
                <label className="modeler-field">
                  <span>{`Módulo ${moduleRow.index + 1}`}</span>
                  <select
                    value={moduleRow.kind}
                    onChange={(event) =>
                      moduleRow.onKindChange(
                        event.target.value as WardrobeModuleKind,
                      )
                    }
                    data-modeler-module-kind={moduleRow.index}
                  >
                    {WARDROBE_MODULE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {MODULE_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </label>
                {moduleRow.kind === 'shelves' &&
                  moduleRow.shelvesText !== null && (
                    <CommitField
                      label="Entrepaños"
                      value={moduleRow.shelvesText}
                      onCommit={moduleRow.onShelvesChange}
                      testAttr={`module-shelves-${moduleRow.index}`}
                    />
                  )}
                {moduleRow.kind === 'drawers' &&
                  moduleRow.drawersText !== null && (
                    <CommitField
                      label="Cajones"
                      value={moduleRow.drawersText}
                      onCommit={moduleRow.onDrawersChange}
                      testAttr={`module-drawers-${moduleRow.index}`}
                    />
                  )}
              </li>
            ))}
          </ul>

          <h3 className="modeler-subheading">Puertas</h3>
          <label className="modeler-check">
            <input
              type="checkbox"
              checked={wardrobe.params.doorsEnabled}
              onChange={(event) =>
                wardrobe.params?.onDoorsEnabledChange(event.target.checked)
              }
              data-modeler-doors-enabled=""
            />
            <span>Con puertas</span>
          </label>
          {wardrobe.params.doorsEnabled && (
            <>
              <label className="modeler-field">
                <span>Hojas por módulo</span>
                <select
                  value={wardrobe.params.doorLeaves}
                  onChange={(event) =>
                    wardrobe.params?.onDoorLeavesChange(
                      Number(event.target.value) as 1 | 2,
                    )
                  }
                  data-modeler-door-leaves=""
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </label>
              <label className="modeler-field">
                <span>Bisagra (hoja única)</span>
                <select
                  value={wardrobe.params.doorHinge}
                  onChange={(event) =>
                    wardrobe.params?.onDoorHingeChange(
                      event.target.value as 'left' | 'right',
                    )
                  }
                  data-modeler-door-hinge=""
                >
                  <option value="left">Izquierda</option>
                  <option value="right">Derecha</option>
                </select>
              </label>
            </>
          )}

          <h3 className="modeler-subheading">Estructura</h3>
          <label className="modeler-check">
            <input
              type="checkbox"
              checked={wardrobe.params.backPanelEnabled}
              onChange={(event) =>
                wardrobe.params?.onBackPanelEnabledChange(event.target.checked)
              }
              data-modeler-back-panel=""
            />
            <span>Panel trasero</span>
          </label>
        </>
      )}
      <p
        className="modeler-hint"
        data-modeler-selection-status=""
        data-status={wardrobe.status}
      >
        Generación: {STATUS_LABELS[wardrobe.status]}
      </p>
      {wardrobe.errorMessage !== null && (
        <p className="modeler-error" data-modeler-selection-error="">
          {wardrobe.errorMessage}
        </p>
      )}
      {wardrobe.editError !== null && (
        <p className="modeler-error" data-modeler-wardrobe-edit-error="">
          {wardrobe.editError}
        </p>
      )}
      <div className="modeler-view-buttons">
        {wardrobe.status === 'error' && (
          <button
            type="button"
            onClick={wardrobe.onRetry}
            data-modeler-retry=""
          >
            Reintentar
          </button>
        )}
        <button type="button" onClick={wardrobe.onDelete} data-modeler-delete="">
          Eliminar
        </button>
      </div>
    </>
  );
}
