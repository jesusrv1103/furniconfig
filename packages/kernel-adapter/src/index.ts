/**
 * `@furniconfig/kernel-adapter` — EXPERIMENTAL (FASE-4B-0).
 *
 * Adaptador mínimo `GeometryKernel` sobre `manifold-3d` para la prueba de
 * viabilidad. No está integrado en el visor principal de clósets ni aprobado
 * como dependencia definitiva de producción (ADR-001, estado de candidato).
 */
export {
  type Aabb,
  type GeometryKernel,
  type KernelErrorCode,
  type KernelRef,
  type MmPoint2,
  type MmPoint3,
  type MeasureResult,
  type MeshData,
  KernelError,
} from './kernel.js';
export { ManifoldKernel } from './manifold-kernel.js';
export { assertSimplePolygon, signedDoubleAreaMm2 } from './polygon.js';
