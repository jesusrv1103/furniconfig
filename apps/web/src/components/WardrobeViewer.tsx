import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type { GeometryResult } from '@furniconfig/geometry-core';
import { mmToM } from '../lib/units.js';
import { WardrobeScene } from './WardrobeScene.js';

/**
 * Lienzo 3D del visualizador.
 *
 * Recibe el GeometryResult ya calculado por el motor y lo renderiza
 * en metros. La cámara se posiciona de forma determinista según el
 * tamaño del clóset; la interacción es con OrbitControls (Drei).
 */
export function WardrobeViewer({ geometry }: { geometry: GeometryResult }) {
  const { widthMm, heightMm, depthMm } = geometry.wardrobe;

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
    <Canvas
      shadows
      camera={{ position: camera.position, fov: 45, near: 0.05, far: 200 }}
    >
      <WardrobeScene geometry={geometry} />
    </Canvas>
  );
}
