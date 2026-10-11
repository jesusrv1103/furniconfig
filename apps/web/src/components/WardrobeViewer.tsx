import { useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';import {
  MAX_DOOR_OPEN_ANGLE_DEG,
  type GeometryResult,
} from '@furniconfig/geometry-core';
import {
  VIEWER_FOV_DEG,
  type CameraView,
  type ViewRequest,
} from '../lib/camera-views.js';
import { computeDimensionSpecs, type MeasureUnit } from '../lib/studio/dimensions.js';
import { WardrobeDimensions } from './WardrobeDimensions.js';
import { WardrobeScene } from './WardrobeScene.js';

/**
 * Prop de cámara ESTABLE (referencia de módulo): R3F lo
 * aplica una sola vez al montar.
 *
 * No incluye `position` a propósito: la posición de la
 * cámara la gestiona CameraRig dentro de la escena
 * (isométrica frontal al montar, vistas predefinidas y
 * reencuadre al cambiar dimensiones), de modo que R3F no
 * la sobrescribe en cada cambio de configuración.
 */
const VIEWER_CAMERA = {
  fov: VIEWER_FOV_DEG,
  near: 0.05,
  far: 200,
} as const;

const VIEW_BUTTONS: readonly { view: CameraView; label: string }[] = [
  { view: 'front', label: 'Frontal' },
  { view: 'side', label: 'Lateral' },
  { view: 'isometric', label: 'Isométrica' },
];

/**
 * Distancia máxima (px) entre pulsación y levantación para
 * que un gesto cuente como CLIC y no como órbita
 * (selección sin conflicto con OrbitControls).
 */
const CLICK_DRIFT_PX = 5;

/**
 * Lienzo 3D del visualizador (Studio, Fase 3C).
 *
 * Recibe el GeometryResult ya calculado por el motor y lo
 * renderiza en metros. Además de la órbita (Drei):
 *
 * - selección de módulos por clic (con umbral anti-drag y
 *   deselección al pulsar el vacío),
 * - encuadre a pantalla completa y encuadre al módulo
 *   seleccionado,
 * - estado de presentación de puertas (visibilidad y
 *   ángulo) sin tocar `geometry.doors`.
 */
export function WardrobeViewer({
  geometry,
  selectedModuleId = null,
  onSelectModule,
}: {
  geometry: GeometryResult;
  /** Id del módulo seleccionado (resaltado en escena). */
  selectedModuleId?: string | null;
  /** Cambia la selección; `null` deselecciona. */
  onSelectModule?: (moduleId: string | null) => void;
}) {
  const hasDoors = geometry.doors.length > 0;

  // Portal estable para las etiquetas de cotas (Fase 3F.1):
  // sin él, drei Html recrea su root cuando events.connected
  // cambia tras el montaje (React 19) y se pierde una etiqueta.
  const dimensionsPortalRef = useRef<HTMLElement | null>(null);

  // Cotas visuales (Fase 3F.1): generales sin selección,
  // contextuales con módulo seleccionado. La conversión de
  // unidades es solo de presentación (el motor sigue en mm).
  const [dimensionsVisible, setDimensionsVisible] = useState(true);
  const [measureUnit, setMeasureUnit] = useState<MeasureUnit>('mm');
  const dimensionSpecs = useMemo(
    () => computeDimensionSpecs(geometry, selectedModuleId, measureUnit),
    [geometry, selectedModuleId, measureUnit],
  );
  const [doorOpenAngleDeg, setDoorOpenAngleDeg] = useState(0);
  const [doorsVisible, setDoorsVisible] = useState(true);
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);

  const requestView = useCallback((view: CameraView) => {
    setViewRequest((previous) => ({
      view,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }, []);

  /** "Ajustar modelo a pantalla": re-aplica la vista actual. */
  const fitToScreen = useCallback(() => {
    setViewRequest((previous) => ({
      view: previous?.view ?? 'isometric',
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }, []);

  const focusModule = useCallback(() => {
    setFocusNonce((nonce) => nonce + 1);
  }, []);

  // Guarda anti-drag: registra la pulsación y descarta como
  // clic los gestos que se movieron (órbita con OrbitControls).
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const clickGuard = useCallback((native: { clientX: number; clientY: number }) => {
    const down = pointerDownRef.current;
    if (down === null) {
      return true;
    }
    return Math.hypot(native.clientX - down.x, native.clientY - down.y) <= CLICK_DRIFT_PX;
  }, []);

  const showDoors = hasDoors && doorsVisible;

  return (
    <div
      className="viewer-container"
      data-view={viewRequest?.view ?? 'isometric'}
      data-doors-visible={showDoors ? 'true' : 'false'}
      data-selected-module={selectedModuleId ?? undefined}
      onPointerDown={(event) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY };
      }}
    >
      <Canvas
        shadows="soft"
        camera={VIEWER_CAMERA}
        onPointerMissed={(event) => {
          if (clickGuard(event) && onSelectModule) {
            onSelectModule(null);
          }
        }}
      >
        <WardrobeScene
          geometry={geometry}
          doorOpenAngleDeg={doorOpenAngleDeg}
          doorsVisible={showDoors}
          viewRequest={viewRequest}
          selectedModuleId={selectedModuleId}
          focusNonce={focusNonce}
          clickGuard={clickGuard}
          onModulePicked={onSelectModule}
        />
        {dimensionsVisible ? (
          <WardrobeDimensions
            specs={dimensionSpecs}
            portal={dimensionsPortalRef as RefObject<HTMLElement>}
          />
        ) : null}
      </Canvas>
      <div
        ref={(element) => {
          dimensionsPortalRef.current = element;
        }}
        className="dimensions-portal"
        aria-hidden="true"
      />

      <div
        className="viewer-toolbar"
        role="toolbar"
        aria-label="Vistas del visualizador"
      >
        {VIEW_BUTTONS.map(({ view, label }) => (
          <button
            key={view}
            type="button"
            className="viewer-view-button"
            aria-pressed={(viewRequest?.view ?? 'isometric') === view}
            onClick={() => requestView(view)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="viewer-view-button"
          onClick={fitToScreen}
          title="Ajustar el mueble a la pantalla"
        >
          Ajustar
        </button>
        <button
          type="button"
          className="viewer-view-button"
          onClick={focusModule}
          disabled={selectedModuleId === null}
          title="Encuadrar la cámara en el módulo seleccionado"
        >
          Encuadrar módulo
        </button>
        {hasDoors && (
          <button
            type="button"
            className="viewer-view-button viewer-doors-toggle"
            aria-pressed={doorsVisible}
            onClick={() => setDoorsVisible((visible) => !visible)}
          >
            Puertas visibles
          </button>
        )}
        <button
          type="button"
          className="viewer-view-button viewer-dimensions-toggle"
          data-action="toggle-dimensions"
          aria-pressed={dimensionsVisible}
          onClick={() => setDimensionsVisible((visible) => !visible)}
          title="Mostrar u ocultar las cotas del mueble"
        >
          Cotas
        </button>
        {dimensionsVisible && (
          <label className="viewer-units">
            <span className="visually-hidden">Unidades de medida</span>
            <select
              value={measureUnit}
              data-unit-select
              onChange={(event) =>
                setMeasureUnit(event.target.value as MeasureUnit)
              }
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
            </select>
          </label>
        )}
      </div>

      {showDoors && (
        <div className="viewer-controls" aria-label="Controles del visualizador">
          <label className="viewer-control">
            <span>Apertura de puertas</span>
            <input
              type="range"
              min={0}
              max={MAX_DOOR_OPEN_ANGLE_DEG}
              step={1}
              value={doorOpenAngleDeg}
              onChange={(event) =>
                setDoorOpenAngleDeg(Number(event.target.value))
              }
            />
            <output>{doorOpenAngleDeg}°</output>
          </label>
        </div>
      )}
    </div>
  );
}
