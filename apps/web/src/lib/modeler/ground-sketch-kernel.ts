/**
 * FASE-4C-B — adaptador de orientación "croquis en planta".
 *
 * El kernel (`ManifoldGeometryKernel.fromSketch`) extruye un
 * polígono 2D en SU plano: (u, v) con extrusión hacia +w. El
 * modelo del producto (regla 1: X ancho, Y alto, Z profundidad;
 * origen abajo-izquierda-frontal) exige que el croquis del
 * modelador viva en PLANTA (u→X, v→Z) y que la extrusión sea la
 * ALTURA del sólido (+Y). La imagen correcta es el
 * intercambio y↔z del resultado:
 *
 *     kernel (u, v, w)  →  escena (x=u, y=w, z=v)
 *
 * El intercambio es impropio (determinante −1): invierte la
 * orientación de la malla, por lo que SE REVIERTE el winding
 * de cada triángulo (índices [1]↔[2]) para conservar normales
 * hacia fuera y materials de doble cara correctos.
 *
 * Ámbito honesto (4C-B): solo los refs creados por `fromSketch`
 * se transforman; `box`/CSG quedan en coordenadas del kernel y
 * esta adaptación debe REVISARSE cuando el modelador use esas
 * operaciones (fases de booleanos). El resto del flujo
 * (`dispose`, `disposeAll`, cancelación) se delega tal cual.
 *
 * kernel-adapter NO se modifica: la adaptación vive en la capa
 * de aplicación (regla de fronteras del proyecto).
 */

import type {
  Aabb,
  AsyncGeometryKernel,
  KernelRef,
  MmPoint3,
  MeshData,
} from '@furniconfig/kernel-adapter';

/** Intercambia los ejes Y y Z de un punto (mm). */
function swapYZ(point: MmPoint3): MmPoint3 {
  return [point[0], point[2], point[1]];
}

/**
 * Kernel con cancelación lógica opcional (mismo duck-typing que
 * usa `SceneGeometryService`: `cancel` no forma parte de
 * `AsyncGeometryKernel` pero sí del contrato operativo).
 */
export type GroundSketchKernel = AsyncGeometryKernel & {
  cancel?: (cancelKey: string) => number;
};

/** Intercambia Y/Z de un AABB (siempre sobre copias nuevas). */
function swapYZBounds(bounds: Aabb): Aabb {
  return { min: swapYZ(bounds.min), max: swapYZ(bounds.max) };
}

/**
 * Transforma una malla del kernel a coordenadas de escena:
 * posiciones (u,v,w)→(u,w,v) e inversión del winding.
 *
 * **Pura**: devuelve copias nuevas de `positions`/`indices` y
 * nunca muta los buffers de entrada (el `MeshData` puede llegar
 * por transferencia de buffers y otro consumidor podría retener
 * las referencias). Solo se permutan componentes/índices: no hay
 * aritmética, redondeos ni pérdida de precisión.
 */
export function meshToSceneAxes(mesh: MeshData): MeshData {
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const v = positions[i + 1] ?? 0;
    positions[i + 1] = positions[i + 2] ?? 0;
    positions[i + 2] = v;
  }
  const indices = new Uint32Array(mesh.indices);
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const b = indices[i + 1] ?? 0;
    indices[i + 1] = indices[i + 2] ?? 0;
    indices[i + 2] = b;
  }
  return { positions, indices, bounds: swapYZBounds(mesh.bounds) };
}

/**
 * Envuelve un kernel asíncrono para orientar el flujo
 * `fromSketch` → `toMesh`/`measure` según el modelo de escena.
 */
export function createGroundSketchKernel(
  kernel: AsyncGeometryKernel,
): GroundSketchKernel {
  /** Refs creados por `fromSketch` (sus resultados se orientan). */
  const groundRefs = new Set<KernelRef>();

  const wrapped: GroundSketchKernel = {
    name: `${kernel.name}+planta`,
    ready: kernel.ready,

    box: (sizeMm, options) => kernel.box(sizeMm, options),
    union: (a, b, options) => kernel.union(a, b, options),
    difference: (a, b, options) => kernel.difference(a, b, options),
    intersect: (a, b, options) => kernel.intersect(a, b, options),
    translate: (ref, deltaMm, options) => kernel.translate(ref, deltaMm, options),
    rotateZ: (ref, degrees, options) => kernel.rotateZ(ref, degrees, options),
    scale: (ref, factors, options) => kernel.scale(ref, factors, options),

    async fromSketch(pointsMm, extrusionMm, options) {
      const ref = await kernel.fromSketch(pointsMm, extrusionMm, options);
      groundRefs.add(ref);
      return ref;
    },

    async measure(ref, options) {
      const result = await kernel.measure(ref, options);
      if (!groundRefs.has(ref)) return result;
      return {
        volumeMm3: result.volumeMm3,
        boundsMm: swapYZBounds(result.boundsMm),
      };
    },

    async toMesh(ref, options) {
      const mesh = await kernel.toMesh(ref, options);
      if (!groundRefs.has(ref)) return mesh;
      return meshToSceneAxes(mesh);
    },

    async dispose(ref) {
      groundRefs.delete(ref);
      await kernel.dispose(ref);
    },

    async disposeAll() {
      groundRefs.clear();
      await kernel.disposeAll();
    },
  };

  // Cancelación lógica opcional (forma parte del contrato del
  // servicio de regeneración, aunque no de la interfaz TS).
  const underlying = kernel as typeof wrapped;
  if (typeof underlying.cancel === 'function') {
    wrapped.cancel = (cancelKey) => underlying.cancel?.(cancelKey) ?? 0;
  }
  return wrapped;
}
