import { useEffect, useMemo } from 'react';
import { OrbitControls } from '@react-three/drei';
import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
} from 'three';
import {
  doorOpeningTransform,
  type GeometryResult,
  type Material,
  type RodAxis,
} from '@furniconfig/geometry-core';
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
 * - Cada puerta (Door) se renderiza como un Box hijo de un
 *   group situado en su eje de bisagra: la apertura es
 *   una rotación pura de presentación (`rotation.y` con el
 *   ángulo firmado de `doorOpeningTransform`) que NO altera
 *   los datos geométricos del motor. El tirador (DoorHandle)
 *   es un Cylinder hijo del mismo group: gira con la hoja.
 * - Las posiciones y el sistema de coordenadas son los
 *   del motor (origen en esquina inferior-frontal-
 *   izquierda), convertidos a metros en esta capa.
 * - Geometrías y materiales de Three.js se reutilizan
 *   (BoxGeometry por tamaño único, CylinderGeometry
 *   por eje+longitud+diámetro, MeshStandardMaterial
 *   por materialId) y se liberan (dispose) al cambiar
 *   o desmontar.
 * - No se inventa geometría: solo existen los paneles,
 *   barras, puertas y tiradores que genera el motor.
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

export function WardrobeScene({
  geometry,
  doorOpenAngleDeg = 0,
}: {
  geometry: GeometryResult;
  /**
   * Ángulo de apertura de las puertas (grados,
   * 0–110). Es estado de presentación: el motor
   * genera las hojas cerradas y esta capa aplica
   * la rotación alrededor del eje de bisagra.
   */
  doorOpenAngleDeg?: number;
}) {
  const { widthMm, heightMm, depthMm, materials } = geometry.wardrobe;
  const widthM = mmToM(widthMm);
  const heightM = mmToM(heightMm);
  const depthM = mmToM(depthMm);

  const panels = useMemo(() => toRenderablePanels(geometry.panels), [geometry]);
  const rods = useMemo(() => toRenderableRods(geometry.rods), [geometry]);
  const doors = geometry.doors;
  const handles = geometry.handles;
  // Apertura: transformación pura del motor (eje de
  // bisagra + ángulo firmado) para cada hoja.
  const doorTransforms = useMemo(
    () =>
      doors.map((door) => ({
        door,
        transform: doorOpeningTransform(door, doorOpenAngleDeg),
      })),
    [doors, doorOpenAngleDeg],
  );

  // Geometrías compartidas: un BoxGeometry por tamaño único de panel
  // (tableros y hojas de puerta comparten tamaño).
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
    for (const door of doors) {
      const key = [
        mmToM(door.widthMm),
        mmToM(door.heightMm),
        mmToM(door.thicknessMm),
      ].join('|');
      if (!cache.has(key)) {
        cache.set(
          key,
          new BoxGeometry(
            mmToM(door.widthMm),
            mmToM(door.heightMm),
            mmToM(door.thicknessMm),
          ),
        );
      }
    }
    return cache;
  }, [panels, doors]);

  // Geometrías compartidas: un CylinderGeometry por
  // combinación única de eje, longitud y diámetro
  // (barras de colgado y tiradores).
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
    for (const handle of handles) {
      const lengthM = mmToM(handle.lengthMm);
      const diameterM = mmToM(handle.diameterMm);
      const key = cylinderKey(handle.axis, lengthM, diameterM);
      if (!cache.has(key)) {
        cache.set(
          key,
          new CylinderGeometry(
            diameterM / 2,
            diameterM / 2,
            lengthM,
            24,
          ),
        );
      }
    }
    return cache;
  }, [rods, handles]);

  // Materiales compartidos: un MeshStandardMaterial por
  // materialId (tableros estructurales, entrepaños, hojas
  // de puerta y, si existen, barra metálica, piezas de
  // cajón y tiradores metálicos).
  const threeMaterials = useMemo(() => {
    const cache = new Map<string, MeshStandardMaterial>();
    const boardMaterials: Material[] = [
      materials.structure,
      materials.interior,
    ];
    if (materials.drawer) {
      boardMaterials.push(materials.drawer);
    }
    if (materials.door) {
      boardMaterials.push(materials.door);
    }
    for (const material of boardMaterials) {
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
    const metalMaterials: { id: string; material: Parameters<typeof toRenderRodMaterial>[0] }[] = [];
    if (materials.rod) {
      metalMaterials.push({ id: materials.rod.id, material: materials.rod });
    }
    if (materials.handle) {
      metalMaterials.push({ id: materials.handle.id, material: materials.handle });
    }
    for (const { id, material } of metalMaterials) {
      const renderRodMaterial = toRenderRodMaterial(material);
      cache.set(
        id,
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
        {doorTransforms.map(({ door, transform }) => {
          const doorSizeKey = [
            mmToM(door.widthMm),
            mmToM(door.heightMm),
            mmToM(door.thicknessMm),
          ].join('|');
          const boxGeometry = boxGeometries.get(doorSizeKey);
          const doorMaterial = threeMaterials.get(door.materialId);
          if (!boxGeometry || !doorMaterial) {
            return null;
          }
          const handle = handles.find(
            (candidate) => candidate.doorId === door.id,
          );
          const handleLengthM = mmToM(handle?.lengthMm ?? 0);
          const handleDiameterM = mmToM(handle?.diameterMm ?? 0);
          const handleGeometry =
            handle === undefined
              ? undefined
              : cylinderGeometries.get(
                  cylinderKey(handle.axis, handleLengthM, handleDiameterM),
                );
          const handleMaterial =
            handle === undefined
              ? undefined
              : threeMaterials.get(handle.materialId);
          // Eje de bisagra (mm → m): el group gira
          // alrededor de este eje vertical.
          const hingeXM = mmToM(transform.hingeXmm);
          const hingeZM = mmToM(transform.hingeZmm);
          // Centros de hoja y tirador (posición
          // cerrada) respecto del eje: hijos del
          // group, rotan con la puerta.
          const doorCenterM: [number, number, number] = [
            mmToM(door.positionMm.x + door.widthMm / 2) - hingeXM,
            mmToM(door.positionMm.y + door.heightMm / 2),
            mmToM(door.positionMm.z + door.thicknessMm / 2) - hingeZM,
          ];
          const handleCenterM: [number, number, number] | null =
            handle === undefined
              ? null
              : [
                  mmToM(handle.positionMm.x + handle.lengthMm / 2) -
                    hingeXM,
                  mmToM(handle.positionMm.y + handle.diameterMm / 2),
                  mmToM(handle.positionMm.z + handle.diameterMm / 2) -
                    hingeZM,
                ];
          return (
            <group
              key={door.id}
              position={[hingeXM, 0, hingeZM]}
              rotation={[0, transform.signedAngleRad, 0]}
            >
              <mesh
                geometry={boxGeometry}
                material={doorMaterial}
                position={doorCenterM}
                castShadow
                receiveShadow
              />
              {handle && handleGeometry && handleMaterial && handleCenterM && (
                <mesh
                  geometry={handleGeometry}
                  material={handleMaterial}
                  position={handleCenterM}
                  rotation={rotationForAxis(handle.axis)}
                  castShadow
                  receiveShadow
                />
              )}
            </group>
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
