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
 *
 * WAVE-01 BLOQUE 2 — **arrastre de objetos en el suelo** (herramienta
 * `select`): pulsar un objeto YA SELECCIONADO y arrastrarlo lo
 * desplaza sobre el plano Y=0 con previsualización estable (offset
 * de render SIN mutar el documento); el soltar confirma UNA UNICA
 * entrada de historial vía `onObjectMove` y Escape cancela el
 * borrador. La órbita se deshabilita durante el arrastre (el
 * documento y el histórico no se tocan hasta el commit).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Grid, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import type {
  ComponentPart,
  MmPoint3,
  SceneDocument,
  SceneParams,
  SelectionState,
  Sketch2D,
} from '@furniconfig/modeler-core';

import type { ViewRequest } from '../../lib/camera-views.js';
import type { Aabb } from '../../lib/camera-views.js';
import type { ModelerMode } from '../../lib/modeler/modes.js';
import type {
  ComponentGeometryState,
  SolidGeometryState,
} from '../../lib/modeler/scene-geometry-coordinator.js';
import { parseWardrobeParams } from '../../lib/modeler/components/wardrobe.js';
import { DEFAULT_SCENE_BOUNDS } from '../../lib/modeler/scene-bounds.js';
import { ModelerCameraRig } from './ModelerCameraRig.js';
import { mmToM, mToMm } from '../../lib/units.js';
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
import {
  getObjectPositionMm,
  snapPositionMm,
  type MoveDraft,
} from '../../lib/modeler/transform.js';
import { type SolidMeshRenderData } from '../../lib/modeler/mesh-to-renderable.js';
import { useSolidGeometry } from './use-solid-geometry.js';
import { useComponentParts } from './use-component-parts.js';

/** Tamaño del plano capturador de clics (m; muy superior al límite de coordenadas). */
const INTERACTION_PLANE_M = 400;

/** Plano Y=0 del documento (m) para la intersección del arrastre. */
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Caja de referencia del espacio de trabajo (m), para encuadre:
 * WAVE-02 centraliza la caja vacía en `scene-bounds.ts` (misma
 * geometría que la constante original: paridad visual exacta). */
const WORKSPACE_BOX: Aabb = DEFAULT_SCENE_BOUNDS;

/** Lado de la rejilla de referencia (m). */
const GRID_SIZE_M = 4;

export interface ModelerSceneProps {
  readonly viewRequest: ViewRequest | null;
  readonly tool: ModelerTool;
  readonly gridStepMm: number;
  readonly sceneDocument: SceneDocument;
  readonly solidStates: ReadonlyMap<string, SolidGeometryState>;
  /**
   * Estados de componentes (4C-D): mapa SEPARADO de los sólidos;
   * cada tipo mantiene su propio ciclo de derivación.
   */
  readonly componentStates: ReadonlyMap<string, ComponentGeometryState>;
  readonly selection: SelectionState | null;
  readonly pendingSketch: Sketch2D | null;
  readonly onCreateSketch: (sketch: Sketch2D) => void;
  readonly onPickObject: (objectId: string | null) => void;
  /**
   * WAVE-01 BLOQUE 2 — borrador de arrastre (posición propuesta, SIN
   * mutar el documento). `null` = sin arrastre activo.
   */
  readonly moveDraft: MoveDraft | null;
  /** Paso de snap del arrastre (mm enteros) o `null` = sin snap. */
  readonly snapGridStepMm: number | null;
  /** Actualiza/limpia el borrador (la escena lo usa como previsualización). */
  readonly onMoveDraftChange: (draft: MoveDraft | null) => void;
  /** Commit del gesto: UNA entrada de historial para la posición final. */
  readonly onObjectMove: (objectId: string, positionMm: MmPoint3) => void;
  /**
   * WAVE-02 BLOQUE 1 — modo de presentación: en `simple` la escena
   * oculta rejilla/ejes/leyenda técnica y pinta fondo neutro + piso
   * discreto. En `advanced` se conserva TODO el material técnico
   * actual (paridad). El plano Y=0 de raycast NO cambia nunca: los
   * objetos conservan coordenadas, medidas y comportamiento real.
   */
  readonly mode: ModelerMode;
  /**
   * WAVE-02 BLOQUE 1 — caja de encuadre (metros). SOLO cambia en
   * momentos explícitos (crear el primer mueble / «Encuadrar»), para
   * evitar reencuadres inesperados durante las ediciones.
   */
  readonly bounds: Aabb;
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
        {props.mode === 'advanced' ? (
          <>
            Rejilla: 100 mm (línea gruesa: 1 m) · snap {props.gridStepMm} mm · Y
            arriba · X rojo, Y verde, Z azul
          </>
        ) : (
          <span data-modeler-scene-hint="">
            Arrastra el ratón para mirar el mueble · rueda para acercarte · clic
            para seleccionar
          </span>
        )}
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
    componentStates,
    selection,
    pendingSketch,
    onCreateSketch,
    onPickObject,
    moveDraft,
    snapGridStepMm,
    onMoveDraftChange,
    onObjectMove,
    mode,
    bounds,
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

  // -------------------------------------------------------------------------
  // WAVE-01 BLOQUE 2 — arrastre de objetos en el suelo (tool `select`)
  // -------------------------------------------------------------------------

  /**
   * Estado del arrastre activo (espejo síncrono del borrador del
   * App: el puntero se mueve más rápido que los renders de React).
   */
  const dragStateRef = useRef<{
    objectId: string;
    originMm: MmPoint3;
    grabOffsetMmX: number;
    grabOffsetMmZ: number;
    pointerId: number;
  } | null>(null);
  const draftMirror = useRef<MoveDraft | null>(moveDraft);
  draftMirror.current = moveDraft;
  const draggingActive = moveDraft !== null;

  /** Intersección rayo↔plano Y=0 → mm enteros del documento. */
  const groundHitMm = useCallback(
    (clientX: number, clientY: number): MmPoint3 | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(GROUND_PLANE, intersection);
      if (hit === null || !Number.isFinite(intersection.x)) return null;
      return [
        Math.round(mToMm(intersection.x)),
        0,
        Math.round(mToMm(intersection.z)),
      ];
    },
    [gl, camera],
  );

  /**
   * Pulsación sobre un objeto YA SELECCIONADO (tool `select`):
   * arranca el arrastre. Objetos no seleccionados siguen eligiendo
   * (clic = seleccionar); la órbita queda para el fondo.
   */
  const handleObjectPointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>, objectId: string) => {
      if (tool !== 'select') return;
      if (event.nativeEvent.button !== 0) return;
      if (selection === null || selection.anchor !== objectId) return;
      const originMm = getObjectPositionMm(sceneDocument, objectId);
      if (originMm === null) return;
      const hitMm = groundHitMm(
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
      );
      if (hitMm === null) return;
      event.stopPropagation();
      try {
        gl.domElement.setPointerCapture(event.nativeEvent.pointerId);
      } catch {
        // Sin captura disponible: el gesto sigue con el puntero
        // sobre el lienzo.
      }
      dragStateRef.current = {
        objectId,
        originMm,
        grabOffsetMmX: hitMm[0] - originMm[0],
        grabOffsetMmZ: hitMm[2] - originMm[2],
        pointerId: event.nativeEvent.pointerId,
      };
      onMoveDraftChange({ objectId, positionMm: originMm });
    },
    [tool, selection, sceneDocument, groundHitMm, gl, onMoveDraftChange],
  );

  /**
   * Seguimiento del arrastre (listeners de ventana mientras esté
   * activo): movimiento → borrador CON snap opcional; soltar → UNA
   * llamada a `onObjectMove` (una entrada de historial); cancelar
   * (pointercancel o Escape vía App) → borrador anulado SIN commit.
   */
  useEffect(() => {
    if (!draggingActive) return;
    const state = dragStateRef.current;
    if (state === null) return;
    const onPointerMove = (event: PointerEvent): void => {
      const hitMm = groundHitMm(event.clientX, event.clientY);
      if (hitMm === null) return;
      let next: MmPoint3 = [
        hitMm[0] - state.grabOffsetMmX,
        0,
        hitMm[2] - state.grabOffsetMmZ,
      ];
      if (snapGridStepMm !== null) {
        next = snapPositionMm(next, snapGridStepMm);
      }
      const latest = draftMirror.current;
      if (
        latest !== null &&
        latest.positionMm[0] === next[0] &&
        latest.positionMm[1] === next[1] &&
        latest.positionMm[2] === next[2]
      ) {
        return; // sin cambio de posición: no re-render
      }
      onMoveDraftChange({ objectId: state.objectId, positionMm: next });
    };
    const finish = (commit: boolean): void => {
      const latest = draftMirror.current;
      dragStateRef.current = null;
      try {
        gl.domElement.releasePointerCapture(state.pointerId);
      } catch {
        // La captura ya se liberó (o nunca existió).
      }
      if (
        commit &&
        latest !== null &&
        (latest.positionMm[0] !== state.originMm[0] ||
          latest.positionMm[2] !== state.originMm[2])
      ) {
        onObjectMove(state.objectId, latest.positionMm);
      }
      onMoveDraftChange(null);
    };
    const onPointerUp = (): void => finish(true);
    const onPointerCancel = (): void => finish(false);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      dragStateRef.current = null;
    };
  }, [
    draggingActive,
    snapGridStepMm,
    groundHitMm,
    gl,
    onMoveDraftChange,
    onObjectMove,
  ]);

  /**
   * Offset de previsualización (m) del objeto con borrador activo:
   * desplaza SOLO el render (el documento no cambia hasta el commit).
   */
  const draftOffsetM = useCallback(
    (objectId: string): readonly [number, number, number] | null => {
      if (moveDraft === null || moveDraft.objectId !== objectId) return null;
      const base = getObjectPositionMm(sceneDocument, objectId);
      if (base === null) return null;
      return [
        mmToM(moveDraft.positionMm[0] - base[0]),
        mmToM(moveDraft.positionMm[1] - base[1]),
        mmToM(moveDraft.positionMm[2] - base[2]),
      ];
    },
    [moveDraft, sceneDocument],
  );

  const solids = useMemo(
    () =>
      sceneDocument.objects.filter(
        (object) => object.kind === 'solid' && object.geometry.source === 'sketch',
      ),
    [sceneDocument],
  );

  const components = useMemo(
    () => sceneDocument.objects.filter((object) => object.kind === 'component'),
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

      {/* WAVE-02 BLOQUE 1 — «estudio» en modo sencillo: fondo neutro,
          piso visual discreto; la rejilla, los ejes y la leyenda son
          del modo AVANZADO (el plano Y=0 de raycast sigue existiendo
          siempre por debajo: sin cambios en el comportamiento). */}
      {mode === 'simple' ? (
        <>
          <color attach="background" args={['#eef1f5']} />
          <mesh rotation-x={-Math.PI / 2} position-y={-0.0015} receiveShadow>
            <circleGeometry args={[7, 72]} />
            <meshStandardMaterial color="#e6eaf1" roughness={1} />
          </mesh>
        </>
      ) : (
        <>
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
        </>
      )}

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

      {/* Sólidos: malla real o caja fantasma mientras se genera.
          WAVE-01: el grupo aplica el offset del borrador de arrastre
          (previsualización) y captura la pulsación para arrastrar. */}
      {solids.map((object) => {
        if (object.kind !== 'solid' || object.geometry.source !== 'sketch') return null;
        const state = solidStates.get(object.id);
        const selected = selection !== null && selection.anchor === object.id;
        const offsetM = draftOffsetM(object.id);
        const dragProps = {
          onPointerDown: (event: ThreeEvent<PointerEvent>) =>
            handleObjectPointerDown(event, object.id),
        };
        if (state !== undefined && state.status === 'ready' && state.mesh !== null) {
          return (
            <group
              key={object.id}
              position={offsetM ?? [0, 0, 0]}
              {...dragProps}
            >
              <SolidMeshView
                objectId={object.id}
                mesh={state.mesh}
                selected={selected}
                downPxRef={downPxRef}
                onPickObject={onPickObject}
              />
            </group>
          );
        }
        return (
          <group key={object.id} position={offsetM ?? [0, 0, 0]} {...dragProps}>
            <GhostSolidView
              sketch={object.geometry.sketch}
              extrusionMm={object.geometry.extrusionMm}
            />
          </group>
        );
      })}

      {/* Componentes inteligentes (4C-D): piezas analíticas del
          motor paramétrico; fantasma mientras no haya derivación o
          en error (el objeto NUNCA desaparece sin explicación).
          WAVE-01: la posición renderizada sigue al borrador de
          arrastre y el grupo captura la pulsación para arrastrar. */}
      {components.map((object) => {
        if (object.kind !== 'component') return null;
        const state = componentStates.get(object.id);
        const selected = selection !== null && selection.anchor === object.id;
        const renderPositionMm: MmPoint3 =
          moveDraft !== null && moveDraft.objectId === object.id
            ? moveDraft.positionMm
            : object.transform.positionMm;
        const dragProps = {
          onPointerDown: (event: ThreeEvent<PointerEvent>) =>
            handleObjectPointerDown(event, object.id),
        };
        if (state !== undefined && state.status === 'ready' && state.parts !== null) {
          return (
            <group key={object.id} {...dragProps}>
              <ComponentPartsView
                objectId={object.id}
                positionMm={renderPositionMm}
                parts={state.parts}
                selected={selected}
                downPxRef={downPxRef}
                onPickObject={onPickObject}
              />
            </group>
          );
        }
        return (
          <group key={object.id} {...dragProps}>
            <GhostComponentView
              params={object.params}
              positionMm={renderPositionMm}
            />
          </group>
        );
      })}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2 - 0.02}
        // WAVE-01: la órbita se detiene mientras dura un arrastre
        // (vista previa estable; se rehabilita al soltar/Escape).
        enabled={!draggingActive}
      />
      <ModelerCameraRig bounds={bounds} viewRequest={viewRequest} />
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

/**
 * Componente inteligente (4C-D): grupo con UNA malla por pieza
 * analítica (cajas y cilindros exactos del motor). CUALQUIER pieza
 * selecciona el clóset COMPLETO (`onPickObject(objectId)`); si
 * está seleccionado se resalta TODO el componente con el mismo
 * tratamiento que los sólidos.
 *
 * Las geometrías las retiene `useComponentParts` (se recrean al
 * cambiar params y se liberan al sustituir o desmontar).
 */
function ComponentPartsView({
  objectId,
  positionMm,
  parts,
  selected,
  downPxRef,
  onPickObject,
}: {
  objectId: string;
  positionMm: MmPoint3;
  parts: readonly ComponentPart[];
  selected: boolean;
  downPxRef: { current: PointerPx | null };
  onPickObject: (objectId: string | null) => void;
}): ReactNode {
  const data = useComponentParts(objectId, parts);
  if (data === null) return null;
  return (
    <group
      position={[
        mmToM(positionMm[0]),
        mmToM(positionMm[1]),
        mmToM(positionMm[2]),
      ]}
    >
      {data.parts.map((part) => (
        <mesh
          key={part.partId}
          geometry={part.geometry}
          castShadow
          receiveShadow
          onClick={(event) => {
            event.stopPropagation();
            const down = downPxRef.current;
            if (down === null) return;
            if (
              !isClick(
                Math.hypot(
                  event.nativeEvent.clientX - down.x,
                  event.nativeEvent.clientY - down.y,
                ),
              )
            ) {
              return; // orbitada sobre el clóset: no cambia la selección
            }
            // Cualquier pieza → el componente COMPLETO (§4).
            onPickObject(objectId);
          }}
        >
          <meshStandardMaterial
            color={selected ? '#9dbbe4' : part.color}
            flatShading
            emissive={selected ? '#2563eb' : '#000000'}
            emissiveIntensity={selected ? 0.35 : 0}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Fantasma de componente mientras no hay piezas (pendiente o
 * error de derivación): caja translúcida con las dimensiones
 * EXTERNAS del clóset si sus params son legibles, o una caja
 * neutra de marcador si el motor los rechazó (nunca inventa
 * piezas: solo indica "aquí hay un objeto con un problema").
 */
function GhostComponentView({
  params,
  positionMm,
}: {
  params: SceneParams | undefined;
  positionMm: MmPoint3;
}): ReactNode {
  const dims = useMemo(() => {
    const config = parseWardrobeParams(params);
    return {
      widthMm: config?.dimensions.widthMm ?? 800,
      heightMm: config?.dimensions.heightMm ?? 2000,
      depthMm: config?.dimensions.depthMm ?? 400,
    };
  }, [params]);
  return (
    <mesh
      position={[
        mmToM(positionMm[0] + dims.widthMm / 2),
        mmToM(positionMm[1] + dims.heightMm / 2),
        mmToM(positionMm[2] + dims.depthMm / 2),
      ]}
      castShadow
      receiveShadow
    >
      <boxGeometry
        args={[
          mmToM(dims.widthMm),
          mmToM(dims.heightMm),
          mmToM(dims.depthMm),
        ]}
      />
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
