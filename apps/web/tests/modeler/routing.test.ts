/**
 * FASE-4C-A §8 — resolución de rutas por hash.
 *
 * Cubre: carga directa de `#/modeler`, ruta por defecto del
 * configurador, y secuencias de navegación (atrás/adelante
 * simulan los hashes que deja cada paso).
 */

import { describe, expect, it } from 'vitest';

import {
  MODELER_ROUTE_HASH,
  resolveAppRoute,
} from '../../src/lib/modeler/routing.js';

describe('resolveAppRoute (navegación por hash)', () => {
  it('por defecto abre el configurador (hash vacío o #/)', () => {
    expect(resolveAppRoute('')).toBe('configurator');
    expect(resolveAppRoute('#')).toBe('configurator');
    expect(resolveAppRoute('#/')).toBe('configurator');
  });

  it('carga directa de #/modeler abre el modelador', () => {
    expect(resolveAppRoute(MODELER_ROUTE_HASH)).toBe('modeler');
    expect(resolveAppRoute('#/modeler')).toBe('modeler');
  });

  it('admite subrutas futuras del modelador', () => {
    expect(resolveAppRoute('#/modeler/')).toBe('modeler');
    expect(resolveAppRoute('#/modeler/escenas/1')).toBe('modeler');
  });

  it('rutas desconocidas caen en el configurador (nunca en blanco)', () => {
    expect(resolveAppRoute('#/otra')).toBe('configurator');
    expect(resolveAppRoute('#/Modeler')).toBe('configurator'); // exacto
    expect(resolveAppRoute('#modeler')).toBe('configurator'); // sin barra
    expect(resolveAppRoute('#/modelerx')).toBe('configurator');
  });

  it('simula refresh, atrás y adelante con hashes consecutivos', () => {
    // entrada directa al modelador
    expect(resolveAppRoute('#/modeler')).toBe('modeler');
    // "atrás" hasta la raíz
    expect(resolveAppRoute('')).toBe('configurator');
    // "adelante" de nuevo
    expect(resolveAppRoute('#/modeler')).toBe('modeler');
    // enlace "Volver al configurador" (#/)
    expect(resolveAppRoute('#/')).toBe('configurator');
  });
});
