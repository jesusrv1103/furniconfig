/**
 * Plantillas de distribución iniciales (Fase 3D).
 *
 * Catálogo LOCAL y pequeño de distribuciones prediseñadas:
 * cada plantilla aporta dimensiones y módulos (el
 * "esqueleto" del clóset) construidos sobre los contratos
 * existentes del motor. No hay backend ni catálogo remoto.
 *
 * Al aplicar una plantilla se reemplazan dimensiones y
 * módulos del diseño vigente; se CONSERVAN los materiales
 * y las opciones globales (puertas, barra, panel trasero)
 * del usuario. La aplicación es una sola edición: se puede
 * deshacer. Todas las plantillas producen configuraciones
 * válidas (garantizado por tests).
 */

import type {
  ModuleConfig,
  WardrobeConfig,
} from '@furniconfig/geometry-core';

export interface LayoutTemplate {
  /** Id estable (sin UUID), usado como `data-template-id`. */
  id: string;
  /** Nombre en lenguaje de usuario. */
  name: string;
  /** Explicación breve para personas sin conocimientos técnicos. */
  description: string;
  dimensions: WardrobeConfig['dimensions'];
  modules: readonly ModuleConfig[];
}

/**
 * Catálogo inicial (PROVISIONAL: cotas por defecto del
 * motor; validar con carpintería antes de fabricar).
 *
 * - `basico`: dos módulos — repisas y un espacio para colgar.
 * - `colgar`: dos espacios para colgar y repisas.
 * - `cajonera`: cajonera, colgado y repisas.
 * - `mixto`: cuatro módulos con un ancho fijado (900 mm a
 *   las repisas) para aprovechar espacio a medida; el
 *   resto reparte el espacio restante automáticamente.
 */
export const LAYOUT_TEMPLATES: readonly LayoutTemplate[] = [
  {
    id: 'basico',
    name: 'Clóset básico',
    description: 'Repisas para plegar ropa y un espacio para colgar.',
    dimensions: { widthMm: 1800, heightMm: 2200, depthMm: 600 },
    modules: [
      { kind: 'shelves', shelves: 4 },
      { kind: 'hanging' },
    ],
  },
  {
    id: 'colgar',
    name: 'Con espacio para colgar',
    description: 'Dos zonas para colgar camisas y pantalones, más repisas.',
    dimensions: { widthMm: 2200, heightMm: 2200, depthMm: 600 },
    modules: [
      { kind: 'hanging' },
      { kind: 'hanging' },
      { kind: 'shelves', shelves: 4 },
    ],
  },
  {
    id: 'cajonera',
    name: 'Con cajonera',
    description: 'Cajones para ropa doblada, colgado y repisas.',
    dimensions: { widthMm: 2000, heightMm: 2200, depthMm: 600 },
    modules: [
      { kind: 'drawers', drawers: 4 },
      { kind: 'hanging' },
      { kind: 'shelves', shelves: 4 },
    ],
  },
  {
    id: 'mixto',
    name: 'Mixto de cuatro módulos',
    description:
      'Cuatro módulos: repisas más anchas (900 mm) y el resto reparte el espacio sobrante.',
    dimensions: { widthMm: 2600, heightMm: 2200, depthMm: 600 },
    modules: [
      { kind: 'shelves', shelves: 5, widthMm: 900 },
      { kind: 'hanging' },
      { kind: 'drawers', drawers: 4 },
      { kind: 'hanging' },
    ],
  },
];

/**
 * Aplica una plantilla al diseño vigente: reemplaza
 * dimensiones y módulos; conserva materiales y opciones
 * globales del usuario. Devuelve una nueva configuración
 * (no muta la entrada).
 */
export function applyLayoutTemplate(
  config: WardrobeConfig,
  template: LayoutTemplate,
): WardrobeConfig {
  return {
    ...config,
    dimensions: { ...template.dimensions },
    modules: template.modules.map((module) => ({ ...module })),
  };
}
