/**
 * Componente de arrastre de separadores (Fase 3F.2).
 *
 * Renderiza un indicador visual sobre la división entre dos
 * módulos y gestiona el arrastre con pointer events y teclado.
 * Usa capture de puntero para robustez y desactiva OrbitControls
 * durante el arrastre.
 */

import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { computeDragResult, type SeparatorDragResult } from '../lib/studio/separators.js';
import type { GeometryResult } from '@furniconfig/geometry-core';
import type { WardrobeConfig } from '@furniconfig/geometry-core';

type OrbitControlsRef = CameraControls;

interface DividerInfo {
  index: number;
  panelId: string;
  centerXM: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  /** Normal del plano de interacción (siempre apunta en +X para divisores verticales). */
  normal: THREE.Vector3;
  /** Punto en el plano (centro del divisor). */
  planePoint: THREE.Vector3;
}

export function extractDividers(geometry: GeometryResult): DividerInfo[] {
  const dividers: DividerInfo[] = [];
  for (const panel of geometry.panels) {
    if (panel.role === 'divider' && panel.id.startsWith('panel-divider-')) {
      const indexStr = panel.id.replace('panel-divider-', '');
      const index = parseInt(indexStr, 10) - 1;
      if (!Number.isNaN(index)) {
        const halfY = panel.sizeMm.y / 2000;
        const halfZ = panel.sizeMm.z / 2000;
        const centerXM = panel.positionMm.x / 1000 + panel.sizeMm.x / 2000;
        const centerYM = panel.positionMm.y / 1000 + panel.sizeMm.y / 2000;
        const centerZM = panel.positionMm.z / 1000 + panel.sizeMm.z / 2000;
        dividers.push({
          index,
          panelId: panel.id,
          centerXM,
          minY: centerYM - panel.sizeMm.y / 2000,
          maxY: centerYM + panel.sizeMm.y / 2000,
          minZ: centerZM - panel.sizeMm.z / 2000,
          maxZ: centerZM + panel.sizeMm.z / 2000,
          normal: new THREE.Vector3(1, 0, 0),
          planePoint: new THREE.Vector3(
            panel.positionMm.x / 1000 + panel.sizeMm.x / 2000,
            panel.positionMm.y / 1000 + panel.sizeMm.y / 2000,
            panel.positionMm.z / 1000 + panel.sizeMm.z / 2000
          ),
        });
      }
    }
  }
  dividers.sort((a, b) => a.index - b.index);
  return dividers;
}

interface DividerDragHandleProps {
  geometry: GeometryResult;
  config: WardrobeConfig;
  onDragStart: (separatorIndex: number) => void;
  onDragMove: (result: SeparatorDragResult) => void;
  onDragEnd: (result: SeparatorDragResult) => void;
  dragMode: 'precise1' | 'step10';
  enabled: boolean;
  /** Referencia a OrbitControls para desactivar/activar durante arrastre. */
  orbitControlsRef?: React.RefObject<CameraControls | null>;
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
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    startWorldX: number;
    startConfig: WardrobeConfig;
    separatorIndex: number;
  } | null>(null);

  const dividers = useMemo(() => extractDividers(geometry), [geometry]);

  // Convertir coordenadas de puntero a mundo X usando un plano vertical alineado con el divisor
  const getWorldXFromPointer = useCallback(
    (pointerX: number, pointerY: number, divider: DividerInfo): number | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((pointerX - rect.left) / rect.width) * 2 - 1,
        -((pointerY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      // Plano vertical que pasa por el centro del divisor, normal +X
      const plane = new THREE.Plane(divider.normal, -divider.normal.dot(divider.planePoint));
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        return intersection.x;
      }
      return null;
    },
    [camera, gl],
  );

  // Desactivar/activar OrbitControls
  const setOrbitControlsEnabled = useCallback(
    (enabled: boolean) => {
      if (orbitControlsRef?.current) {
        orbitControlsRef.current.enabled = enabled;
      }
    },
    [orbitControlsRef],
  );

  const handlePointerOver = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>, index: number) => {
      if (!enabled || draggingIndex !== null) return;
      event.stopPropagation();
      setHoveredIndex(index);
    },
    [enabled, draggingIndex],
  );

  const handlePointerOut = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      if (!enabled || draggingIndex !== null) return;
      event.stopPropagation();
      setHoveredIndex(null);
    },
    [enabled, draggingIndex],
  );

  const handlePointerDown = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>, index: number) => {
      if (!enabled) return;
      event.stopPropagation();

      const divider = dividers[index];
      if (!divider) return;

      const worldX = getWorldXFromPointer(event.nativeEvent.clientX, event.nativeEvent.clientY, divider);
      if (worldX === null) return;

      const target = event.currentTarget as HTMLElement;
      if (target) target.setPointerCapture(event.nativeEvent.pointerId);

      // Desactivar OrbitControls durante el arrastre
      setOrbitControlsEnabled(false);

      dragStartRef.current = {
        pointerX: event.nativeEvent.clientX,
        startWorldX: worldX,
        startConfig: config,
        separatorIndex: index,
      };
      setDraggingIndex(index);
      setHoveredIndex(null);
      onDragStart(index);
    },
    [config, enabled, dividers, getWorldXFromPointer, onDragStart, setOrbitControlsEnabled],
  );

  const handlePointerMove = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      if (dragStartRef.current === null || !enabled) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      const divider = dividers[dragStartRef.current.separatorIndex];
      if (!divider) return;

      const worldX = getWorldXFromPointer(event.nativeEvent.clientX, event.nativeEvent.clientY, divider);
      if (worldX === null || dragStartRef.current === null) return;

      const deltaM = worldX - dragStartRef.current.startWorldX;
      const deltaMm = deltaM * 1000;

      const result = computeDragResult(
        geometry,
        dragStartRef.current.startConfig,
        dragStartRef.current.separatorIndex,
        deltaMm,
        dragMode,
        true,
      );

      if (result.changed) {
        onDragMove(result);
      }
    },
    [geometry, enabled, dragMode, dividers, getWorldXFromPointer, onDragMove],
  );

  const handlePointerUp = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      if (dragStartRef.current === null) return;
      event.stopPropagation();

      const result = computeDragResult(
        geometry,
        dragStartRef.current.startConfig,
        dragStartRef.current.separatorIndex,
        0,
        dragMode,
        true,
      );

      onDragEnd(result);
      dragStartRef.current = null;
      setDraggingIndex(null);
      // Reactivar OrbitControls
      setOrbitControlsEnabled(true);
    },
    [geometry, dragMode, onDragEnd, setOrbitControlsEnabled],
  );

  const handlePointerCancel = useCallback(() => {
    if (dragStartRef.current === null) return;
    onDragEnd({
      config: dragStartRef.current.startConfig,
      appliedDeltaMm: 0,
      minDeltaMm: 0,
      maxDeltaMm: 0,
      clamped: false,
      leftWidthMm: 0,
      rightWidthMm: 0,
      changed: false,
    });
    dragStartRef.current = null;
    setDraggingIndex(null);
    // Reactivar OrbitControls
    setOrbitControlsEnabled(true);
  }, [onDragEnd, setOrbitControlsEnabled]);

  // Tecla Escape para cancelar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragStartRef.current !== null) {
        handlePointerCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePointerCancel]);

  // Navegación por teclado (foco + flechas) - usando keydown en window
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (focusedIndex === null || draggingIndex !== null || !enabled) return;

      const divider = dividers[focusedIndex];
      if (!divider) return;

      const step = dragMode === 'step10' ? 10 : 1;
      let deltaMm = 0;

      switch (event.key) {
        case 'ArrowRight':
          deltaMm = step;
          break;
        case 'ArrowLeft':
          deltaMm = -step;
          break;
        default:
          return;
      }

      event.preventDefault();
      event.stopPropagation();

      const result = computeDragResult(
        geometry,
        config,
        focusedIndex,
        deltaMm,
        dragMode,
        true,
      );

      if (result.changed) {
        onDragMove(result);
        // Para teclado, aplicamos y confirmamos inmediatamente (una entrada por pulsación)
        onDragEnd(result);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, draggingIndex, enabled, dragMode, geometry, config, onDragMove, onDragEnd]);

  // Tecla Escape para cancelar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragStartRef.current !== null) {
        handlePointerCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePointerCancel]);

  const handleFocus = useCallback(
    (index: number) => {
      if (!enabled) return;
      setFocusedIndex(index);
    },
    [enabled],
  );

  const handleBlur = useCallback(() => {
    setFocusedIndex(null);
  }, []);

  return (
    <group>
      {dividers.map((divider) => {
        const isHovered = hoveredIndex === divider.index && draggingIndex === null;
        const isDragging = draggingIndex === divider.index;
        const isFocused = focusedIndex === divider.index;

        return (
          <group key={divider.panelId}>
            <mesh
              geometry={new THREE.BoxGeometry(
                0.03,
                (divider.maxY - divider.minY) * 1.1,
                (divider.maxZ - divider.minZ) + 0.1,
              )}
              material={new THREE.MeshBasicMaterial({
                transparent: true,
                opacity: isHovered || isDragging || isFocused ? 0.15 : 0,
                color: isDragging ? '#2f6feb' : isFocused ? '#1d4ed8' : '#2f6feb',
                depthTest: false,
              })}
              position={[
                divider.centerXM,
                (divider.minY + divider.maxY) / 2,
                (divider.minZ + divider.maxZ) / 2,
              ]}
              onPointerOver={(e) => handlePointerOver(e as any, divider.index)}
              onPointerOut={handlePointerOut}
              onPointerDown={(e) => handlePointerDown(e as any, divider.index)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onLostPointerCapture={handlePointerCancel}
              raycast={(isHovered || isDragging || isFocused) ? undefined : () => null}
            />
            {(isHovered || isDragging || isFocused) && (
              <group position={[divider.centerXM, 0, (divider.minZ + divider.maxZ) / 2]}>
                <mesh
                  geometry={new THREE.CylinderGeometry(0.004, 0.004, divider.maxY - divider.minY, 8, 1, true)}
                  material={new THREE.MeshBasicMaterial({
                    color: isFocused ? '#1d4ed8' : '#2f6feb',
                    transparent: true,
                    opacity: isFocused ? 0.8 : 0.6,
                    depthTest: false,
                  })}
                  position={[0, (divider.minY + divider.maxY) / 2, 0]}
                />
                <mesh
                  geometry={new THREE.CylinderGeometry(0.012, 0.012, 0.04, 12)}
                  material={new THREE.MeshBasicMaterial({
                    color: isFocused ? '#1d4ed8' : '#2f6feb',
                    transparent: true,
                    opacity: 0.8,
                    depthTest: false,
                  })}
                  position={[0, divider.maxY + 0.02, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                />
                <mesh
                  geometry={new THREE.CylinderGeometry(0.012, 0.012, 0.04, 12)}
                  material={new THREE.MeshBasicMaterial({
                    color: isFocused ? '#1d4ed8' : '#2f6feb',
                    transparent: true,
                    opacity: 0.8,
                    depthTest: false,
                  })}
                  position={[0, divider.minY - 0.02, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

interface DividerInfo {
  index: number;
  panelId: string;
  centerXM: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  normal: THREE.Vector3;
  planePoint: THREE.Vector3;
}