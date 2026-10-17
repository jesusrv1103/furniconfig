/**
 * FASE-4C-A — escena 3D independiente del modelador.
 *
 * Canvas R3F PROPIO (no reutiliza `WardrobeScene`, que sigue
 * intacto y dedicado al configurador), pero reutiliza los
 * patrones y utilidades ya probados del visor:
 *
 * - `lib/camera-views.ts` (FOV, vistas, encuadre) vía
 *   `ModelerCameraRig`;
 * - mismo esquema de luces (clave con sombras suaves +
 *   relleno + hemisférica/ambiental) y el mismo IBL
 *   procedural (`RoomEnvironment` + PMREM, sin recursos
 *   externos);
 * - OrbitControls con amortiguación y límites de polaridad
 *   (la cámara nunca se va bajo el suelo);
 * - plano capturador de sombras (`shadowMaterial`) que
 *   ancla los futuros sólidos al suelo sin suelo visible.
 *
 * Escena vacía en 4C-A: rejilla de referencia de dos niveles
 * (100 mm / 1 m) y ejes X/Y/Z con etiquetas. La conversión
 * mm → m es exclusiva de `lib/units.ts`; aquí solo se usan
 * METROS (ya convertidos por la capa de dominio).
 */

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  CanvasTexture,
  Object3D,
  PMREMGenerator,
  SRGBColorSpace,
  type DirectionalLight,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import {
  VIEWER_FOV_DEG,
  VIEW_DIRECTIONS,
  fitDistance,
  type Aabb,
  type ViewRequest,
} from '../../lib/camera-views.js';
import { ModelerCameraRig } from './ModelerCameraRig.js';

/** Área de trabajo visible del modelador (m). */
const WORKSPACE_BOX: Aabb = {
  min: [-2, 0, -2],
  max: [2, 2.4, 2],
};

/** Lado de la rejilla de referencia (m). */
const GRID_SIZE_M = 4;
/** Celda menor: 100 mm. Línea gruesa: 1 m (4 divisiones). */
const MINOR_GRID_DIVISIONS = 40;
const MAJOR_GRID_DIVISIONS = 4;

const AXIS_LABEL_POSITIONS: ReadonlyArray<{
  axis: 'x' | 'y' | 'z';
  label: string;
  position: [number, number, number];
  color: string;
}> = [
  { axis: 'x', label: 'X', position: [GRID_SIZE_M / 2 + 0.25, 0, 0], color: '#d93025' },
  { axis: 'y', label: 'Y', position: [0, WORKSPACE_BOX.max[1] + 0.15, 0], color: '#1a7f37' },
  { axis: 'z', label: 'Z', position: [0, 0, GRID_SIZE_M / 2 + 0.25], color: '#1967d2' },
];

/** IBL procedural: mismo patrón que el visor (sin red). */
function EnvironmentLighting(): null {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmremGenerator = new PMREMGenerator(gl);
    const roomEnvironment = new RoomEnvironment();
    const targetRender = pmremGenerator.fromScene(roomEnvironment, 0.04);
    scene.environment = targetRender.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      roomEnvironment.dispose();
      targetRender.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);

  return null;
}

/** Luz clave con target fijo en el centro del área de trabajo. */
function KeyLight() {
  const lightRef = useRef<DirectionalLight>(null);
  const scene = useThree((state) => state.scene);
  // Target real de three (misma técnica que el visor): se
  // añade a la escena para que su matriz se actualice.
  const target = useMemo(() => {
    const object = new Object3D();
    object.position.set(0, 1, 0);
    return object;
  }, []);

  useEffect(() => {
    scene.add(target);
    const light = lightRef.current;
    if (light !== null) {
      light.target = target;
    }
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  const span = Math.max(
    WORKSPACE_BOX.max[0] - WORKSPACE_BOX.min[0],
    WORKSPACE_BOX.max[1] - WORKSPACE_BOX.min[1],
    WORKSPACE_BOX.max[2] - WORKSPACE_BOX.min[2],
  );
  const shadowSpan = span * 1.1 + 0.5;

  return (
    <directionalLight
      ref={lightRef}
      position={[-span * 1.0, span * 0.9, -span * 0.6]}
      intensity={3}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-camera-left={-shadowSpan}
      shadow-camera-right={shadowSpan}
      shadow-camera-top={shadowSpan}
      shadow-camera-bottom={-shadowSpan}
      shadow-camera-near={0.5}
      shadow-camera-far={span * 3}
      shadow-bias={-0.00015}
      shadow-normalBias={0.02}
    />
  );
}

/**
 * Etiqueta de eje como sprite con textura de lienzo.
 *
 * NO se usa `Html` de drei: crea un root de React por
 * etiqueta y su `unmount` en la limpieza choca con React 19
 * ("Attempted to synchronously unmount a root…", verificado
 * en Chromium real). El sprite es Three.js puro: sin portales
 * DOM, sin red y con halo blanco legible sobre la rejilla.
 */
function AxisLabel({
  position,
  label,
  color,
}: {
  position: [number, number, number];
  label: string;
  color: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('No se pudo crear el contexto2d para la etiqueta de eje');
    }
    context.font = 'bold 42px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    context.lineWidth = 6;
    context.strokeText(label, 32, 34);
    context.fillStyle = color;
    context.fillText(label, 32, 34);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [label, color]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <sprite position={position} scale={[0.3, 0.3, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

export interface ModelerSceneProps {
  /** Petición de vista/ajuste desde la interfaz (null: ninguna). */
  readonly viewRequest: ViewRequest | null;
}

export function ModelerScene({ viewRequest }: ModelerSceneProps) {
  const fitReference = useMemo(
    () =>
      fitDistance(
        WORKSPACE_BOX,
        VIEW_DIRECTIONS.isometric,
        VIEWER_FOV_DEG,
        1,
      ),
    [],
  );

  return (
    <div className="modeler-scene" data-modeler-scene="">
      <Canvas
        shadows="soft"
        camera={{
          fov: VIEWER_FOV_DEG,
          near: 0.05,
          far: 200,
          position: [3, 2.4, -3.4],
        }}
      >
        <color attach="background" args={['#e7e9ed']} />

        <hemisphereLight args={['#ffffff', '#c9ced6', 0.6]} />
        <ambientLight intensity={0.2} />
        <KeyLight />
        {/* Relleno suave desde el frente-derecha (sin sombra). */}
        <directionalLight position={[3.2, 1.4, -3.6]} intensity={1.1} />
        <EnvironmentLighting />

        {/* Rejilla de referencia: celda menor 100 mm y
            línea gruesa cada 1 m (identidad visual clara
            sin saturar la vista con 400 líneas). */}
        <gridHelper
          args={[
            GRID_SIZE_M,
            MINOR_GRID_DIVISIONS,
            '#cdd2d9',
            '#dee2e7',
          ]}
          position={[0, 0.001, 0]}
        />
        <gridHelper
          args={[GRID_SIZE_M, MAJOR_GRID_DIVISIONS, '#9aa0ab', '#b6bcc6']}
          position={[0, 0.002, 0]}
        />

        {/* Ejes de referencia del espacio de trabajo. */}
        <axesHelper args={[GRID_SIZE_M / 2 + 0.15]} position={[0, 0.003, 0]} />
        {AXIS_LABEL_POSITIONS.map((entry) => (
          <AxisLabel
            key={entry.axis}
            position={entry.position}
            label={entry.label}
            color={entry.color}
          />
        ))}

        {/* Capturadora de sombras (solo dibuja sombra). */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
          <planeGeometry args={[GRID_SIZE_M * 3, GRID_SIZE_M * 3]} />
          <shadowMaterial opacity={0.3} color="#1f2430" />
        </mesh>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={fitReference * 0.35}
          maxDistance={fitReference * 6}
          minPolarAngle={0.05}
          maxPolarAngle={Math.PI / 2}
        />
        {/* El rig va DESPUÉS de OrbitControls: sus efectos
            corren en orden y ya ven los controles. */}
        <ModelerCameraRig bounds={WORKSPACE_BOX} viewRequest={viewRequest} />
      </Canvas>

      <p className="modeler-scene-legend" aria-hidden="true">
        Rejilla: 100 mm (línea gruesa: 1 m) · Y arriba · X rojo, Y verde, Z azul
      </p>
    </div>
  );
}
