/**
 * Fixtures de pruebas del núcleo (FASE-4B-A).
 *
 * Constructores puros de documentos de ejemplo; todos producen entradas que
 * `validateSceneDocument` acepta salvo que se indique lo contrario.
 */

import type {
  ComponentInstance,
  SceneDocument,
  SceneMaterial,
  SceneObject,
  Sketch2D,
  SolidObject,
} from '../src/types/document.js';
import type { ComponentRegistry } from '../src/types/component.js';

/** Material base: 'material-1'. */
export const baseMaterial: SceneMaterial = {
  id: 'material-1',
  name: 'Melamina roble',
  finish: 'mate',
  thicknessMm: 18,
};

/** Rectángulo 1200 × 600 mm en el plano ground, cerrado y simple. */
export const rectSketch: Sketch2D = {
  plane: 'ground',
  planeOriginMm: [0, 0, 0],
  pointsMm: [
    [0, 0],
    [1200, 0],
    [1200, 600],
    [0, 600],
  ],
  closed: true,
};

/** Sólido base: rectángulo extruido 18 mm en el origen. */
export const baseSolid: SolidObject = {
  id: 'object-1',
  kind: 'solid',
  name: 'Placa',
  transform: { positionMm: [0, 0, 0] },
  geometry: { source: 'sketch', sketch: rectSketch, extrusionMm: 18 },
  materialId: 'material-1',
};

/**
 * Componente tipo caja con parámetros escalares declarados; modela el
 * registro mínimo que la validación necesita (la definición completa con
 * `build()` llega en 4B-D).
 */
export const boxComponentRegistry: ComponentRegistry = {
  'furniconfig.box': {
    version: 1,
    paramsSchema: {
      widthMm: { kind: 'number', min: 100, max: 4000 },
      label: { kind: 'string' },
      lid: { kind: 'boolean' },
    },
  },
};

/** Instancia de componente válida contra `boxComponentRegistry`. */
export const baseComponent: ComponentInstance = {
  id: 'component-1',
  kind: 'component',
  name: 'Caja',
  type: 'furniconfig.box',
  version: 1,
  transform: { positionMm: [10, 0, 0] },
  materialId: 'material-1',
  params: { widthMm: 600, label: 'Caja alta', lid: true },
};

/** Documento vacío válido (en forma literal, editable por los tests). */
export function emptyDocumentInput(): Record<string, unknown> {
  return {
    documentVersion: 1,
    id: 'scene-1',
    name: 'Dormitorio',
    gridStepMm: 10,
    originMm: [0, 0, 0],
    objects: [],
    materials: [],
  };
}

/** Documento con un material y un sólido: caso nominal completo. */
export function solidDocumentInput(): Record<string, unknown> {
  return {
    ...emptyDocumentInput(),
    materials: [{ ...baseMaterial }],
    objects: [{ ...baseSolid }],
  };
}

/** Documento con un componente registrado y parámetros válidos. */
export function componentDocumentInput(): Record<string, unknown> {
  return {
    ...emptyDocumentInput(),
    materials: [{ ...baseMaterial }],
    objects: [{ ...baseComponent }],
  };
}

/** Tipa un documento ya validado para los tests (sin `any`). */
export function asDocument(value: unknown): SceneDocument {
  return value as SceneDocument;
}

/** Objeto sólido clonado con parche superficial (para casos inválidos). */
export function patchObject<T extends SceneObject>(
  object: T,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...object, ...patch };
}
