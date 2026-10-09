import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  MAX_DOOR_OPEN_ANGLE_DEG,
  type GeometryResult,
} from '@furniconfig/geometry-core';
import { mmToM } from '../lib/units.js';
import { WardrobeScene } from './WardrobeScene.js';

/**
 * Lienzo 3D del visualizador.
 *
 * Recibe el GeometryResult ya calculado por el motor y lo renderiza
 * en metros. La cámara se posiciona de forma determinista según el
 * tamaño del clóset; la interacción es con OrbitControls (Drei).
 *
 * El ángulo de apertura de puertas es estado de presentación
 * (no de configuración): se aplica como rotación pura sobre la
 * geometría cerrada del motor.
 */
export function WardrobeViewer({ geometry }: { geometry: GeometryResult }) {
  const { widthMm, heightMm, depthMm } = geometry.wardrobe;
  const hasDoors = geometry.doors.length > 0;

  const [doorOpenAngleDeg, setDoorOpenAngleDeg] = useState(0);

  const camera = useMemo(() => {
    const widthM = mmToM(widthMm);
    const heightM = mmToM(heightMm);
    const depthM = mmToM(depthMm);
    const radius = Math.max(widthM, heightM, depthM) * 1.15 + 1.2;
    return {
      position: [
        radius * 0.85,
        radius * 0.6,
        radius * 1.05,
      ] as [number, number, number],
    };
  }, [widthMm, heightMm, depthMm]);

  return (
    <div className="viewer-container">
      <Canvas
        shadows
        camera={{ position: camera.position, fov: 45, near: 0.05, far: 200 }}
      >
        <WardrobeScene
          geometry={geometry}
          doorOpenAngleDeg={doorOpenAngleDeg}
        />
      </Canvas>
      {hasDoors && (
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
