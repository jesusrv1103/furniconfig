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
  /**
   * Ancho interior útil por módulo (Fase 3D).
   *
   * El mínimo se aplica a cualquier módulo resuelto. El
   * máximo es PROVISIONAL (colapso/deflexión de tableros
   * anchos; validar con carpintería) y se aplica SOLO a
   * los anchos declarados explícitamente en la
   * configuración: así los diseños antiguos (sin
   * `widthMm`, con distribución uniforme del motor)
   * siguen siendo válidos aunque el reparto les asigne
   * un ancho mayor.
   */
  moduleWidthMm: { min: 300, max: 2000 },
  shelfCount: { min: 1, max: 8 },
  drawerCount: { min: 1, max: 8 },
  doors: {
    /** Hojas por módulo (PROVISIONAL). */
    leaves: { min: 1, max: 2 },
    /**
     * Holgura PROVISIONAL (mm) entre hojas
     * y bordes del módulo.
     */
    clearanceMm: { min: 0, max: 10 },
    /** Ángulo máximo de apertura (grados, PROVISIONAL). */
    openAngleDeg: { min: 0, max: 110 },
    /** Diámetro del tirador (mm, PROVISIONAL). */
    handleDiameterMm: 18,
    /**
     * Longitud del tirador: ratio PROVISIONAL
     * del ancho de hoja, acotada entre mínimo
     * y máximo (mm).
     */
    handleLengthRatio: 0.4,
    handleMinLengthMm: 40,
    handleMaxLengthMm: 120,
    /**
     * Distancia PROVISIONAL (mm) del tirador
     * al borde libre de la hoja.
     */
    handleStandoffMm: 30,
  },
  drawerClearanceMm: {
    /**
     * Holgura PROVISIONAL (mm) que queda arriba de
     * cada cajón (frente y caja) respecto al cajón
     * o tablero superior siguiente.
     */
    vertical: 3,
    /**
     * Holgura PROVISIONAL (mm) a cada lado del frente
     * del cajón, respecto de los laterales del módulo.
     */
    lateral: 3,
  },
  hangingRod: {
    diameterMm: { min: 18, max: 60 },
    /**
     * Distancia PROVISIONAL (mm) entre la cara inferior del
     * tablero superior y el centro de la barra de colgado.
     */
    mountDistanceMm: 100,
  },
} as const;
