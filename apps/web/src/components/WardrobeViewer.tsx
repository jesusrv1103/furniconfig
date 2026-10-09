import { useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  MAX_DOOR_OPEN_ANGLE_DEG,
  type GeometryResult,
} from '@furniconfig/geometry-core';
import {
  VIEWER_FOV_DEG,
  type CameraView,
  type ViewRequest,
} from '../lib/camera-views.js';
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
 * Lienzo 3D del visualizador.
 *
 * Recibe el GeometryResult ya calculado por el motor y lo renderiza
 * en metros. La interacción es con OrbitControls (Drei).
 *
 * El ángulo de apertura de puertas y la visibilidad de las
 * hojas son estado de presentación (no de configuración):
 * se aplican como rotación pura sobre la geometría cerrada
 * del motor, o bien omitiendo su render, sin tocar
 * `geometry.doors`.
 */
export function WardrobeViewer({ geometry }: { geometry: GeometryResult }) {
  const hasDoors = geometry.doors.length > 0;

  const [doorOpenAngleDeg, setDoorOpenAngleDeg] = useState(0);
  const [doorsVisible, setDoorsVisible] = useState(true);
  const [viewRequest, setViewRequest] = useState<ViewRequest | null>(null);

  const requestView = useCallback((view: CameraView) => {
    setViewRequest((previous) => ({
      view,
      nonce: (previous?.nonce ?? 0) + 1,
    }));
  }, []);

  const showDoors = hasDoors && doorsVisible;

  return (
    <div
      className="viewer-container"
      data-view={viewRequest?.view ?? 'isometric'}
      data-doors-visible={showDoors ? 'true' : 'false'}
    >
      <Canvas shadows="soft" camera={VIEWER_CAMERA}>
        <WardrobeScene
          geometry={geometry}
          doorOpenAngleDeg={doorOpenAngleDeg}
          doorsVisible={showDoors}
          viewRequest={viewRequest}
        />
      </Canvas>

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
