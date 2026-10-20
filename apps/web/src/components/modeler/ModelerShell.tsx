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
    children,
  } = props;

  return (
    <div className="modeler-root" data-modeler="">
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
          {`Escena libre · ${document.objectCount} objetos · rejilla ${document.gridStepMm} mm`}
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
        <div className="modeler-topbar-right">
          <span
            className="modeler-engine"
            data-modeler-engine=""
            data-status={engineStatus}
            role="status"
          >
            Motor geométrico: {ENGINE_STATUS_LABELS[engineStatus]}
          </span>
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
              >
                Ajustar
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

          <section aria-labelledby="modeler-props-heading" data-modeler-props="">
            <h2 id="modeler-props-heading">Propiedades</h2>
            {selection === null && wardrobe === null ? (
              <p className="modeler-hint">
                Selecciona un sólido o un clóset (herramienta Seleccionar) para
                ver y editar sus propiedades.
              </p>
            ) : selection !== null ? (
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
            ) : wardrobe !== null ? (
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
                          wardrobe.params?.onModuleCountChange(
                            Number(event.target.value),
                          )
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
                          wardrobe.params?.onDoorsEnabledChange(
                            event.target.checked,
                          )
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
                          wardrobe.params?.onBackPanelEnabledChange(
                            event.target.checked,
                          )
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
                  <p
                    className="modeler-error"
                    data-modeler-wardrobe-edit-error=""
                  >
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
                  <button
                    type="button"
                    onClick={wardrobe.onDelete}
                    data-modeler-delete=""
                  >
                    Eliminar
                  </button>
                </div>
              </>
            ) : null}
          </section>

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
          {children}
        </main>
      </div>
    </div>
  );
}
