/**
 * Vistas de cámara y encuadre del visualizador.
 *
 * Capa de presentación pura: funciones deterministas en
 * METROS (la conversión mm→m ya ocurrió en units.ts).
 * No toca el motor geométrico ni Three.js — la escena
 * consume estos resultados.
 *
 * Sistema de coordenadas del motor: X ancho, Y alto,
 * Z profundidad; origen en la esquina inferior-izquierda-
 * frontal (frente en z=0; el mueble ocupa z ≥ 0 y las
 * puertas montadas sobre el frente quedan en z < 0).
 */

/** Vistas predefinidas del visualizador. */
export type CameraView = 'isometric' | 'front' | 'side';

/**
 * FOV vertical (°) del visor: única fuente para la
 * cámara (prop de R3F) y para los cálculos de encuadre.
 */
export const VIEWER_FOV_DEG = 45;

/**
 * Solicitud de vista predefinida desde la interfaz.
 * `nonce` incrementa en cada clic para re-aplicar la
 * misma vista aunque el usuario haya rotado después.
 */
export interface ViewRequest {
  view: CameraView;
  nonce: number;
}

/** Caja alineada a ejes (m). */
export interface Aabb {
  min: [number, number, number];
  max: [number, number, number];
}

type Vec3 = [number, number, number];

/**
 * Dirección UNITARIA desde el centro del mueble hacia la
 * cámara para cada vista:
 *
 * - `front`: desde el frente (z < 0) → se ven hojas,
 *   tiradores y frentes de cajón.
 * - `side`: desde +X → perfil lateral.
 * - `isometric`: 3/4 frontal-derecha-arriba (isométrica
 *   clásica: dirección (1, 1, −1)).
 */
export const VIEW_DIRECTIONS: Readonly<
  Record<CameraView, Vec3>
> = {
  isometric: normalize([1, 1, -1]),
  front: [0, 0, -1],
  side: [1, 0, 0],
};

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) {
    return [0, 0, 0];
  }
  return [
    vector[0] / length,
    vector[1] / length,
    vector[2] / length,
  ];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Centro de la caja (m). */
export function boxCenter(box: Aabb): Vec3 {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

/**
 * Distancia mínima (m) desde el centro de la caja para que
 * sus 8 esquinas proyecten dentro del encuadre, con FOV
 * vertical `fovDeg`, aspecto horizontal `aspect` y margen
 * de seguridad `margin` (> 1).
 *
 * Cierre analítico: para cada esquina, la restricción de
 * encuadre es lineal en la distancia d de la cámara:
 *   profundidad = d − dot(v, dir) ≥ requerido
 * ⇒ d ≥ dot(v, dir) + requerido.
 * Se toma el máximo entre todas las esquinas.
 */
export function fitDistance(
  box: Aabb,
  direction: Vec3,
  fovDeg: number,
  aspect: number,
  margin = 1.12,
): number {
  const center = boxCenter(box);
  const dir = normalize(direction);
  const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
  // Base ortonormal de la cámara: el "arriba" del mundo
  // no sirve si la mirada es vertical (vista cenital).
  const forward: Vec3 = [-dir[0], -dir[1], -dir[2]];
  const worldUp: Vec3 =
    Math.abs(dir[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward);

  let distance = 0;
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const v: Vec3 = [x - center[0], y - center[1], z - center[2]];
        // Profundidad de la esquina en el eje de mirada.
        const depthOffset = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
        const screenX = Math.abs(
          v[0] * right[0] + v[1] * right[1] + v[2] * right[2],
        );
        const screenY = Math.abs(
          v[0] * up[0] + v[1] * up[1] + v[2] * up[2],
        );
        // Margen aplicado al hueco visible (no a la
        // profundidad): el encuadre crece con margin.
        const requiredByY = (screenY * margin) / tanHalfFov;
        const requiredByX =
          (screenX * margin) / (tanHalfFov * Math.max(aspect, 0.2));
        const required = Math.max(requiredByY, requiredByX);
        const needed = depthOffset + required;
        if (needed > distance) {
          distance = needed;
        }
      }
    }
  }
  return distance;
}

/**
 * Posición de la cámara para una vista predefinida:
 * `center + direction · fitDistance`.
 */
export function viewPosition(
  center: Vec3,
  direction: Vec3,
  distance: number,
): Vec3 {
  const dir = normalize(direction);
  return [
    center[0] + dir[0] * distance,
    center[1] + dir[1] * distance,
    center[2] + dir[2] * distance,
  ];
}

/**
 * Reencuadre al cambiar las dimensiones del mueble
 * conservando la dirección de vista del usuario:
 *
 * - traslada la cámara con el centro (delta del mueble);
 * - escala la distancia cámara-objetivo por el cociente
 *   de las distancias de encuadre nuevas/antiguas.
 *
 * Pura: no muta `cameraPosition` ni `previousTarget`.
 */
export function reframe(
  cameraPosition: Vec3,
  previousTarget: Vec3,
  nextTarget: Vec3,
  previousFit: number,
  nextFit: number,
): Vec3 {
  const scale = previousFit > 0 ? nextFit / previousFit : 1;
  return [
    nextTarget[0] +
      (cameraPosition[0] - previousTarget[0]) * scale,
    nextTarget[1] +
      (cameraPosition[1] - previousTarget[1]) * scale,
    nextTarget[2] +
      (cameraPosition[2] - previousTarget[2]) * scale,
  ];
}
