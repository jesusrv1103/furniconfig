/**
 * Límites operativos centralizados (ADR-009).
 *
 * ⚠️ TODOS LOS VALORES SON PROVISIONALES: son hipótesis de trabajo que deben
 * validarse con carpinterías antes de usarse en cotizaciones o fabricación.
 * Ver docs/product-rules.md §2 y §6.
 */

export const WARDROBE_LIMITS = {
  widthMm: { min: 400, max: 4000 },
  heightMm: { min: 1000, max: 2800 },
  depthMm: { min: 400, max: 700 },
  moduleCount: { min: 1, max: 4 },
  moduleWidthMm: { min: 300 },
  shelfCount: { min: 1, max: 8 },
} as const;
