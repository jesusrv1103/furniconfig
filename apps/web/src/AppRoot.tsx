import { lazy, Suspense, useSyncExternalStore } from 'react';

import { App } from './App.js';
import { resolveAppRoute } from './lib/modeler/routing.js';

/**
 * FASE-4C-A — selector de ruta por hash.
 *
 * - Configurador (`''`, `#/…`): se monta `App` de forma
 *   EAGER, idéntico a antes (sin cambios en su experiencia
 *   ni en su bundle).
 * - Modelador (`#/modeler`): se monta `ModelerApp` de forma
 *   DIFERIDA (`React.lazy`), igual que `WardrobeViewer` lo es
 *   para el configurador: Three.js y el modelador no
 *   incrementan el bundle de entrada.
 *
 * `App.tsx` no se modifica: esta capa vive solo en `main.tsx`.
 * Refresh, atrás y adelante funcionan porque el snapshot se
 * lee de `location.hash` y `hashchange` notifica los cambios
 * (la petición HTTP nunca cambia: no hace falta servidor).
 */

const ModelerApp = lazy(async () => {
  const module = await import('./components/modeler/ModelerApp.js');
  return { default: module.ModelerApp };
});

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

function getSnapshot(): string {
  return window.location.hash;
}

/** Render en servidor/pruebas node: por defecto, el configurador. */
function getServerSnapshot(): string {
  return '';
}

export function AppRoot() {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (resolveAppRoute(hash) === 'modeler') {
    return (
      <Suspense
        fallback={
          <div className="route-loading" role="status">
            Cargando el modelador…
          </div>
        }
      >
        <ModelerApp />
      </Suspense>
    );
  }

  return <App />;
}
