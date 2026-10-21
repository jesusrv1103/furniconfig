/**
 * WAVE-02 — modos de presentación del modelador.
 *
 * El modo es ESTADO DE PRESENTACIÓN, nunca de documento: cambiar de
 * modo no crea otro documento, no pierde selección, no reinicia el
 * historial, no duplica geometrías ni cambia parámetros (regla del
 * mandato WAVE-02 BLOQUE 4). Es un flag que decide qué secciones
 * renderiza `ModelerShell` y qué adornos técnicos pinta
 * `ModelerScene`; los stores, comandos y el motor son los mismos.
 */

/** Modo de presentación del editor. */
export type ModelerMode = 'simple' | 'advanced';

/** Etiquetas del interruptor (lenguaje de usuario). */
export const MODE_LABELS: Readonly<Record<ModelerMode, string>> = {
  simple: 'Sencillo',
  advanced: 'Avanzado',
};

/**
 * Normaliza un valor desconocido (p. ej. de storage) a un modo
 * válido: cualquier entrada inesperada cae en `simple` (la
 * experiencia por defecto de WAVE-02).
 */
export function parseModelerMode(value: unknown): ModelerMode {
  return value === 'advanced' ? 'advanced' : 'simple';
}
