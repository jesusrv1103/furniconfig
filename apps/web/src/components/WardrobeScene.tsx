import { useEffect, useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import { BoxGeometry, MeshStandardMaterial } from 'three';
import type { GeometryResult } from '@furniconfig/geometry-core';
import { toRenderMaterial } from '../lib/materials.js';
import { toRenderablePanels } from '../lib/panels-to-mesh.js';
import { mmToM } from '../lib/units.js';

/**
 * Escena 3D del clóset.
 *
 * - Cada Panel del motor se renderiza como un Box (geometría y
 *   material de Three.js reutilizados por tamaño y por materialId).
 * - Las posiciones y el sistema de coordenadas son los del motor
 *   (origen en esquina inferior-frontal-izquierda), convertidos a
 *   metros en esta capa.
 * - No se inventa geometría: solo existen los paneles que genera el
 *   motor (sin cajas de cajón ni barras de colgado en Fase 1).
 */
export function WardrobeScene({ geometry }: { geometry: GeometryResult }) {
  const { widthMm, heightMm, depthMm, materials } = geometry.wardrobe;
  const widthM = mmToM(widthMm);
  const heightM = mmToM(heightMm);
  const depthM = mmToM(depthMm);

  const panels = useMemo(() => toRenderablePanels(geometry.panels), [geometry]);

  // Geometrías compartidas: un BoxGeometry por tamaño único de panel.
  const boxGeometries = useMemo(() => {
    const cache = new Map<string, BoxGeometry>();
    for (const panel of panels) {
      const key = panel.sizeM.join('|');
      if (!cache.has(key)) {
        cache.set(
          key,
          new BoxGeometry(panel.sizeM[0], panel.sizeM[1], panel.sizeM[2]),
        );
      }
    }
    return cache;
  }, [panels]);

  // Materiales compartidos: un MeshStandardMaterial por materialId.
  const threeMaterials = useMemo(() => {
    const cache = new Map<string, MeshStandardMaterial>();
    for (const material of [materials.structure, materials.interior]) {
      const renderMaterial = toRenderMaterial(material);
      cache.set(
        material.id,
        new MeshStandardMaterial({
          color: renderMaterial.color,
          roughness: renderMaterial.roughness,
          metalness: renderMaterial.metalness,
        }),
      );
    }
    return cache;
  }, [materials]);

  // Libera recursos de Three.js al cambiar o desmontar.
  useEffect(() => {
    return () => {
      for (const boxGeometry of boxGeometries.values()) {
        boxGeometry.dispose();
      }
      for (const material of threeMaterials.values()) {
        material.dispose();
      }
    };
  }, [boxGeometries, threeMaterials]);

  const gridSize = Math.max(widthM, depthM) * 1.6;

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[widthM * 0.5 + 2.5, heightM + 3, depthM * 0.5 + 2.5]}
        intensity={2.2}
        castShadow
      />
      <group>
        {panels.map((panel) => {
          const boxGeometry = boxGeometries.get(panel.sizeM.join('|'));
          const material = threeMaterials.get(panel.materialId);
          if (!boxGeometry || !material) {
            return null;
          }
          return (
            <mesh
              key={panel.id}
              geometry={boxGeometry}
              material={material}
              position={panel.centerM}
              castShadow
              receiveShadow
            />
          );
        })}
      </group>
      <gridHelper
        args={[
          gridSize,
          Math.max(4, Math.round(gridSize * 2)),
          '#555555',
          '#aaaaaa',
        ]}
        position={[widthM / 2, 0, depthM / 2]}
      />
      <OrbitControls
        target={[widthM / 2, heightM / 2, depthM / 2]}
        enableDamping
      />
    </>
  );
}
