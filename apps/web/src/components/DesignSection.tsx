import { useState, type ChangeEvent } from 'react';
import { describeDesignError } from '../lib/designs/errors.js';
import type { DesignSession } from '../hooks/use-design-session.js';

interface DesignSectionProps {
  session: DesignSession;
}

/** Descarga un JSON como archivo (navegador). */
function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Nombre de archivo legible y seguro a partir del nombre del diseño. */
function toFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'diseno'}.json`;
}

/** Fecha local compacta para la lista. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Sección "Proyectos": gestión explícita del diseño activo y de los
 * cambios sin guardar. El visualizador 3D sigue siendo el elemento
 * principal: esta sección vive al final del panel de configuración.
 */
export function DesignSection({ session }: DesignSectionProps) {
  const { state, actions } = session;
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const visible =
    normalizedQuery === ''
      ? state.designs
      : state.designs.filter((design) =>
          design.name.toLowerCase().includes(normalizedQuery),
        );

  const handleCreate = async (): Promise<void> => {
    if (await actions.createDesign(name)) {
      setName('');
    }
  };

  const handleOpen = async (id: string, designName: string): Promise<void> => {
    if (state.dirty) {
      const confirmed = window.confirm(
        `Hay cambios sin guardar en «${state.activeName ?? 'el diseño activo'}». Al abrir «${designName}» se perderán. ¿Continuar?`,
      );
      if (!confirmed) {
        return;
      }
    }
    await actions.openDesign(id);
  };

  const handleRename = async (
    id: string,
    currentName: string,
  ): Promise<void> => {
    const next = window.prompt(
      `Nuevo nombre para «${currentName}»`,
      currentName,
    );
    if (next === null) {
      return;
    }
    const trimmed = next.trim();
    if (trimmed === '' || trimmed === currentName) {
      return;
    }
    await actions.renameDesign(id, trimmed);
  };

  const handleDelete = async (
    id: string,
    designName: string,
  ): Promise<void> => {
    const confirmed = window.confirm(
      `¿Eliminar el diseño «${designName}»? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) {
      return;
    }
    await actions.deleteDesign(id);
  };

  const handleNewProject = async (): Promise<void> => {
    if (state.dirty) {
      const confirmed = window.confirm(
        'Hay cambios sin guardar. ¿Crear un proyecto nuevo y descartarlos?',
      );
      if (!confirmed) {
        return;
      }
    }
    await actions.newProject();
  };

  const handleExport = async (
    id: string,
    designName: string,
  ): Promise<void> => {
    const json = await actions.exportDesign(id);
    if (json !== null) {
      downloadJson(toFilename(designName), json);
    }
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      await actions.importDesign(text);
    } catch (error) {
      window.alert(describeDesignError(error));
    } finally {
      // Permite volver a importar el mismo archivo.
      input.value = '';
    }
  };

  return (
    <div className="design-section" data-hydrated={state.hydrated ? 'true' : 'false'}>
      <div className="design-active" data-dirty={state.dirty ? 'true' : 'false'}>
        {state.activeId !== null ? (
          <>
            <strong>Diseño activo:</strong> «{state.activeName ?? state.activeId}» ·{' '}
            <span className={state.dirty ? 'design-dirty' : 'design-clean'}>
              {state.dirty ? 'cambios sin guardar' : 'guardado'}
            </span>
          </>
        ) : (
          <span>Sin diseño activo · el borrador se conserva al recargar</span>
        )}
      </div>

      <p
        className="design-status"
        role="status"
        aria-live="polite"
        data-tone={state.status?.tone ?? 'info'}
      >
        {state.status?.text ?? ''}
      </p>

      <div className="design-create">
        <input
          type="text"
          className="design-input"
          aria-label="Nombre del nuevo diseño"
          placeholder="Nombre del diseño"
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={!state.hydrated}
        />
        <button
          type="button"
          className="design-button design-button-primary"
          onClick={() => void handleCreate()}
          disabled={!state.hydrated || name.trim() === ''}
        >
          Crear diseño
        </button>
      </div>

      <div className="design-actions">
        <button
          type="button"
          className="design-button design-button-primary"
          onClick={() => void actions.saveNow()}
          disabled={!state.hydrated || state.activeId === null || !state.dirty}
        >
          Guardar
        </button>
        <button
          type="button"
          className="design-button"
          onClick={() => void handleNewProject()}
          disabled={!state.hydrated}
        >
          Nuevo proyecto
        </button>
      </div>

      <label className="design-field">
        <span>Importar diseño (JSON)</span>
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Importar diseño JSON"
          onChange={(event) => void handleImport(event)}
          disabled={!state.hydrated}
        />
      </label>

      <label className="design-field">
        <span>Buscar diseños</span>
        <input
          type="search"
          className="design-input"
          placeholder="Buscar por nombre"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!state.hydrated}
        />
      </label>

      {state.designs.length === 0 ? (
        <p className="design-empty">
          {state.hydrated
            ? 'No hay diseños guardados todavía.'
            : 'Cargando diseños…'}
        </p>
      ) : (
        <ul className="design-list">
          {visible.map((design) => (
            <li
              key={design.id}
              className="design-item"
              data-design-id={design.id}
            >
              <div className="design-item-name">
                {design.name}
                {design.id === state.activeId ? (
                  <span className="design-badge">activo</span>
                ) : null}
              </div>
              <div className="design-item-date">
                Actualizado: {formatDate(design.updatedAt)}
              </div>
              <div className="design-item-actions">
                <button
                  type="button"
                  className="design-button design-button-small"
                  onClick={() => void handleOpen(design.id, design.name)}
                  disabled={!state.hydrated}
                >
                  Abrir
                </button>
                <button
                  type="button"
                  className="design-button design-button-small"
                  onClick={() => void handleRename(design.id, design.name)}
                  disabled={!state.hydrated}
                >
                  Renombrar
                </button>
                <button
                  type="button"
                  className="design-button design-button-small"
                  onClick={() => void actions.duplicateDesign(design.id)}
                  disabled={!state.hydrated}
                >
                  Duplicar
                </button>
                <button
                  type="button"
                  className="design-button design-button-small"
                  onClick={() => void handleExport(design.id, design.name)}
                  disabled={!state.hydrated}
                >
                  Exportar
                </button>
                <button
                  type="button"
                  className="design-button design-button-small design-button-danger"
                  onClick={() => void handleDelete(design.id, design.name)}
                  disabled={!state.hydrated}
                >
                  Eliminar
                </button>
              </div>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="design-empty">
              Ningún diseño coincide con «{query.trim()}».
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
