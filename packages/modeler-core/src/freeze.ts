/**
 * Congelado profundo (interno del paquete, FASE-4B-A).
 *
 * Refuerza en runtime la invariante I3 del Scene Document: el documento es
 * inmutable y toda edición produce una nueva instancia. No se exporta desde
 * `index.ts`: es un detalle de implementación del núcleo.
 */

/** Congela `value` y todo su árbol de objetos/arrays. Idempotente. */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    Object.freeze(node);
    // getOwnPropertyNames cubre claves propias de texto; los arrays congelan
    // también su propiedad `length` al congelar el propio array.
    for (const key of Object.getOwnPropertyNames(node)) {
      walk((node as Record<string, unknown>)[key]);
    }
  };
  walk(value);
  return value;
}
