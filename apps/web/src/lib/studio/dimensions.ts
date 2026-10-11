/**
 * Cotas visuales del visualizador (Fase 3F.1).
 *
 * Capa PURA de presentación: deriva las líneas de cota a
 * partir de la geometría resuelta por el motor, sin tocar
 * ningún valor geométrico ni duplicar reglas de fabricación.
 * Toda la conversión de unidades es de presentación (el
 * motor sigue en milímetros enteros).
 *
 * Sistema de coordenadas del motor (ver `camera-views.ts`):
 * X ancho, Y alto, Z profundidad; origen en la esquina
 * inferior-izquierda-frontal. Las cotas se colocan FUERA
 * de la envolvente del mueble, con líneas de extensión desde
 * el borde medido, y funcionan en las vistas frontal, lateral
 * e isométrica (la escena renderiza con depthTest desactivado,
 * estilo CAD).
 */
import type { GeometryResult, Module } from '@furniconfig/geometry-core';
import { formatMm } from '../units.js';
import { moduleBoundsMm } from './selection.js';

/** Unidades de presentación de las cotas. */
export type MeasureUnit = 'mm' | 'cm';

/** Punto en el espacio de la escena (metros). */
export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

/** Eje principal de una cota (orienta las flechas). */
export type DimensionAxis = 'x' | 'y' | 'z';

/**
 * Especificación renderizable de una cota: línea de medida
 * entre `from` y `to`, líneas de extensión desde los puntos
 * del mueble `extensionFrom[i]` hasta el extremo
 * correspondiente, y etiqueta con el valor ya formateado.
 */
export interface DimensionSpec {
  /** Id estable (React key y selector de pruebas). */
  id: string;
  /** Extremos de la línea de cota (m). */
  from: ScenePoint;
  to: ScenePoint;
  /** Puntos del mueble desde donde salen las extensiones. */
  extensionFrom: [ScenePoint, ScenePoint];
  /** Posición de la etiqueta (m). */
  labelAt: ScenePoint;
  /** Valor ya formateado según la unidad vigente. */
  label: string;
  /** Eje principal de la cota. */
  axis: DimensionAxis;
}

/** Margen entre el mueble y la línea de cota (m). */
const OFFSET_M = 0.06;
/** Margen entre la línea de cota y su etiqueta (m). */
const LABEL_OFFSET_M = 0.035;

function point(x: number, y: number, z: number): ScenePoint {
  return { x, y, z };
}

/**
 * Formatea una medida según la unidad de presentación.
 *
 * - `mm`: entero con separador de miles (formatMm).
 * - `cm`: mm/10 con un decimal si lo hay (776 mm → 77,6 cm;
 *   2400 mm → 240 cm). Nunca redondea el valor interno.
 */
export function formatMeasure(valueMm: number, unit: MeasureUnit): string {
  if (unit === 'mm') {
    return formatMm(valueMm);
  }
  const cm = Math.round((valueMm / 10) * 10) / 10;
  const parts = cm.toString().split('.');
  const integer = parts[0] ?? '';
  const decimals = parts[1];
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals ? `${grouped},${decimals} cm` : `${grouped} cm`;
}

/**
 * Cotas generales del mueble (sin módulo seleccionado):
 * ancho total (abajo), altura total (izquierda) y
 * profundidad total (derecha). Se derivan de las dimensiones
 * EXTERIORES resueltas por el motor, así que no cambian al
 * mostrar u ocultar puertas.
 */
export function computeGlobalDimensions(
  geometry: GeometryResult,
  unit: MeasureUnit,
): DimensionSpec[] {
  const { widthMm, heightMm, depthMm } = geometry.wardrobe;
  const w = widthMm / 1000;
  const h = heightMm / 1000;
  const d = depthMm / 1000;
  const widthLabel = formatMeasure(widthMm, unit);
  const heightLabel = formatMeasure(heightMm, unit);
  const depthLabel = formatMeasure(depthMm, unit);

  return [
    {
      id: 'global-width',
      from: point(0, -OFFSET_M, 0),
      to: point(w, -OFFSET_M, 0),
      extensionFrom: [point(0, 0, 0), point(w, 0, 0)],
      labelAt: point(w / 2, -OFFSET_M - LABEL_OFFSET_M, 0),
      label: widthLabel,
      axis: 'x',
    },
    {
      id: 'global-height',
      from: point(-OFFSET_M, 0, 0),
      to: point(-OFFSET_M, h, 0),
      extensionFrom: [point(0, 0, 0), point(0, h, 0)],
      labelAt: point(-OFFSET_M - LABEL_OFFSET_M, h / 2, 0),
      label: heightLabel,
      axis: 'y',
    },
    {
      id: 'global-depth',
      from: point(w + OFFSET_M, 0, 0),
      to: point(w + OFFSET_M, 0, d),
      extensionFrom: [point(w, 0, 0), point(w, 0, d)],
      labelAt: point(w + OFFSET_M + LABEL_OFFSET_M, 0, d / 2),
      label: depthLabel,
      axis: 'z',
    },
  ];
}

/**
 * Cotas contextuales del módulo seleccionado: ancho y alto
 * de SU APERTURA — el mismo valor que resuelve el motor y
 * muestra el panel de configuración (`module.widthMm` /
 * `module.heightMm`) —, centradas en la huella real de sus
 * piezas. Sustituyen a las cotas generales para no saturar
 * el visor.
 *
 * - Las hojas de puerta quedan EXCLUIDAS de la huella: la
 *   hoja es más ancha que la apertura (monta sobre el
 *   frente) y no debe inflar la cota ni hacerla variar
 *   según existan puertas.
 * - La profundidad no se incluye: es idéntica en todos los
 *   módulos y depende de las puertas, así que no aporta
 *   información contextual.
 */
export function computeModuleDimensions(
  geometry: GeometryResult,
  module: Module,
  unit: MeasureUnit,
): DimensionSpec[] {
  const bounds = moduleBoundsMm(geometry, module.id, {
    includeDoors: false,
  });
  if (bounds === null) {
    return [];
  }
  // La línea de ancho mide la apertura del módulo y se
  // centra en la huella de sus piezas (repisas y barra
  // abarcan la apertura; la caja de cajones va centrada).
  const widthMm = module.widthMm;
  const widthM = widthMm / 1000;
  const minX = bounds.min[0] / 1000;
  const maxX = bounds.max[0] / 1000;
  const centerX = (minX + maxX) / 2;
  const fromX = centerX - widthM / 2;
  const toX = centerX + widthM / 2;
  const heightMm = module.heightMm;
  const heightM = heightMm / 1000;

  return [
    {
      id: 'module-width',
      from: point(fromX, -OFFSET_M, 0),
      to: point(toX, -OFFSET_M, 0),
      extensionFrom: [point(fromX, 0, 0), point(toX, 0, 0)],
      labelAt: point(centerX, -OFFSET_M - LABEL_OFFSET_M, 0),
      label: formatMeasure(widthMm, unit),
      axis: 'x',
    },
    {
      id: 'module-height',
      from: point(fromX - OFFSET_M, 0, 0),
      to: point(fromX - OFFSET_M, heightM, 0),
      extensionFrom: [point(fromX, 0, 0), point(fromX, heightM, 0)],
      labelAt: point(fromX - OFFSET_M - LABEL_OFFSET_M, heightM / 2, 0),
      label: formatMeasure(heightMm, unit),
      axis: 'y',
    },
  ];
}

/**
 * Cotas a mostrar: contextuales con módulo seleccionado,
 * generales en caso contrario. Sin geometría (configuración
 * inválida) no hay cotas.
 */
export function computeDimensionSpecs(
  geometry: GeometryResult | null,
  selectedModuleId: string | null,
  unit: MeasureUnit,
): DimensionSpec[] {
  if (geometry === null) {
    return [];
  }
  if (selectedModuleId !== null) {
    const module = geometry.wardrobe.modules.find(
      (candidate) => candidate.id === selectedModuleId,
    );
    if (module !== undefined) {
      return computeModuleDimensions(geometry, module, unit);
    }
  }
  return computeGlobalDimensions(geometry, unit);
}
