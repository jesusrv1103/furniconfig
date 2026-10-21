/**
 * WAVE-02 BLOQUE 4 — modos de presentación (`lib/modeler/modes.ts`).
 * El modo es presentación pura: cualquier entrada hostil de storage
 * cae a `simple` (la experiencia por defecto).
 */

import { describe, expect, it } from 'vitest';

import {
  MODE_LABELS,
  parseModelerMode,
} from '../../src/lib/modeler/modes.js';

describe('parseModelerMode', () => {
  it('«advanced» solo cuando el valor lo es exactamente', () => {
    expect(parseModelerMode('advanced')).toBe('advanced');
    expect(parseModelerMode('simple')).toBe('simple');
    expect(parseModelerMode('AVANZADO')).toBe('simple');
    expect(parseModelerMode(undefined)).toBe('simple');
    expect(parseModelerMode(null)).toBe('simple');
    expect(parseModelerMode(1)).toBe('simple');
    expect(parseModelerMode({})).toBe('simple');
  });

  it('etiquetas de usuario para ambos modos', () => {
    expect(MODE_LABELS.simple).toBe('Sencillo');
    expect(MODE_LABELS.advanced).toBe('Avanzado');
  });
});
