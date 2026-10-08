/**
 * Utilidades de conversión de unidades.
 *
 * El motor trabaja en milímetros enteros; la conversión a metros
 * ocurre EXCLUSIVAMENTE en esta capa de renderizado (ADR-004).
 */

export const MM_PER_M = 1000;

/** Milímetros → metros. */
export function mmToM(millimeters: number): number {
  return millimeters / MM_PER_M;
}

/** Metros → milímetros. */
export function mToMm(meters: number): number {
  return meters * MM_PER_M;
}

const THOUSANDS_SEPARATOR = '.';

/** Formatea milímetros con separador de miles (determinista). */
export function formatMm(value: number): string {
  const rounded = Math.round(value);
  const digits = Math.abs(rounded).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR);
  return `${rounded < 0 ? '-' : ''}${grouped} mm`;
}

/** Formatea un volumen en mm³ como m³ con 3 decimales. */
export function formatCubicMeters(volumeMm3: number): string {
  return `${(volumeMm3 / 1_000_000_000).toFixed(3)} m³`;
}
