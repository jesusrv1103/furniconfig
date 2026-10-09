import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ConfigIssue, WardrobeConfig } from '@furniconfig/geometry-core';
import { ConfigPanel } from './components/ConfigPanel.js';
import { DesignSection } from './components/DesignSection.js';
import { SummaryPanel } from './components/SummaryPanel.js';
import { ValidationErrorList } from './components/ValidationErrorList.js';
import { BottomBar } from './components/studio/BottomBar.js';
import { ModulePropertiesPanel } from './components/studio/ModulePropertiesPanel.js';
import { PanelToolbar } from './components/studio/PanelToolbar.js';
import { TopBar, type SaveState } from './components/studio/TopBar.js';
import { DEFAULT_CONFIG, resetConfig } from './lib/config.js';
import { deriveGeometryState } from './lib/derive.js';
import { moduleContext, resolveSelection } from './lib/studio/selection.js';
import { useDesignSession } from './hooks/use-design-session.js';
import { useEditorHistory } from './hooks/use-editor-history.js';

// Carga diferida: Three.js es pesado y no bloquea la UI inicial.
// El módulo usa exports nombrados, así que se adapta al
// formato { default } que espera React.lazy.
const WardrobeViewer = lazy(async () => {
  const module = await import('./components/WardrobeViewer.js');
  return { default: module.WardrobeViewer };
});

interface AppProps {
  /** Configuración inicial; por defecto, la configuración de ejemplo. */
  initialConfig?: WardrobeConfig;
}

/**
 * FurniConfig Studio (Fase 3C).
 *
 * Estado del editor:
 *
 * - `useEditorHistory`: la configuración vigente es el
 *   `present` del historial (deshacer/rehacer acotado).
 *   Las ediciones pasan por `update`; los cambios
 *   externos de proyecto (sesión 3B: hidratación, abrir,
 *   nuevo) por `resetTo`, que reinicia el historial.
 * - Selección: id estable del módulo (`module-N`) que el
 *   motor asigna; se resuelve contra la geometría en cada
 *   recálculo (se conserva si sigue existiendo, se limpia
 *   si desaparece).
 * - La validación y el cálculo siguen siendo exclusivos
 *   del motor (`deriveGeometryState`).
 * - Modo sencillo/avanzado: organiza las herramientas
 *   existentes; no duplica la aplicación ni el motor.
 */
export function App({ initialConfig = DEFAULT_CONFIG }: AppProps) {
  // Historial del editor: `editor.config` es el estado presente.
  const editor = useEditorHistory(initialConfig);
  const { config, update, resetTo } = editor;

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'simple' | 'advanced'>('simple');
  // Paneles abiertos por defecto; en pantallas estrechas
  // (≤760 px, igual que el apilado responsive) arrancan
  // contraídos para que el mueble sea lo primero.
  const defaultPanelOpen = (): boolean =>
    typeof window === 'undefined' ||
    !window.matchMedia('(max-width: 760px)').matches;
  const [leftOpen, setLeftOpen] = useState<boolean>(defaultPanelOpen);
  const [rightOpen, setRightOpen] = useState<boolean>(defaultPanelOpen);

  // Cambios EXTERNOS de proyecto desde la sesión 3B: nuevo
  // historial y selección limpia (nunca se mezclan dos
  // diseños en el historial). Identidad estable: la sesión
  // solo debe rehidratar si cambia esto de verdad.
  const handleSessionConfigChange = useCallback(
    (next: WardrobeConfig) => {
      resetTo(next);
      setSelectedModuleId(null);
    },
    [resetTo],
  );

  // Sesión de diseños: guarda/recupera el borrador y el diseño activo.
  const designSession = useDesignSession({
    config,
    onConfigChange: handleSessionConfigChange,
  });

  // Estado derivado de forma pura: el motor es la fuente
  // única de verdad (validación de forma y cálculo
  // geométrico, con captura explícita de GeometryError).
  const derived = useMemo(() => deriveGeometryState(config), [config]);

  const geometryIssues: readonly ConfigIssue[] =
    derived.geometryError === null
      ? []
      : [
          {
            code: derived.geometryError.code,
            field: 'engine',
            message: derived.geometryError.message,
          },
        ];

  // Selección: se resuelve contra la geometría vigente.
  const selectionId = useMemo(
    () => resolveSelection(derived.geometry, selectedModuleId),
    [derived.geometry, selectedModuleId],
  );
  useEffect(() => {
    // El módulo ya no existe (p. ej. se redujo el conteo): limpia.
    if (selectedModuleId !== null && selectionId === null) {
      setSelectedModuleId(null);
    }
  }, [selectedModuleId, selectionId]);

  const selectedContext = useMemo(
    () => moduleContext(derived.geometry, selectionId),
    [derived.geometry, selectionId],
  );
  const selectedModuleIndex = selectedContext?.index ?? null;

  const selectModuleByIndex = (index: number): void => {
    const resolved = derived.geometry?.wardrobe.modules[index];
    setSelectedModuleId(resolved?.id ?? null);
  };

  const handleReset = useCallback(() => {
    // Un restablecer es una edición más: deshacerable.
    update(() => resetConfig());
  }, [update]);

  const issueCount =
    (derived.validation.ok ? 0 : derived.validation.errors.length) +
    geometryIssues.length;
  const valid = issueCount === 0;

  const saveState: SaveState =
    designSession.state.activeId === null
      ? 'none'
      : designSession.state.dirty
        ? 'dirty'
        : 'clean';

  const handleNewDesign = (): void => {
    if (designSession.state.dirty) {
      const confirmed = window.confirm(
        'Hay cambios sin guardar. ¿Crear un proyecto nuevo y descartarlos?',
      );
      if (!confirmed) {
        return;
      }
    }
    void designSession.actions.newProject();
  };

  const handleOpenProjects = (): void => {
    setLeftOpen(true);
    // Tras el repintado, enfoca la sección de proyectos.
    requestAnimationFrame(() => {
      document
        .querySelector('.design-section')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <div className="app">
      <TopBar
        projectName={designSession.state.activeName ?? 'Proyecto sin título'}
        saveState={saveState}
        canUndo={editor.canUndo}
        canRedo={editor.canRedo}
        onNewDesign={handleNewDesign}
        onSave={() => void designSession.actions.saveNow()}
        onUndo={editor.undo}
        onRedo={editor.redo}
        onOpenProjects={handleOpenProjects}
      />

      <main className="layout studio-layout">
        <aside
          className={`sidebar studio-panel studio-panel-left${leftOpen ? '' : ' is-collapsed'}`}
          aria-label="Configuración"
          data-panel="left"
          data-open={leftOpen ? 'true' : 'false'}
        >
          <PanelToolbar
            bodyId="studio-left-body"
            open={leftOpen}
            onToggle={() => setLeftOpen((open) => !open)}
            side="left"
          >
            <div
              className="mode-toggle"
              role="group"
              aria-label="Modo de edición"
            >
              <button
                type="button"
                aria-pressed={editorMode === 'simple'}
                onClick={() => setEditorMode('simple')}
              >
                Sencillo
              </button>
              <button
                type="button"
                aria-pressed={editorMode === 'advanced'}
                onClick={() => setEditorMode('advanced')}
              >
                Avanzado
              </button>
            </div>
          </PanelToolbar>
          <div id="studio-left-body" className="panel-body" hidden={!leftOpen}>
            <ConfigPanel
              config={config}
              onUpdate={update}
              onReset={handleReset}
              designSection={<DesignSection session={designSession} />}
              selectedModuleIndex={selectedModuleIndex}
              onSelectModule={selectModuleByIndex}
              editorMode={editorMode}
            />
          </div>
        </aside>

        <section className="viewer" aria-label="Visualizador 3D">
          {geometryIssues.length === 0 && derived.geometry ? (
            <Suspense
              fallback={
                <div className="viewer-fallback">
                  Cargando visualizador 3D…
                </div>
              }
            >
              <WardrobeViewer
                geometry={derived.geometry}
                selectedModuleId={selectionId}
                onSelectModule={setSelectedModuleId}
              />
            </Suspense>
          ) : (
            <div className="viewer-invalid" role="alert">
              <h2>Configuración inválida</h2>
              <p>
                Corrige los errores del panel para visualizar el clóset en 3D.
              </p>
            </div>
          )}
        </section>

        <aside
          className={`summary studio-panel studio-panel-right${rightOpen ? '' : ' is-collapsed'}`}
          aria-label="Propiedades y resumen"
          data-panel="right"
          data-open={rightOpen ? 'true' : 'false'}
        >
          <PanelToolbar
            bodyId="studio-right-body"
            open={rightOpen}
            onToggle={() => setRightOpen((open) => !open)}
            side="right"
          />
          <div
            id="studio-right-body"
            className="panel-body"
            hidden={!rightOpen}
          >
            {selectedContext !== null ? (
              <ModulePropertiesPanel
                context={selectedContext}
                config={config}
                mode={editorMode}
                onUpdate={update}
                onDeselect={() => setSelectedModuleId(null)}
              />
            ) : (
              <p className="panel-hint">
                Selecciona un módulo en el modelo o en la lista para ver y
                editar sus propiedades.
              </p>
            )}
            {derived.geometry ? (
              <SummaryPanel geometry={derived.geometry} />
            ) : null}
            {!derived.validation.ok ? (
              <ValidationErrorList issues={derived.validation.errors} />
            ) : null}
            {geometryIssues.length > 0 ? (
              <ValidationErrorList issues={geometryIssues} />
            ) : null}
          </div>
        </aside>
      </main>

      <BottomBar
        widthMm={config.dimensions.widthMm}
        heightMm={config.dimensions.heightMm}
        depthMm={config.dimensions.depthMm}
        moduleCount={config.modules.length}
        valid={valid}
        issueCount={issueCount}
        saveState={saveState}
      />
    </div>
  );
}
