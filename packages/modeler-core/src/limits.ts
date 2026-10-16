/**
 * Límites del documento de escena (FASE-4B-A).
 *
 * ⚠️ TODOS LOS VALORES SON PROVISIONALES: son hipótesis de trabajo. Los que
 * dependan de carpintería deben validarse antes de usarse en fabricación
 * (regla 4 de `AGENTS.md`; molde: `packages/geometry-core/src/contract/limits.ts`).
 *
 * Estos límites NO inventan reglas de fabricación: son cotas de sanidad del
 * documento (evitan entradas absurdas o con pérdida de exactitud) con la
 * justificación matemática anotada en cada uno.
 */
export const SCENE_LIMITS = {
  /** Paso de rejilla del documento (mm). PROVISIONAL. */
  gridStepMm: { min: 1, max: 1000 },
  /**
   * Extrusión de un croquis (mm). PROVISIONAL: cota de sanidad muy por
   * encima de cualquier mueble real (1 km), no una regla de carpintería.
   */
  extrusionMm: { min: 1, max: 1_000_000 },
  /**
   * Cota máxima para coordenadas de croquis, orígenes y traslaciones (mm).
   * PROVISIONAL. Justificación doble: (a) escenas más allá de 100 m no
   * tienen uso realista para muebles; (b) determinismo del área del croquis:
   * con |coord| ≤ 10⁵ cada término del zapatero es ≤ 2·10¹⁰ y la suma de un
   * croquis de ~4 500 vértices sigue por debajo de 2⁵³ ≈ 9·10¹⁵, de modo que
   * el área firmada se decide **sin pérdida de precisión** en `double`
   * (invariante I1 determinista; misma consideración que el comentario de
   * `polygon.ts` en `kernel-adapter`).
   */
  coordinateMm: { max: 100_000 },
  /**
   * Profundidad máxima de anidamiento de `params` de un componente.
   * Cota de sanidad contra JSON hostil (evita desbordamiento de pila del
   * validador); un `WardrobeConfig` real vive en profundidad 4.
   */
  paramsMaxDepth: 32,
} as const;
