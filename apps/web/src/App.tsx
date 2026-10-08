import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import {
  WARDROBE_CONFIG_SCHEMA_VERSION,
  GeometryError,
  calculateGeometry,
  validateWardrobeConfig,
  type ConfigIssue,
  type GeometryResult,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import { ConfigPanel } from './components/ConfigPanel.js';
import { SummaryPanel } from './components/SummaryPanel.js';
import { ValidationErrorList } from './components/ValidationErrorList.js';
import { DEFAULT_CONFIG, resetConfig } from './lib/config.js';

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
 * Estado derivado de la configuración.
 *
 * El motor es la fuente única de verdad. Dos causas de estado
 * inválido:
 * 1. La configuración no pasa la validación del contrato.
 * 2. Pasa la validación pero es geométricamente inviable
 *    (p. ej. ancho insuficiente para los módulos): el motor
 *    lanza GeometryError, que capturamos aquí.
 */
interface DerivedState {
  geometry: GeometryResult | null;
  geometryError: GeometryError | null;
}

export function App({ initialConfig = DEFAULT_CONFIG }: AppProps) {
  const [config, setConfig] = useState<WardrobeConfig>(initialConfig);

  // Validación y geometría derivadas: la UI nunca calcula
  // geometría por su cuenta.
  const validation = useMemo(() => validateWardrobeConfig(config), [config]);

  const derived = useMemo<DerivedState>(() => {
    if (!validation.ok) {
      return { geometry: null, geometryError: null };
    }
    try {
      return {
        geometry: calculateGeometry(validation.config),
        geometryError: null,
      };
    } catch (error) {
      if (error instanceof GeometryError) {
        return { geometry: null, geometryError: error };
      }
      // Cualquier otro error es un defecto de programación y
      // debe propagarse, no ocultarse.
      throw error;
    }
  }, [validation]);

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
          <p>Visualizador de clósets modulares · Fase 1</p>
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
          {derived.geometry ? <SummaryPanel geometry={derived.geometry} /> : null}
          {!validation.ok ? (
            <ValidationErrorList issues={validation.errors} />
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
