/**
 * Componente de arrastre de separadores (Fase 3F.2).
 *
 * Renderiza un área de agarre invisible sobre cada división
 * entre dos módulos y gestiona el arrastre con pointer events.
 * La previsualización la aplica el padre vía `onDragMove`; la
 * confirmación (una sola entrada de historial) llega con
 * `onDragEnd`.
 *
 * Garantías:
 * - OrbitControls se desactiva solo durante un arrastre
 *   válido y se restaura siempre (soltar, Escape,
 *   pointercancel, pérdida de foco, `enabled=false`,
 *   desmontaje). El hover nunca toca la cámara.
 * - Si la cámara es lateral (eje X degenerado) el arrastre
 *   no arranca: no hay saltos ni inversiones.
 * - Sin valores no finitos: cualquier proyección no finita
 *   aborta el gesto sin cambiar nada.
 */

import * as THREE from 'three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { computeDragResult, type SeparatorDragResult } from '../lib/studio/separators.js';
import type { GeometryResult } from '@furniconfig/geometry-core';
import type { WardrobeConfig } from '@furniconfig/geometry-core';

export interface DividerInfo {
  index: number;
  panelId: string;
  centerXM: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export function extractDividers(geometry: GeometryResult): DividerInfo[] {
  const dividers: DividerInfo[] = [];
  for (const panel of geometry.panels) {
    if (panel.role === 'divider' && panel.id.startsWith('panel-divider-')) {
      const indexStr = panel.id.replace('panel-divider-', '');
      const index = parseInt(indexStr, 10) - 1;
      if (!Number.isNaN(index)) {
        const halfX = panel.sizeMm.x / 2000;
        const halfY = panel.sizeMm.y / 2000;
        const halfZ = panel.sizeMm.z / 2000;
        const centerXM = panel.positionMm.x / 1000 + halfX;
        const centerYM = panel.positionMm.y / 1000 + halfY;
        const centerZM = panel.positionMm.z / 1000 + halfZ;
        dividers.push({
          index,
          panelId: panel.id,
          centerXM,
          minY: centerYM - halfY,
          maxY: centerYM + halfY,
          minZ: centerZM - halfZ,
          maxZ: centerZM + halfZ,
        });
      }
    }
  }
  dividers.sort((a, b) => a.index - b.index);
  return dividers;
}

/**
 * Umbral de degeneración lateral: si la dirección de la
 * cámara es casi paralela al eje X, el divisor se mueve
 * hacia/alejando de la cámara y el arrastre en pantalla
 * no tiene sentido (un píxel = cientos de mm).
 */
export const DRAG_DEGENERATE_DOT_X = 0.9;

/** ¿La vista es lateral (eje X degenerado para arrastrar)? */
export function isDragDegenerate(camDirX: number): boolean {
  if (!Number.isFinite(camDirX)) {
    return true;
  }
  return Math.abs(camDirX) > DRAG_DEGENERATE_DOT_X;
}

/**
 * Normal del plano de interacción para un divisor: el plano
 * contiene el eje X (dirección del arrastre) y mira a la
 * cámara tanto como sea posible. Devuelve `null` si la vista
 * es degenerada (cámara sobre el eje X).
 */
export function dragPlaneNormal(
  camPos: { x: number; y: number; z: number },
  planePoint: { x: number; y: number; z: number },
  camDirX: number,
): THREE.Vector3 | null {
  if (isDragDegenerate(camDirX)) {
    return null;
  }
  const toCamera = new THREE.Vector3(
    0,
    camPos.y - planePoint.y,
    camPos.z - planePoint.z,
  );
  if (toCamera.lengthSq() < 1e-12 || !Number.isFinite(toCamera.lengthSq())) {
    return null;
  }
  return toCamera.normalize();
}

/** Objeto mínimo conmutable (OrbitControls real o doble de pruebas). */
export interface OrbitLike {
  enabled: boolean;
}

/**
 * Guardián de OrbitControls: desactiva al empezar el gesto
 * y restaura al terminar, sea cual sea la salida (soltar,
 * Escape, cancelación, desmontaje). Idempotente y seguro
 * ante `current === null`.
 */
export function createOrbitGuard(ref: { current: OrbitLike | null }) {
  let holding = false;
  return {
    disable(): void {
      if (holding) {
        return;
      }
      holding = true;
      try {
        if (ref.current) {
          ref.current.enabled = false;
        }
      } catch {
        // Controles desmontados a mitad de gesto: el flag
        // garantiza que restore() limpie el estado igual.
      }
    },
    restore(): void {
      if (!holding) {
        return;
      }
      try {
        if (ref.current) {
          ref.current.enabled = true;
        }
      } catch {
        // Limpieza (cancelado/desmontaje): nunca lanzar desde
        // estos caminos; el flag se libera igual en finally.
      } finally {
        holding = false;
      }
    },
    get isHolding(): boolean {
      return holding;
    },
  };
}

export type OrbitGuard = ReturnType<typeof createOrbitGuard>;

interface DividerDragHandleProps {
  geometry: GeometryResult;
  config: WardrobeConfig;
  onDragStart: (separatorIndex: number) => void;
  onDragMove: (result: SeparatorDragResult) => void;
  onDragEnd: (result: SeparatorDragResult) => void;
  dragMode: 'precise1' | 'step10';
  enabled: boolean;
  /** Referencia a OrbitControls para desactivar/activar durante arrastre. */
  orbitControlsRef?: React.RefObject<OrbitLike | null>;
}

export function DividerDragHandle({
  geometry,
  config,
  onDragStart,
  onDragMove,
  onDragEnd,
  dragMode,
  enabled = true,
  orbitControlsRef,
}: DividerDragHandleProps) {
  const { camera, gl } = useThree();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{
    startWorldX: number;
    startConfig: WardrobeConfig;
    separatorIndex: number;
    pointerId: number;
  } | null>(null);
  const lastResultRef = useRef<SeparatorDragResult | null>(null);
  const guardRef = useRef<OrbitGuard | null>(null);
  if (guardRef.current === null) {
    guardRef.current = createOrbitGuard({
      get current() {
        return orbitControlsRef?.current ?? null;
      },
    });
  }

  const dividers = useMemo(() => extractDividers(geometry), [geometry]);

  const releaseCapture = useCallback((pointerId: number) => {
    try {
      const element = gl.domElement as HTMLElement & {
        releasePointerCapture?: (id: number) => void;
        hasPointerCapture?: (id: number) => boolean;
      };
      if (typeof element.hasPointerCapture === 'function') {
        if (!element.hasPointerCapture(pointerId)) {
          return;
        }
      }
      element.releasePointerCapture?.(pointerId);
    } catch {
      // jsdom o navegador sin captura: no es un error.
    }
  }, [gl]);

  const finishGesture = useCallback((commit: SeparatorDragResult | null) => {
    const start = dragStartRef.current;
    if (start !== null) {
      releaseCapture(start.pointerId);
    }
    dragStartRef.current = null;
    lastResultRef.current = null;
    setDraggingIndex(null);
    guardRef.current?.restore();
    if (commit !== null) {
      onDragEnd(commit);
    }
  }, [onDragEnd, releaseCapture]);

  const cancelGesture = useCallback(() => {
    const start = dragStartRef.current;
    if (start === null) {
      return;
    }
    const restore: SeparatorDragResult = {
      config: start.startConfig,
      appliedDeltaMm: 0,
      minDeltaMm: 0,
      maxDeltaMm: 0,
      clamped: false,
      leftWidthMm: 0,
      rightWidthMm: 0,
      changed: false,
    };
    finishGesture(restore);
  }, [finishGesture]);

  // Proyecta el puntero sobre el plano del divisor y devuelve
  // la coordenada X mundo, o `null` si la vista es degenerada
  // o la proyección no es finita.
  const getWorldXFromPointer = useCallback(
    (pointerX: number, pointerY: number, divider: DividerInfo): number | null => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      const mouse = new THREE.Vector2(
        ((pointerX - rect.left) / rect.width) * 2 - 1,
        -((pointerY - rect.top) / rect.height) * 2 + 1,
      );
      if (!Number.isFinite(mouse.x) || !Number.isFinite(mouse.y)) {
        return null;
      }
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const camDir = camera.getWorldDirection(new THREE.Vector3());
      const planePoint = new THREE.Vector3(
        divider.centerXM,
        (divider.minY + divider.maxY) / 2,
        (divider.minZ + divider.maxZ) / 2,
      );
      const normal = dragPlaneNormal(camera.position, planePoint, camDir.x);
      if (normal === null) {
        return null;
      }
      const plane = new THREE.Plane(normal, -normal.dot(planePoint));
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, intersection);
      if (hit === null || !Number.isFinite(intersection.x)) {
        return null;
      }
      return intersection.x;
    },
    [camera, gl],
  );

  const handlePointerOver = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>, index: number) => {
      if (!enabled || draggingIndex !== null) {
        return;
      }
      event.stopPropagation();
      setHoveredIndex(index);
    },
    [enabled, draggingIndex],
  );

  const handlePointerOut = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      if (!enabled || draggingIndex !== null) {
        return;
      }
      event.stopPropagation();
      setHoveredIndex(null);
    },
    [enabled, draggingIndex],
  );

  const handlePointerDown = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>, index: number) => {
      if (!enabled || dragStartRef.current !== null) {
        return;
      }
      event.stopPropagation();

      const divider = dividers[index];
      if (!divider) {
        return;
      }
      const worldX = getWorldXFromPointer(
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
        divider,
      );
      // Vista lateral o proyección inválida: no arrancar.
      if (worldX === null) {
        return;
      }
      try {
        gl.domElement.setPointerCapture(event.nativeEvent.pointerId);
      } catch {
        // Sin captura disponible: el gesto sigue con el
        // puntero sobre el lienzo.
      }
      guardRef.current?.disable();
      dragStartRef.current = {
        startWorldX: worldX,
        startConfig: config,
        separatorIndex: index,
        pointerId: event.nativeEvent.pointerId,
      };
      lastResultRef.current = null;
      setDraggingIndex(index);
      setHoveredIndex(null);
      onDragStart(index);
    },
    [config, enabled, dividers, getWorldXFromPointer, gl, onDragStart],
  );

  const handlePointerMove = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      const start = dragStartRef.current;
      if (start === null || !enabled) {
        return;
      }
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      const divider = dividers[start.separatorIndex];
      if (!divider) {
        return;
      }
      const worldX = getWorldXFromPointer(
        event.nativeEvent.clientX,
        event.nativeEvent.clientY,
        divider,
      );
      if (worldX === null) {
        return;
      }
      const deltaMm = (worldX - start.startWorldX) * 1000;
      if (!Number.isFinite(deltaMm)) {
        return;
      }
      const result = computeDragResult(
        geometry,
        start.startConfig,
        start.separatorIndex,
        deltaMm,
        dragMode,
        true,
      );
      if (result.changed) {
        lastResultRef.current = result;
        onDragMove(result);
      }
    },
    [geometry, enabled, dragMode, dividers, getWorldXFromPointer, onDragMove],
  );

  const handlePointerUp = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      if (dragStartRef.current === null) {
        return;
      }
      event.stopPropagation();
      // La confirmación es el último resultado con cambio;
      // si el puntero no se movió, `changed: false`.
      const start = dragStartRef.current;
      const commit: SeparatorDragResult = lastResultRef.current ?? {
        config: start.startConfig,
        appliedDeltaMm: 0,
        minDeltaMm: 0,
        maxDeltaMm: 0,
        clamped: false,
        leftWidthMm: 0,
        rightWidthMm: 0,
        changed: false,
      };
      finishGesture(commit);
    },
    [finishGesture],
  );

  // Escape cancela y restaura la configuración inicial exacta.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragStartRef.current !== null) {
        event.preventDefault();
        cancelGesture();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cancelGesture]);

  // Pérdida de foco de la ventana: cancelar como pointercancel.
  useEffect(() => {
    const handleBlur = () => {
      if (dragStartRef.current !== null) {
        cancelGesture();
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, [cancelGesture]);

  // Si se desactiva a mitad de gesto o se desmonta, restaurar todo.
  useEffect(() => {
    if (!enabled && dragStartRef.current !== null) {
      cancelGesture();
    }
  }, [enabled, cancelGesture]);
  useEffect(() => {
    const guard = guardRef.current;
    return () => {
      if (dragStartRef.current !== null) {
        dragStartRef.current = null;
        lastResultRef.current = null;
      }
      guard?.restore();
    };
  }, []);

  return (
    <group>
      {dividers.map((divider) => {
        const isHovered = hoveredIndex === divider.index && draggingIndex === null;
        const isDragging = draggingIndex === divider.index;

        return (
          <group key={divider.panelId}>
            {/* Área de agarre: siempre raycasteable (invisible en reposo). */}
            <mesh
              geometry={new THREE.BoxGeometry(
                0.03,
                (divider.maxY - divider.minY) * 1.1,
                (divider.maxZ - divider.minZ) + 0.1,
              )}
              material={new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: isHovered || isDragging ? 0.15 : 0,
                color: '#2f6feb',
                depthTest: false,
              })}
              position={[
                divider.centerXM,
                (divider.minY + divider.maxY) / 2,
                (divider.minZ + divider.maxZ) / 2,
              ]}
              onPointerOver={(e) => handlePointerOver(e as never, divider.index)}
              onPointerOut={handlePointerOut}
              onPointerDown={(e) => handlePointerDown(e as never, divider.index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={cancelGesture}
              onLostPointerCapture={cancelGesture}
            />
            {(isHovered || isDragging) && (
              <group position={[divider.centerXM, 0, (divider.minZ + divider.maxZ) / 2]}>
                <mesh
                  geometry={new THREE.CylinderGeometry(0.004, 0.004, divider.maxY - divider.minY, 8, 1, true)}
                  material={new THREE.MeshBasicMaterial({
                    color: '#2f6feb',
                    transparent: true,
                    opacity: 0.6,
                    depthTest: false,
                  })}
                  position={[0, (divider.minY + divider.maxY) / 2, 0]}
                  raycast={() => null}
                />
                <mesh
                  geometry={new THREE.CylinderGeometry(0.012, 0.012, 0.04, 12)}
                  material={new THREE.MeshBasicMaterial({
                    color: '#2f6feb',
                    transparent: true,
                    opacity: 0.8,
                    depthTest: false,
                  })}
                  position={[0, divider.maxY + 0.02, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  raycast={() => null}
                />
                <mesh
                  geometry={new THREE.CylinderGeometry(0.012, 0.012, 0.04, 12)}
                  material={new THREE.MeshBasicMaterial({
                    color: '#2f6feb',
                    transparent: true,
                    opacity: 0.8,
                    depthTest: false,
                  })}
                  position={[0, divider.minY - 0.02, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  raycast={() => null}
                />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
