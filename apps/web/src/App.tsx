import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  WARDROBE_CONFIG_SCHEMA_VERSION,
  type ConfigIssue,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import { ConfigPanel } from './components/ConfigPanel.js';
import { SummaryPanel } from './components/SummaryPanel.js';
import { ValidationErrorList } from './components/ValidationErrorList.js';
import { DEFAULT_CONFIG, resetConfig } from './lib/config.js';
import { deriveGeometryState } from './lib/derive.js';

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

export function App({ initialConfig = DEFAULT_CONFIG }: AppProps) {
  const [config, setConfig] = useState<WardrobeConfig>(initialConfig);

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

  const update = useCallback(
    (updater: (current: WardrobeConfig) => WardrobeConfig) => {
      setConfig((previous) => updater(previous));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setConfig(resetConfig());
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>FurniConfig</h1>
          <p>Visualizador de clósets modulares · Fase 2C</p>
        </div>
        <span className="chip">Contrato v{WARDROBE_CONFIG_SCHEMA_VERSION}</span>
      </header>

      <main className="layout">
        <aside className="sidebar" aria-label="Configuración">
          <ConfigPanel config={config} onUpdate={update} onReset={handleReset} />
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
              <WardrobeViewer geometry={derived.geometry} />
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

        <aside className="summary" aria-label="Resumen geométrico">
          {derived.geometry ? (
            <SummaryPanel geometry={derived.geometry} />
          ) : null}
          {!derived.validation.ok ? (
            <ValidationErrorList issues={derived.validation.errors} />
          ) : null}
          {geometryIssues.length > 0 ? (
            <ValidationErrorList issues={geometryIssues} />
          ) : null}
        </aside>
      </main>

      <footer className="app-footer">
        Unidad interna: milímetros · Motor @furniconfig/geometry-core · Las
        cotas provisionales deben validarse con carpintería
      </footer>
    </div>
  );
}
