/**
 * FASE-4C-A/B — escena 3D independiente del modelador.
 *
 * Canvas R3F PROPIO (no reutiliza `WardrobeScene`, que sigue
 * intacto y dedicado al configurador), reutilizando los patrones
 * y utilidades ya probados del visor (cámaras, luces, IBL).
 *
 * FASE-4C-B añade la interacción de modelado libre:
 *
 * - **Dos herramientas explícitas** (`ModelerTool`): en modo
 *   `rectangle` el botón izquierdo DIBUJA (OrbitControls lo
 *   deshabilita y la órbita pasa al botón derecho); en modo
 *   `select` el izquierdo orbita y el clic (con clickGuard) selecciona.
 * - **Proyección al ground**: intersección rayo↔plano por el
 *   evento R3F (`event.point`, metros) + `worldToGroundMm` +
 *   snap único en `drawing.ts` (I1: mm enteros en el documento).
 * - **Vista previa y cotas en vivo**: rectángulo translúcido
 *   sobre el suelo + etiqueta de cotas con un **div DOM
 *   posicionado fijo** (NUNCA `Html` de drei: bug documentado
 *   con React 19).
 * - **Sólidos**: malla real del kernel (mm→m solo en
 *   `mesh-to-renderable.ts`) o caja fantasma mientras la
 *   generación está pendiente/fallida; selección resaltada con
 *   emisivo; `dispose()` de la BufferGeometry al sustituirla.
 * - **Escape** cancela el gesto en curso (estado vacío).
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import type {
  SceneDocument,
  SelectionState,
  Sketch2D,
} from '@furniconfig/modeler-core';

import type { ViewRequest } from '../../lib/camera-views.js';
import type { Aabb } from '../../lib/camera-views.js';
import type { SolidGeometryState } from '../../lib/modeler/scene-geometry-coordinator.js';
import { ModelerCameraRig } from './ModelerCameraRig.js';
import { mmToM } from '../../lib/units.js';
import {
  cancelDrawGesture,
  createDrawGesture,
  drawDimensionsMm,
  finishDrawGesture,
  isClick,
  beginDrawGesture,
  updateDrawGesture,
  type DrawGesture,
  type ModelerTool,
} from '../../lib/modeler/drawing.js';
import { type SolidMeshRenderData } from '../../lib/modeler/mesh-to-renderable.js';
import { useSolidGeometry } from './use-solid-geometry.js';

/** Tamaño del plano capturador de clics (m; muy superior al límite de coordenadas). */
const INTERACTION_PLANE_M = 400;

/** Caja de referencia del espacio de trabajo (m), para encuadre. */
const WORKSPACE_BOX: Aabb = {
  min: [-2, 0, -2],
  max: [2, 2.4, 2],
};

/** Lado de la rejilla de referencia (m). */
const GRID_SIZE_M = 4;

export interface ModelerSceneProps {
  readonly viewRequest: ViewRequest | null;
  readonly tool: ModelerTool;
  readonly gridStepMm: number;
  readonly sceneDocument: SceneDocument;
  readonly solidStates: ReadonlyMap<string, SolidGeometryState>;
  readonly selection: SelectionState | null;
  readonly pendingSketch: Sketch2D | null;
  readonly onCreateSketch: (sketch: Sketch2D) => void;
  readonly onPickObject: (objectId: string | null) => void;
}

interface PointerPx {
  readonly x: number;
  readonly y: number;
}

export function ModelerScene(props: ModelerSceneProps): ReactNode {
  const [gestureView, setGestureView] = useState<{
    gesture: DrawGesture;
    pointerPx: PointerPx | null;
  }>({
    gesture: createDrawGesture(),
    pointerPx: null,
  });  // Espejo síncrono del gesto: `onPointerUp` lee SIEMPRE la última
  // esquina aunque el render de React vaya por detrás.
  const gestureMirror = useMemo(
    () => ({ current: createDrawGesture() as DrawGesture }),
    [],
  );
  const downPxRef = useMemo(
    () => ({ current: null as PointerPx | null }),
    [],
  );

  const dims = drawDimensionsMm(gestureView.gesture);

  return (
    <div className="modeler-scene" data-modeler-scene="">
      <Canvas
        shadows
        camera={{ position: [1.8, 1.5, 2.2], fov: 45 }}
        gl={{ antialias: true }}
        onPointerMissed={(event) => {
          if (props.tool !== 'select') return;
          const down = downPxRef.current;
          if (
            down !== null &&
            !isClick(Math.hypot(event.clientX - down.x, event.clientY - down.y))
          ) {
            return; // orbitada: no se deselecciona
          }
          props.onPickObject(null);
        }}
      >
        <SceneContent
          {...props}
          gestureMirror={gestureMirror}
          downPxRef={downPxRef}
          onGestureChange={(gesture, pointerPx) => {
            gestureMirror.current = gesture;
            setGestureView({ gesture, pointerPx });
          }}
        />
      </Canvas>
      {gestureView.gesture.originMm !== null &&
        gestureView.pointerPx !== null &&
        dims !== null && (
          <div
            className="modeler-draw-hint"
            data-modeler-draw-hint=""
            style={{
              left: `${gestureView.pointerPx.x + 14}px`,
              top: `${gestureView.pointerPx.y + 14}px`,
            }}
          >
            {dims.widthMm} × {dims.depthMm} mm
          </div>
        )}
      <p className="modeler-scene-legend" aria-hidden="true">
        Rejilla: 100 mm (línea gruesa: 1 m) · snap {props.gridStepMm} mm · Y
        arriba · X rojo, Y verde, Z azul
      </p>
    </div>
  );
}

interface SceneContentProps extends ModelerSceneProps {
  readonly gestureMirror: { current: DrawGesture };
  readonly downPxRef: { current: PointerPx | null };
  readonly onGestureChange: (gesture: DrawGesture, pointerPx: PointerPx | null) => void;
}

function SceneContent(props: SceneContentProps): ReactNode {
  const {
    viewRequest,
    tool,
    gridStepMm,
    sceneDocument,
    solidStates,
    selection,
    pendingSketch,
    onCreateSketch,
    onPickObject,
    gestureMirror,
    downPxRef,
    onGestureChange,
  } = props;
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const controls = useThree(
    (state) => state.controls as unknown as { mouseButtons: unknown } | null,
  );

  // Proyección mm → píxeles de pantalla para la verificación
  // visual (clics deterministas sobre sólidos). Conversión mm→m
  // vía `mmToM` (frontera de unidades).
  useEffect(() => {
    const target = window as unknown as {
      __modelerProject?: (
        pointMm: readonly [number, number, number],
      ) => { x: number; y: number };
    };
    target.__modelerProject = (pointMm) => {
      const rect = gl.domElement.getBoundingClientRect();
      const vector = new THREE.Vector3(
        mmToM(pointMm[0]),
        mmToM(pointMm[1]),
        mmToM(pointMm[2]),
      ).project(camera);
      return {
        x: rect.left + ((vector.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - vector.y) / 2) * rect.height,
      };
    };
    return () => {
      delete target.__modelerProject;
    };
  }, [gl, camera]);

  // Botones del ratón por herramienta (nunca se infiere intención).
  useEffect(() => {
    if (controls === null) return;
    controls.mouseButtons =
      tool === 'rectangle'
        ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
        : {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN,
          };
  }, [controls, tool]);

  // Posición de pulsación (clickGuard): un listener nativo del
  // canvas captura el down aunque el rayo no golpee ningún mesh.
  useEffect(() => {
    const canvas = gl.domElement;
    const onPointerDown = (event: PointerEvent): void => {
      downPxRef.current = { x: event.clientX, y: event.clientY };
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    return () => canvas.removeEventListener('pointerdown', onPointerDown);
  }, [gl, downPxRef]);

  // Escape cancela el gesto en curso sin estados parciales.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (gestureMirror.current.originMm === null) return;
      onGestureChange(cancelDrawGesture(), null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gestureMirror, onGestureChange]);

  const solids = useMemo(
    () =>
      sceneDocument.objects.filter(
        (object) => object.kind === 'solid' && object.geometry.source === 'sketch',
      ),
    [sceneDocument],
  );

  const preview = dragPreviewMm(gestureMirror.current);

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[2.5, 4, 2]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
      />
      <hemisphereLight args={['#ffffff', '#404040', 0.5]} />

      <Grid
        args={[0.1, 1]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#c8d0da"
        sectionSize={1}
        sectionThickness={1.1}
        sectionColor="#8b97a6"
        fadeDistance={14}
        fadeStrength={1.6}
        position={[0, 0, 0]}
        infiniteGrid
      />
      <AxisLabel position={[GRID_SIZE_M / 2 + 0.25, 0, 0]} color="#d93025">X</AxisLabel>
      <AxisLabel position={[0, WORKSPACE_BOX.max[1] + 0.15, 0]} color="#1a7f37">Y</AxisLabel>
      <AxisLabel position={[0, 0, GRID_SIZE_M / 2 + 0.25]} color="#1967d2">Z</AxisLabel>

      {/* Ejes de referencia del espacio de trabajo (4C-A). */}
      <axesHelper args={[GRID_SIZE_M / 2 + 0.15]} position={[0, 0.003, 0]} />

      {/* Suelo receptor de sombras (invisible, solo sombras). */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.002} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <shadowMaterial opacity={0.16} />
      </mesh>

      {/* Plano de interacción del ground (transparente, raycastable). */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0}
        onPointerDown={(event) => {
          if (tool !== 'rectangle') return;
          event.stopPropagation();
          (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
          onGestureChange(
            beginDrawGesture([event.point.x, event.point.y, event.point.z], gridStepMm),
            { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY },
          );
        }}
        onPointerMove={(event) => {
          if (tool !== 'rectangle') return;
          const current = gestureMirror.current;
          if (current.originMm === null) return;
          onGestureChange(
            updateDrawGesture(
              current,
              [event.point.x, event.point.y, event.point.z],
              gridStepMm,
            ),
            { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY },
          );
        }}
        onPointerUp={(event) => {
          if (tool !== 'rectangle') return;
          const target = event.target as HTMLCanvasElement;
          if (target.hasPointerCapture?.(event.pointerId) === true) {
            target.releasePointerCapture(event.pointerId);
          }
          const sketch = finishDrawGesture(gestureMirror.current);
          onGestureChange(createDrawGesture(), null);
          if (sketch !== null) onCreateSketch(sketch);
        }}
        onClick={(event) => {
          // Clic en el suelo en modo selección → deseleccionar
          // (con clickGuard: una orbitada no deselecciona).
          if (tool !== 'select') return;
          const down = downPxRef.current;
          if (down === null) return;
          const drift = Math.hypot(
            event.nativeEvent.clientX - down.x,
            event.nativeEvent.clientY - down.y,
          );
          if (!isClick(drift)) return;
          onPickObject(null);
        }}
      >
        <planeGeometry args={[INTERACTION_PLANE_M, INTERACTION_PLANE_M]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Vista previa del rectángulo mientras se arrastra. */}
      {preview !== null && (
        <mesh position={[preview.cx, 0.004, preview.cz]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[preview.widthM, preview.depthM]} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}

      {/* Croquis pendiente de extruir (suelo). */}
      {pendingSketch !== null && (
        <PendingSketchOutline sketch={pendingSketch} />
      )}

      {/* Sólidos: malla real o caja fantasma mientras se genera. */}
      {solids.map((object) => {
        if (object.kind !== 'solid' || object.geometry.source !== 'sketch') return null;
        const state = solidStates.get(object.id);
        const selected = selection !== null && selection.anchor === object.id;
        if (state !== undefined && state.status === 'ready' && state.mesh !== null) {
          return (
            <SolidMeshView
              key={object.id}
              objectId={object.id}
              mesh={state.mesh}
              selected={selected}
              downPxRef={downPxRef}
              onPickObject={onPickObject}
            />
          );
        }
        return (
          <GhostSolidView
            key={object.id}
            sketch={object.geometry.sketch}
            extrusionMm={object.geometry.extrusionMm}
          />
        );
      })}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
      <ModelerCameraRig bounds={WORKSPACE_BOX} viewRequest={viewRequest} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------

/** Etiqueta de eje (sprite con CanvasTexture; nunca `Html` de drei). */
function AxisLabel({
  position,
  color,
  children,
}: {
  position: [number, number, number];
  color: string;
  children: string;
}): ReactNode {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context !== null) {
      context.font = 'bold 42px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      context.lineWidth = 6;
      context.strokeText(children, 32, 34);
      context.fillStyle = color;
      context.fillText(children, 32, 34);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [color, children]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[0.3, 0.3, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

/** Rectángulo pendiente de extruir (contorno en el suelo). */
function PendingSketchOutline({ sketch }: { sketch: Sketch2D }): ReactNode {
  const bounds = useMemo(() => sketchBoundsM(sketch), [sketch]);
  if (bounds === null) return null;
  return (
    <mesh
      position={[bounds.cx, 0.003, bounds.cz]}
      rotation-x={-Math.PI / 2}
    >
      <planeGeometry args={[bounds.widthM, bounds.depthM]} />
      <meshBasicMaterial color="#2563eb" transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

/** Caja fantasma exacta (bbox del croquis × extrusión) mientras se genera. */
function GhostSolidView({
  sketch,
  extrusionMm,
}: {
  sketch: Sketch2D;
  extrusionMm: number;
}): ReactNode {
  const bounds = useMemo(() => sketchBoundsM(sketch), [sketch]);
  if (bounds === null) return null;
  const heightM = mmToM(extrusionMm);
  return (
    <mesh
      position={[bounds.cx, heightM / 2, bounds.cz]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[bounds.widthM, heightM, bounds.depthM]} />
      <meshStandardMaterial
        color="#9aa4b2"
        transparent
        opacity={0.22}
        flatShading
      />
    </mesh>
  );
}

/** Sólido con la malla real del kernel; resaltado si está seleccionado. */
function SolidMeshView({
  objectId,
  mesh,
  selected,
  downPxRef,
  onPickObject,
}: {
  objectId: string;
  mesh: SolidMeshRenderData;
  selected: boolean;
  downPxRef: { current: PointerPx | null };
  onPickObject: (objectId: string | null) => void;
}): ReactNode {
  const geometry = useSolidGeometry(mesh);
  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={(event) => {
        event.stopPropagation();
        const down = downPxRef.current;
        if (down === null) return;
        if (
          !isClick(
            Math.hypot(event.nativeEvent.clientX - down.x, event.nativeEvent.clientY - down.y),
          )
        ) {
          return; // orbitada sobre el sólido: no cambia la selección
        }
        onPickObject(objectId);
      }}
    >
      <meshStandardMaterial
        color={selected ? '#9dbbe4' : '#8a97a8'}
        flatShading
        emissive={selected ? '#2563eb' : '#000000'}
        emissiveIntensity={selected ? 0.35 : 0}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

interface SketchBoundsM {
  readonly cx: number;
  readonly cz: number;
  readonly widthM: number;
  readonly depthM: number;
}

function sketchBoundsM(sketch: Sketch2D): SketchBoundsM | null {
  const xs = sketch.pointsMm.map((point) => point[0]);
  const zs = sketch.pointsMm.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  if (maxX === minX || maxZ === minZ) return null;
  return {
    cx: mmToM((minX + maxX) / 2),
    cz: mmToM((minZ + maxZ) / 2),
    widthM: mmToM(maxX - minX),
    depthM: mmToM(maxZ - minZ),
  };
}

function dragPreviewMm(gesture: DrawGesture): SketchBoundsM | null {
  if (gesture.originMm === null || gesture.currentMm === null) return null;
  return sketchBoundsM({
    plane: 'ground',
    planeOriginMm: [0, 0, 0],
    pointsMm: [
      gesture.originMm,
      gesture.currentMm,
      [gesture.currentMm[0], gesture.originMm[1]],
      [gesture.originMm[0], gesture.currentMm[1]],
    ],
    closed: true,
  });
}
