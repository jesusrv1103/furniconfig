/**
 * FASE-4C-A — resolución de ruta por hash (sin react-router).
 *
 * La aplicación vive en un único `index.html` sin cambios de
 * servidor: la ruta se lee de `location.hash`.
 *
 * - `''` / `'#/'` → configurador de clósets (experiencia actual,
 *   intacta y sin reestructurar `App`).
 * - `#/modeler` → pantalla experimental del modelador 3D.
 *
 * Función pura: el mismo hash produce siempre la misma ruta,
 * sin acceder al entorno (testeable en node y en navegador).
 */

/** Hash canónico del modelador. */
export const MODELER_ROUTE_HASH = '#/modeler';

/** Rutas de la aplicación. */
export type AppRoute = 'configurator' | 'modeler';

/**
 * Resuelve la ruta activa a partir del `location.hash`.
 *
 * `#/modeler` y sus subrutas futuras (`#/modeler/…`) abren el
 * modelador; cualquier otra cosa (incluido hash vacío) mantiene
 * el configurador. La comparación es exacta y sensible a
 * mayúsculas: `#/Modeler` NO es una ruta reconocida.
 */
export function resolveAppRoute(hash: string): AppRoute {
  const normalized = hash.trim();
  if (
    normalized === MODELER_ROUTE_HASH ||
    normalized.startsWith(`${MODELER_ROUTE_HASH}/`)
  ) {
    return 'modeler';
  }
  return 'configurator';
}
