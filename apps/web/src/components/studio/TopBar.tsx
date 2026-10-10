/**
 * Barra superior del Studio (Fase 3C).
 *
 * Acciones principales del proyecto sin saturar la barra:
 * nombre del producto, proyecto activo, nuevo diseño,
 * guardar, deshacer/rehacer, estado de guardado y acceso
 * a la lista de proyectos.
 */

export type SaveState = 'dirty' | 'clean' | 'none';

const SAVE_STATE_LABELS: Readonly<Record<SaveState, string>> = {
  dirty: 'Cambios sin guardar',
  clean: 'Guardado',
  none: 'Sin diseño activo',
};

export interface TopBarProps {
  /** Nombre del diseño activo o null (borrador). */
  projectName: string;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  onNewDesign(): void;
  onSave(): void;
  onUndo(): void;
  onRedo(): void;
  /** Abre/contrae el panel izquierdo y enfoca la sección de proyectos. */
  onOpenProjects(): void;
}

export function TopBar({
  projectName,
  saveState,
  canUndo,
  canRedo,
  onNewDesign,
  onSave,
  onUndo,
  onRedo,
  onOpenProjects,
}: TopBarProps) {
  return (
    <header className="app-header studio-topbar">
      <div className="topbar-brand">
        <h1>FurniConfig Studio</h1>
        <p>Visualizador de clósets modulares · Fase 3E</p>
      </div>

      <div className="topbar-project">
        <span className="topbar-project-label">Proyecto</span>
        <strong className="topbar-project-name" data-project-name={projectName}>
          {projectName}
        </strong>
      </div>

      <div
        className="topbar-actions"
        role="toolbar"
        aria-label="Acciones del proyecto"
      >
        <button type="button" onClick={onNewDesign}>
          Nuevo diseño
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saveState !== 'dirty'}
          title={
            saveState === 'none'
              ? 'Crea o abre un diseño para guardarlo'
              : saveState === 'clean'
                ? 'No hay cambios pendientes'
                : 'Guardar los cambios ahora'
          }
        >
          Guardar
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          Deshacer
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo}>
          Rehacer
        </button>
        <button type="button" onClick={onOpenProjects}>
          Proyectos
        </button>
        <span
          className="studio-save-state"
          role="status"
          data-save-state={saveState}
          data-save-state-text={SAVE_STATE_LABELS[saveState]}
        >
          {SAVE_STATE_LABELS[saveState]}
        </span>
      </div>
    </header>
  );
}
