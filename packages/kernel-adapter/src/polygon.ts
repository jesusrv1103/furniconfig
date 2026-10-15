/**
 * Validación de croquis (FASE-4B-0) — funciones puras, sin dependencias.
 *
 * Regla 3 de `AGENTS.md`: **validar antes de calcular**. El kernel Manifold
 * tolera polígonos degenerados o auto-intersectados "reparándolos" con su
 * propia regla de relleno, lo que produce un sólido cuyo volumen no
 * corresponde a la intención del usuario (medido: un *bowtie* con área
 * shoelace 0 mm² devuelve un sólido de 40 000 mm² de base). Para no ocultar
 * esa desviación, el adaptador rechaza la entrada con un código estable.
 *
 * Coordenadas en **mm enteros**: los productos de las pruebas de orientación
 * caben con exactitud en `double` (|Δ| ≤ 2·10⁵ mm → Δ·Δ ≤ 4·10¹⁰ < 2⁵³),
 * por lo que la decisión es determinista y sin tolerancias arbitrarias.
 */
import { KernelError, type MmPoint2 } from './kernel.js';

type Vec = MmPoint2;

/** Área firmada (fórmula del zapatero) × 2, en mm². Exacta para mm enteros. */
export function signedDoubleAreaMm2(points: readonly Vec[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice;
}

/** -1, 0 o 1 según el lado de la recta (p → q) en el que queda r. */
function orientation(p: Vec, q: Vec, r: Vec): -1 | 0 | 1 {
  const value = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

/** ¿Está q sobre el segmento colineal p–r? (extremos incluidos) */
function onSegment(p: Vec, q: Vec, r: Vec): boolean {
  return (
    q[0] <= Math.max(p[0], r[0]) &&
    q[0] >= Math.min(p[0], r[0]) &&
    q[1] <= Math.max(p[1], r[1]) &&
    q[1] >= Math.min(p[1], r[1])
  );
}

/** ¿Se cortan (o se tocan) los segmentos p1–q1 y p2–q2, colineales o no? */
function segmentsIntersect(p1: Vec, q1: Vec, p2: Vec, q2: Vec): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;
  // casos colineales: el cruce es un punto (incluidos los extremos)
  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  return false;
}

/**
 * Valida que `points` sea un croquis cerrado utilizable: ≥3 vértices,
 * **sin auto-intersecciones** entre aristas no adyacentes y área distinta
 * de cero.
 *
 * El orden importa: la detección de auto-intersecciones va antes del área,
 * porque el área shoelace de un polígono auto-intersectado **no es
 * significativa** (p. ej. un bowtie clásico da exactamente 0 mm² y se
 * confundiría con un polígono degenerado).
 *
 * @throws KernelError `invalid-input` con mensaje estable.
 */
export function assertSimplePolygon(points: readonly Vec[]): void {
  if (points.length < 3) {
    throw new KernelError('invalid-input', `El croquis necesita al menos 3 vértices (recibidos: ${points.length})`);
  }
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      const a1 = points[i];
      const a2 = points[(i + 1) % n];
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (!a1 || !a2 || !b1 || !b2) continue;
      // Prefiltrado por caja envolvente: si las AABB no se solapan (usando <
      // estricto, de modo que un contacto por esquina sigue comprobándose),
      // los segmentos no pueden ni tocarse. Para polígonos dispersos (p. ej.
      // un peine de cientos de dientes) evita casi todos los cruces
      // innecesarios y deja el coste prácticamente en O(n).
      const aMinX = Math.min(a1[0], a2[0]);
      const aMaxX = Math.max(a1[0], a2[0]);
      const bMinX = Math.min(b1[0], b2[0]);
      const bMaxX = Math.max(b1[0], b2[0]);
      const aMinY = Math.min(a1[1], a2[1]);
      const aMaxY = Math.max(a1[1], a2[1]);
      const bMinY = Math.min(b1[1], b2[1]);
      const bMaxY = Math.max(b1[1], b2[1]);
      if (aMaxX < bMinX || bMaxX < aMinX || aMaxY < bMinY || bMaxY < aMinY) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) {
        throw new KernelError('invalid-input', `El croquis se auto-intersecta (aristas ${i} y ${j})`);
      }
    }
  }
  if (signedDoubleAreaMm2(points) === 0) {
    throw new KernelError('invalid-input', 'El croquis tiene área nula (polígono degenerado)');
  }
}
