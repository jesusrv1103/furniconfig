import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  Object3D,
  PMREMGenerator,
} from 'three';
import type { DirectionalLight } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
import {
  VIEWER_FOV_DEG,
  VIEW_DIRECTIONS,
  boxCenter,
  fitDistance,
  reframe,
  viewPosition,
  type Aabb,
  type CameraView,
  type ViewRequest,
} from '../lib/camera-views.js';
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
 * - Iluminación: hemisférica de relleno + luz clave
 *   frontal-derecha con sombras PCF suaves configuradas
 *   (target en el centro del mueble) + relleno frontal.
 *   Un entorno procedural (RoomEnvironment de three, sin
 *   recursos externos) da reflectancias realistas a los
 *   metales.
 * - No se inventa geometría: solo existen los paneles,
 *   barras, puertas y tiradores que genera el motor.
 */

/** Estado del rig de cámara entre renders. */
interface CameraRigState {
  /** Última vista aplicada; 'free' tras interacción del usuario. */
  view: CameraView | 'free';
  /** Centro del mueble (m) en la última aplicación. */
  center: [number, number, number];
  /** Distancia de encuadre (m) en la última aplicación. */
  fit: number;
}

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
  doorsVisible = true,
  viewRequest = null,
}: {
  geometry: GeometryResult;
  /**
   * Ángulo de apertura de las puertas (grados,
   * 0–110). Es estado de presentación: el motor
   * genera las hojas cerradas y esta capa aplica
   * la rotación alrededor del eje de bisagra.
   */
  doorOpenAngleDeg?: number;
  /**
   * Oculta hojas y tiradores en la escena. Es estado de
   * presentación: NO modifica `geometry.doors` ni
   * `geometry.handles` (la geometría del motor intacta).
   */
  doorsVisible?: boolean;
  /** Vista predefinida solicitada desde la interfaz. */
  viewRequest?: ViewRequest | null;
}) {
  const { widthMm, heightMm, depthMm, materials } = geometry.wardrobe;
  const widthM = mmToM(widthMm);
  const heightM = mmToM(heightMm);
  const depthM = mmToM(depthMm);

  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  const viewportSize = useThree((state) => state.size);

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

  // Caja de encuadre (m): el cuerpo del mueble y la
  // protrusión frontal de puertas y tiradores (montados
  // sobre el frente, z < 0).
  const bounds = useMemo<Aabb>(() => {
    let frontZ = 0;
    for (const door of doors) {
      frontZ = Math.min(frontZ, mmToM(door.positionMm.z));
    }
    for (const handle of handles) {
      frontZ = Math.min(
        frontZ,
        mmToM(handle.positionMm.z) - mmToM(handle.diameterMm) / 2,
      );
    }
    return {
      min: [0, 0, frontZ],
      max: [widthM, heightM, depthM],
    };
  }, [doors, handles, widthM, heightM, depthM]);

  const target = useMemo<[number, number, number]>(
    () => [widthM / 2, heightM / 2, depthM / 2],
    [widthM, heightM, depthM],
  );

  const aspect =
    viewportSize.width / Math.max(viewportSize.height, 1);
  // Distancia de referencia (isométrica) para los límites
  // de zoom de OrbitControls.
  const fitReference = useMemo(
    () =>
      fitDistance(bounds, VIEW_DIRECTIONS.isometric, VIEWER_FOV_DEG, aspect),
    [bounds, aspect],
  );

  const span = Math.max(widthM, heightM, depthM);

  // Estado compartido entre OrbitControls (marca 'free'
  // al interactuar) y CameraRig (vistas/reencuadres).
  const cameraRigState = useRef<CameraRigState>({
    view: 'isometric',
    center: [widthM / 2, heightM / 2, depthM / 2],
    fit: 0,
  });

  const handleControlsStart = useCallback(() => {
    cameraRigState.current.view = 'free';
  }, []);

  // --- Entorno procedural (IBL) ---------------------------------
  // RoomEnvironment (incluido en three) genera un mapa de
  // entorno local: los metales (barra, tiradores) dejan de
  // renderizarse negros sin depender de recursos externos.
  useEffect(() => {
    const pmremGenerator = new PMREMGenerator(gl);
    const roomEnvironment = new RoomEnvironment();
    const targetRender = pmremGenerator.fromScene(
      roomEnvironment,
      0.04,
    );
    scene.environment = targetRender.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      roomEnvironment.dispose();
      targetRender.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);

  // --- Luz clave: target en el centro del mueble ---------------
  const keyLightRef = useRef<DirectionalLight>(null);
  const keyTarget = useMemo(() => new Object3D(), []);
  useEffect(() => {
    keyTarget.position.set(target[0], target[1], target[2]);
  }, [keyTarget, target]);
  useEffect(() => {
    scene.add(keyTarget);
    const light = keyLightRef.current;
    if (light !== null) {
      light.target = keyTarget;
    }
    return () => {
      scene.remove(keyTarget);
    };
  }, [scene, keyTarget]);

  // Posiciones de luces relativas al centro del mueble:
  // la clave entra por el frente-izquierda (la sombra del
  // suelo cae hacia atrás-derecha, visible en la vista
  // isométrica por la que arranca el visor) y el relleno
  // suaviza el flanco derecho.
  const keyLightPosition = useMemo<[number, number, number]>(
    () => [
      target[0] - span * 1.0,
      target[1] + span * 0.9,
      target[2] - span * 0.6,
    ],
    [target, span],
  );
  const fillLightPosition = useMemo<[number, number, number]>(
    () => [
      target[0] + span * 0.8,
      target[1] + span * 0.35,
      target[2] - span * 0.9,
    ],
    [target, span],
  );
  // Encuadre de sombras: cubre el mueble y la sombra que
  // proyecta en el suelo (extensión ≈ altura / tangente de
  // la elevación de la luz).
  const shadowSpan = span * 1.1 + 0.5;
  const keyLightDistance = Math.hypot(span * 1.0, span * 0.9, span * 0.6);
  const shadowFar = keyLightDistance + shadowSpan * 2 + 1;

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
  // de puerta, panel trasero y, si existen, barra metálica,
  // piezas de cajón y tiradores metálicos).
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
    if (materials.back) {
      boardMaterials.push(materials.back);
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
      {/* Fondo neutro de estudio (presentación; la escena
          no depende del color de la página). */}
      <color attach="background" args={['#e7e9ed']} />
      {/* Cielo/suelo: rellena interiores sin aplastar sombras. */}
      <hemisphereLight args={['#ffffff', '#c9ced6', 0.6]} />
      <ambientLight intensity={0.2} />
      {/* Luz clave frontal-derecha-arriba: sombras suaves
          configuradas (mapa 2048, bias y normalBias) y
          cámara de sombras ajustada al mueble; el target
          está en el centro del clóset para que la proyección
          lo cubra completo. */}
      <directionalLight
        ref={keyLightRef}
        position={keyLightPosition}
        intensity={3}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowSpan}
        shadow-camera-right={shadowSpan}
        shadow-camera-top={shadowSpan}
        shadow-camera-bottom={-shadowSpan}
        shadow-camera-near={0.5}
        shadow-camera-far={shadowFar}
        shadow-bias={-0.00015}
        shadow-normalBias={0.02}
      />
      {/* Relleno suave desde el frente-izquierda (sin sombra). */}
      <directionalLight position={fillLightPosition} intensity={1.1} />
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
        {doorsVisible &&
          doorTransforms.map(({ door, transform }) => {
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
          '#8b929d',
          '#c3c8d1',
        ]}
        position={[widthM / 2, 0, depthM / 2]}
      />
      {/* Capturadora de sombras: plano invisible (solo
          dibuja sombra) que ancla el mueble al suelo sin
          añadir suelo visible ni romper el fondo neutro. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[widthM / 2, -0.002, depthM / 2]}
        receiveShadow
      >
        <planeGeometry args={[gridSize * 3, gridSize * 3]} />
        <shadowMaterial opacity={0.3} color="#1f2430" />
      </mesh>
      <OrbitControls
        makeDefault
        target={target}
        enableDamping
        dampingFactor={0.08}
        minDistance={fitReference * 0.35}
        maxDistance={fitReference * 6}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2}
        onStart={handleControlsStart}
      />
      {/* CameraRig después de OrbitControls: sus efectos
          corren en orden y pueden usar los controles. */}
      <CameraRig
        bounds={bounds}
        viewRequest={viewRequest}
        rigState={cameraRigState}
      />
    </>
  );
}

/**
 * Rig de cámara (presentación pura):
 *
 * - Al montar aplica la vista isométrica frontal encuadrada.
 * - Aplica las vistas predefinidas solicitadas por la
 *   interfaz (frontal / lateral / isométrica).
 * - Al cambiar las dimensiones del mueble reencuadra:
 *   re-aplica la vista predefinida activa o, si el usuario
 *   giró la cámara ('free'), conserva su dirección de vista
 *   y escala la distancia con el nuevo encuadre.
 */
/**
 * Interfaz estructural mínima de OrbitControls. El estado
 * de R3F tipa `controls` como `EventDispatcher` genérico;
 * el rig solo necesita el target y el update.
 */
interface RigControls {
  target: { set(x: number, y: number, z: number): void };
  update: () => void;
}

function CameraRig({
  bounds,
  viewRequest,
  rigState,
}: {
  bounds: Aabb;
  viewRequest: ViewRequest | null;
  rigState: { current: CameraRigState };
}) {
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as RigControls | null;
  const viewportSize = useThree((state) => state.size);
  const aspect =
    viewportSize.width / Math.max(viewportSize.height, 1);
  const center = useMemo(() => boxCenter(bounds), [bounds]);

  // Encuadre inicial y reencuadre al cambiar dimensiones
  // o aspecto. useLayoutEffect: se aplica antes del primer
  // pintado (sin fotograma con la cámara desencadrada).
  useLayoutEffect(() => {
    const state = rigState.current;
    const isometricFit = fitDistance(
      bounds,
      VIEW_DIRECTIONS.isometric,
      VIEWER_FOV_DEG,
      aspect,
    );
    if (state.view === 'free') {
      // Conserva la dirección de vista del usuario y
      // escala la distancia con el nuevo encuadre.
      const position = reframe(
        camera.position.toArray() as [number, number, number],
        state.center,
        center,
        state.fit,
        isometricFit,
      );
      camera.position.set(position[0], position[1], position[2]);
      state.fit = isometricFit;
    } else {
      const direction = VIEW_DIRECTIONS[state.view];
      const distance = fitDistance(
        bounds,
        direction,
        VIEWER_FOV_DEG,
        aspect,
      );
      const position = viewPosition(center, direction, distance);
      camera.position.set(position[0], position[1], position[2]);
      state.fit = distance;
    }
    state.center = center;
    if (controls !== null) {
      controls.target.set(center[0], center[1], center[2]);
      controls.update();
    } else {
      camera.lookAt(center[0], center[1], center[2]);
    }
  }, [bounds, center, aspect, camera, controls, rigState]);

  // Vistas predefinidas solicitadas desde la interfaz.
  useLayoutEffect(() => {
    if (viewRequest === null) {
      return;
    }
    const direction = VIEW_DIRECTIONS[viewRequest.view];
    const distance = fitDistance(
      bounds,
      direction,
      VIEWER_FOV_DEG,
      aspect,
    );
    const position = viewPosition(center, direction, distance);
    camera.position.set(position[0], position[1], position[2]);
    const state = rigState.current;
    state.view = viewRequest.view;
    state.center = center;
    state.fit = distance;
    if (controls !== null) {
      controls.target.set(center[0], center[1], center[2]);
      controls.update();
    } else {
      camera.lookAt(center[0], center[1], center[2]);
    }
  }, [viewRequest, bounds, center, aspect, camera, controls, rigState]);

  return null;
}
