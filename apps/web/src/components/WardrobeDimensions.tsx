import { useMemo, type RefObject } from 'react';
import { Html, Line } from '@react-three/drei';
import { Quaternion, Vector3, type Camera, type Object3D } from 'three';
import type { DimensionSpec } from '../lib/studio/dimensions.js';

/**
 * Cotas visuales sobre el mueble (Fase 3F.1).
 *
 * Renderiza las especificaciones puras de `lib/studio/
 * dimensions.ts`: línea de cota entre dos puntos, líneas de
 * extensión desde el borde medido, flechas en los extremos y
 * etiqueta con el valor.
 *
 * Estilo CAD de presentación:
 * - `depthTest` desactivado: las cotas se ven siempre, en
 *   frontal, lateral e isométrica, sin las oculte el mueble.
 * - Las líneas, flechas y etiquetas NO capturan clics
 *   (`raycast` nulo y `pointer-events: none`): la selección
 *   de módulos por clic sigue intacta.
 * - No modifica la geometría: solo dibuja a partir de ella.
 */

/**
 * Color de las cotas. Neutro a propósito (croma ≤ 25): la
 * suite visual mide la silueta del mueble con una máscara de
 * saturación (chromaticBox), y las cotas no deben contaminar
 * esa medición (se pintan FUERA del mueble, sobre el fondo).
 */
const DIMENSION_COLOR = '#4b5563';
/** Grosor de línea en píxeles (Line2). */
const LINE_WIDTH_PX = 1.5;
/** Radio y longitud de las flechas de extremo (m). */
const ARROW_RADIUS_M = 0.012;
const ARROW_LENGTH_M = 0.035;

interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

function toVector(point: Vec3Tuple): Vector3 {
  return new Vector3(point.x, point.y, point.z);
}

/** Orienta un cono (que apunta a +Y) hacia `direction`. */
function quaternionFor(direction: Vector3): Quaternion {
  return new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction);
}

/** Margen (px) mínimo entre una etiqueta y el borde del lienzo. */
const LABEL_EDGE_MARGIN_X = 46;
const LABEL_EDGE_MARGIN_Y = 16;

/**
 * Posición de proyección normal de la etiqueta con CLAMP
 * al interior del lienzo: si su ancla cae fuera del
 * encuadre (p. ej. la cota de altura en vista frontal, que
 * proyecta más allá del borde derecho), la etiqueta se
 * desplaza hacia dentro en lugar de quedar cortada.
 * `center` de drei Html aplica el centrado encima.
 */
function calculateClampedPosition(
  element: Object3D,
  camera: Camera,
  size: { width: number; height: number },
): [number, number] {
  element.updateWorldMatrix(true, false);
  const world = new Vector3().setFromMatrixPosition(element.matrixWorld);
  const projected = world.project(camera);
  const x = (projected.x * size.width) / 2 + size.width / 2;
  const y = (-projected.y * size.height) / 2 + size.height / 2;
  return [
    Math.min(Math.max(x, LABEL_EDGE_MARGIN_X), size.width - LABEL_EDGE_MARGIN_X),
    Math.min(Math.max(y, LABEL_EDGE_MARGIN_Y), size.height - LABEL_EDGE_MARGIN_Y),
  ];
}

function DimensionArrow({
  at,
  direction,
}: {
  at: Vec3Tuple;
  direction: Vector3;
}) {
  const quaternion = useMemo(
    () => quaternionFor(direction),
    [direction],
  );
  return (
    <mesh
      position={[at.x, at.y, at.z]}
      quaternion={quaternion}
      raycast={() => null}
    >
      <coneGeometry args={[ARROW_RADIUS_M, ARROW_LENGTH_M, 10]} />
      <meshBasicMaterial color={DIMENSION_COLOR} depthTest={false} />
    </mesh>
  );
}

function Dimension({ spec, portal }: { spec: DimensionSpec; portal: RefObject<HTMLElement> }) {
  const { from, to, extensionFrom, labelAt, label } = spec;
  const fromV = toVector(from);
  const toV = toVector(to);
  const lineDirection = useMemo(
    () => toV.clone().sub(fromV).normalize(),
    [fromV, toV],
  );
  const arrowAtFrom = useMemo(
    () => lineDirection.clone().negate(),
    [lineDirection],
  );
  const arrowAtTo = lineDirection;

  return (
    <group>
      {/* Línea de cota principal. */}
      <Line
        points={[
          [from.x, from.y, from.z],
          [to.x, to.y, to.z],
        ]}
        color={DIMENSION_COLOR}
        lineWidth={LINE_WIDTH_PX}
        depthTest={false}
        transparent
        opacity={0.95}
        raycast={() => null}
      />
      {/* Líneas de extensión: del borde medido a la línea. */}
      <Line
        points={[
          [extensionFrom[0].x, extensionFrom[0].y, extensionFrom[0].z],
          [from.x, from.y, from.z],
        ]}
        color={DIMENSION_COLOR}
        lineWidth={1}
        depthTest={false}
        transparent
        opacity={0.7}
        dashed
        dashSize={0.015}
        gapSize={0.01}
        raycast={() => null}
      />
      <Line
        points={[
          [extensionFrom[1].x, extensionFrom[1].y, extensionFrom[1].z],
          [to.x, to.y, to.z],
        ]}
        color={DIMENSION_COLOR}
        lineWidth={1}
        depthTest={false}
        transparent
        opacity={0.7}
        dashed
        dashSize={0.015}
        gapSize={0.01}
        raycast={() => null}
      />
      {/* Flechas en los extremos, apuntando hacia fuera. */}
      <DimensionArrow at={from} direction={arrowAtFrom} />
      <DimensionArrow at={to} direction={arrowAtTo} />
      {/* Etiqueta con el valor (sin capturar clics). */}
      <Html
        position={[labelAt.x, labelAt.y, labelAt.z]}
        center
        portal={portal}
        calculatePosition={calculateClampedPosition}
        zIndexRange={[1, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div className="dimension-label" data-dimension-label={spec.id}>
          {label}
        </div>
      </Html>
    </group>
  );
}

export function WardrobeDimensions({
  specs,
  portal,
}: {
  specs: readonly DimensionSpec[];
  /** Portal DOM estable para las etiquetas (evita el recreate de root de drei Html). */
  portal: RefObject<HTMLElement>;
}) {
  return (
    <group>
      {specs.map((spec) => (
        <Dimension key={spec.id} spec={spec} portal={portal} />
      ))}
    </group>
  );
}
