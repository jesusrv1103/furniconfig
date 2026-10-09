const DESIGN_ID_PATTERN = /^design-(\d+)$/;

/**
 * Genera el siguiente identificador determinista de diseño a partir de
 * los existentes (`design-1`, `design-2`, …).
 *
 * - No reutiliza números aún disponibles en la colección: el máximo se
 *   calcula sobre todos los ids existentes, numéricos o no.
 * - Un id importado ajeno al patrón no participa en el cálculo, pero la
 *   comprobación final de colisión evita cualquier repetición.
 */
export function nextDesignId(existingIds: readonly string[]): string {
  let max = 0;
  const known = new Set(existingIds);
  for (const id of existingIds) {
    const match = DESIGN_ID_PATTERN.exec(id);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > max) {
        max = value;
      }
    }
  }
  let candidate = max + 1;
  while (known.has(`design-${candidate}`)) {
    candidate += 1;
  }
  return `design-${candidate}`;
}
