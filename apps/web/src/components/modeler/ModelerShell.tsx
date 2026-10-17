/**
 * FASE-4C-A/B — chrome/carcasa del modelador (marcado puro).
 *
 * Presentación SIN Three.js ni efectos: se renderiza con
 * `renderToString` en las pruebas unitarias. Contiene:
 *
 * - barra superior con identidad "FurniConfig Modeler" (fondo
 *   oscuro: diferencia clara con el configurador claro);
 * - badge de unidades (mm), estado del documento y estado del
 *   motor geométrico (honesto: `idle` = "en reposo");
 * - enlace de vuelta al configurador (`href="#/"`);
 * - panel lateral FUNCIONAL (4C-B): herramientas Seleccionar y
 *   Rectángulo con `aria-pressed` (todos los botones actúan;
 *   no hay botones inactivos fingiendo estar implementados),
 *   panel del croquis pendiente (ancho/profundidad/altura +
 *   Extruir), lista de objetos con su estado de generación y
 *   panel de propiedades de la selección (editar cotas,
 *   reintentar fallos del kernel, eliminar).
 */

import type { ReactNode } from 'react';

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
  readonly name: string;
  readonly dimsText: string;
  readonly status: ObjectGenerationStatus;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/** Panel de propiedades del sólido seleccionado. */
export interface SelectionPanelProps {
  readonly name: string;
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
  readonly pendingSketch: PendingSketchPanelProps | null;
  readonly objects: readonly ObjectRowProps[];
  readonly selection: SelectionPanelProps | null;
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

export function ModelerShell(props: ModelerShellProps): ReactNode {
  const {
    document,
    engineStatus,
    view,
    onViewChange,
    onFit,
    tool,
    onToolChange,
    pendingSketch,
    objects,
    selection,
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
                Sin objetos todavía. Dibuja un rectángulo y extrúyelo.
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
                    >
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
            {selection === null ? (
              <p className="modeler-hint">
                Selecciona un sólido (herramienta Seleccionar) para ver y editar
                sus cotas.
              </p>
            ) : (
              <>
                <p className="modeler-selection-name">{selection.name}</p>
                <Field
                  label="Ancho (mm)"
                  value={selection.widthText}
                  onChange={selection.onWidthChange}
                  testAttr="selection-width"
                />
                <Field
                  label="Profundidad (mm)"
                  value={selection.depthText}
                  onChange={selection.onDepthChange}
                  testAttr="selection-depth"
                />
                <Field
                  label="Altura (mm)"
                  value={selection.heightText}
                  onChange={selection.onHeightChange}
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
            )}
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
