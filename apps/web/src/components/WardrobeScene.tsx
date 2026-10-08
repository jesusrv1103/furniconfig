import { useEffect, useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
} from 'three';
import type { GeometryResult, RodAxis } from '@furniconfig/geometry-core';
import { toRenderMaterial, toRenderRodMaterial } from '../lib/materials.js';
import {
  toRenderablePanels,
  toRenderableRods,
} from '../lib/panels-to-mesh.js';
import { mmToM } from '../lib/units.js';

/**
 * Escena 3D del clóset.
 *
 * - Cada Panel del motor se renderiza como un Box; cada
 *   barra de colgado (HangingRod) como un Cylinder.
 * - Las posiciones y el sistema de coordenadas son los
 *   del motor (origen en esquina inferior-frontal-
 *   izquierda), convertidos a metros en esta capa.
 * - Geometrías y materiales de Three.js se reutilizan
 *   (BoxGeometry por tamaño único, CylinderGeometry
 *   por eje+longitud+diámetro, MeshStandardMaterial
 *   por materialId) y se liberan (dispose) al cambiar
 *   o desmontar.
 * - No se inventa geometría: solo existen los paneles
 *   y barras que genera el motor.
 */

/**
 * CylinderGeometry se alinea al eje Y por defecto;
 * esta función devuelve la rotación que orienta la
 * barra según su eje.
 */
function rotationForAxis(axis: RodAxis): [number, number, number] {
  switch (axis) {
    case 'x':
      return [0, 0, -Math.PI / 2];
    case 'y':
      return [0, 0, 0];
    case 'z':
      return [Math.PI / 2, 0, 0];
  }
}

function cylinderKey(
  axis: RodAxis,
  lengthM: number,
  diameterM: number,
): string {
  return `${axis}|${lengthM}|${diameterM}`;
}

export function WardrobeScene({ geometry }: { geometry: GeometryResult }) {
  const { widthMm, heightMm, depthMm, materials } = geometry.wardrobe;
  const widthM = mmToM(widthMm);
  const heightM = mmToM(heightMm);
  const depthM = mmToM(depthMm);

  const panels = useMemo(() => toRenderablePanels(geometry.panels), [geometry]);
  const rods = useMemo(() => toRenderableRods(geometry.rods), [geometry]);

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

  // Geometrías compartidas: un CylinderGeometry por
  // combinación única de eje, longitud y diámetro.
  const cylinderGeometries = useMemo(() => {
    const cache = new Map<string, CylinderGeometry>();
    for (const rod of rods) {
      const key = cylinderKey(rod.axis, rod.lengthM, rod.diameterM);
      if (!cache.has(key)) {
        cache.set(
          key,
          new CylinderGeometry(
            rod.diameterM / 2,
            rod.diameterM / 2,
            rod.lengthM,
            24,
          ),
        );
      }
    }
    return cache;
  }, [rods]);

  // Materiales compartidos: un MeshStandardMaterial por
  // materialId (tableros y, si existe, barra metálica).
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
    if (materials.rod) {
      const renderRodMaterial = toRenderRodMaterial(materials.rod);
      cache.set(
        materials.rod.id,
        new MeshStandardMaterial({
          color: renderRodMaterial.color,
          roughness: renderRodMaterial.roughness,
          metalness: renderRodMaterial.metalness,
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
      for (const cylinderGeometry of cylinderGeometries.values()) {
        cylinderGeometry.dispose();
      }
      for (const material of threeMaterials.values()) {
        material.dispose();
      }
    };
  }, [boxGeometries, cylinderGeometries, threeMaterials]);

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
        {rods.map((rod) => {
          const cylinderGeometry = cylinderGeometries.get(
            cylinderKey(rod.axis, rod.lengthM, rod.diameterM),
          );
          const material = threeMaterials.get(rod.materialId);
          if (!cylinderGeometry || !material) {
            return null;
          }
          return (
            <mesh
              key={rod.id}
              geometry={cylinderGeometry}
              material={material}
              position={rod.centerM}
              rotation={rotationForAxis(rod.axis)}
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
