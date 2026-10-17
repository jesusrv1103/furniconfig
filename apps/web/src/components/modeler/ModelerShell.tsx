/**
 * FASE-4C-A — chrome/carcasa del modelador (marcado puro).
 *
 * Presentación SIN Three.js ni efectos: se renderiza con
 * `renderToString` en las pruebas unitarias. Contiene:
 *
 * - barra superior con identidad "FurniConfig Modeler" (fondo
 *   oscuro: diferencia clara con el configurador claro);
 * - badge de unidades (mm) y estado del documento (inmutable);
 * - estado del motor geométrico (honesto: `idle` = "en
 *   reposo", sin cálculos);
 * - enlace de vuelta al configurador (`href="#/"`);
 * - panel lateral con la sección FUNCIONAL "Vista" (4C-A) y
 *   secciones-reserva claramente marcadas como futuras — sin
 *   botones inactivos que fingan estar implementados.
 */

import type { CameraView } from '../../lib/camera-views.js';
import type { GeometryKernelStatus } from '../../lib/modeler/geometry-runtime.js';

/** Etiquetas honestas del estado del motor geométrico. */
const ENGINE_STATUS_LABELS: Readonly<Record<GeometryKernelStatus, string>> = {
  idle: 'en reposo (sin cálculos)',
  initializing: 'iniciando…',
  ready: 'listo',
  restarting: 'reiniciando…',
  error: 'error',
};

const VIEWS: ReadonlyArray<{ view: CameraView; label: string }> = [
  { view: 'isometric', label: 'Isométrica' },
  { view: 'front', label: 'Frontal' },
  { view: 'side', label: 'Lateral' },
];

/** Resumen del documento (derivado del `SceneDocument`). */
export interface ModelerDocumentInfo {
  readonly name: string;
  readonly objectCount: number;
  readonly gridStepMm: number;
}

export interface ModelerShellProps {
  readonly document: ModelerDocumentInfo;
  readonly engineStatus: GeometryKernelStatus;
  readonly view: CameraView;
  readonly onViewChange: (view: CameraView) => void;
  readonly onFit: () => void;
  /** Área de dibujo 3D (el `Canvas` de R3F). */
  readonly children: React.ReactNode;
}

export function ModelerShell({
  document,
  engineStatus,
  view,
  onViewChange,
  onFit,
  children,
}: ModelerShellProps) {
  return (
    <div className="modeler-root" data-modeler="">
      <header className="modeler-topbar">
        <div className="modeler-brand">
          <span className="modeler-brand-name">FurniConfig Modeler</span>
          <span
            className="modeler-badge modeler-badge--units"
            aria-label="Las unidades del modelador son milímetros"
            title="Unidades en milímetros"
          >
            mm
          </span>
        </div>

        <p className="modeler-doc-state" data-modeler-doc-state="">
          <strong>{document.name}</strong>
          <span aria-hidden="true"> · </span>
          {document.objectCount} objetos
          <span aria-hidden="true"> · </span>
          paso de rejilla {document.gridStepMm} mm
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
              {VIEWS.map((entry) => (
                <button
                  key={entry.view}
                  type="button"
                  aria-pressed={view === entry.view}
                  onClick={() => onViewChange(entry.view)}
                >
                  {entry.label}
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
            <p className="modeler-hint">
              Arrastra para orbitar · rueda para acercar · clic derecho para
              desplazar.
            </p>
          </section>

          <section aria-labelledby="modeler-tools-heading">
            <h2 id="modeler-tools-heading">Herramientas</h2>
            <p
              className="modeler-placeholder"
              data-modeler-tools-placeholder=""
            >
              Dibujo de rectángulos, extrusión y edición de sólidos llegarán
              en la fase siguiente. Todavía no hay herramientas activas.
            </p>
          </section>

          <section aria-labelledby="modeler-props-heading">
            <h2 id="modeler-props-heading">Propiedades</h2>
            <p
              className="modeler-placeholder"
              data-modeler-props-placeholder=""
            >
              Aún no hay objetos en la escena. Al crearlos, aquí aparecerán
              sus medidas exactas en milímetros.
            </p>
          </section>

          <section aria-labelledby="modeler-doc-heading">
            <h2 id="modeler-doc-heading">Documento</h2>
            <dl className="modeler-doc-details">
              <div>
                <dt>Formato</dt>
                <dd>furniconfig-scene v1</dd>
              </div>
              <div>
                <dt>Unidades</dt>
                <dd>Milímetros (mm)</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>Sin guardar (sin cambios todavía)</dd>
              </div>
            </dl>
          </section>
        </aside>

        <main
          className="modeler-viewport"
          aria-label="Área de modelado 3D"
          data-modeler-viewport=""
        >
          {children}
        </main>
      </div>
    </div>
  );
}
