/**
 * Componente de arrastre de separadores (Fase 3F.2).
 *
 * Renderiza un indicador visual sobre la división entre dos
 * módulos y gestiona el arrastre con pointer events.
 * Usa capture de puntero para robustez.
 */

import * as THREE from 'three';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { computeDragResult, type SeparatorDragResult } from '../lib/studio/separators.js';
import type { GeometryResult } from '@furniconfig/geometry-core';
import type { WardrobeConfig } from '@furniconfig/geometry-core';

interface DividerInfo {
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
        const halfY = panel.sizeMm.y / 2000;
        const halfZ = panel.sizeMm.z / 2000;
        const centerXM = panel.positionMm.x / 1000 + panel.sizeMm.x / 2000;
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

interface DividerDragHandleProps {
  geometry: GeometryResult;
  config: WardrobeConfig;
  onDragStart: (separatorIndex: number) => void;
  onDragMove: (result: SeparatorDragResult) => void;
  onDragEnd: (result: SeparatorDragResult) => void;
  dragMode: 'precise1' | 'step10';
  enabled: boolean;
}

export function DividerDragHandle({
  geometry,
  config,
  onDragStart,
  onDragMove,
  onDragEnd,
  dragMode,
  enabled = true,
}: DividerDragHandleProps) {
  const { camera, gl } = useThree();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    startWorldX: number;
    startConfig: WardrobeConfig;
    separatorIndex: number;
  } | null>(null);

  const dividers = useMemo(() => extractDividers(geometry), [geometry]);

  const getWorldXFromPointer = useCallback(
    (pointerX: number, pointerY: number): number | null => {
      const rect = gl.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((pointerX - rect.left) / rect.width) * 2 - 1,
        -((pointerY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        return intersection.x;
      }
      return null;
    },
    [camera, gl],
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

      const worldX = getWorldXFromPointer(event.nativeEvent.clientX, event.nativeEvent.clientY);
      if (worldX === null) return;

      const target = event.currentTarget as HTMLElement;
      if (target) target.setPointerCapture(event.nativeEvent.pointerId);

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
    [config, enabled, getWorldXFromPointer, onDragStart],
  );

  const handlePointerMove = useCallback(
    (event: import('@react-three/fiber').ThreeEvent<PointerEvent>) => {
      if (dragStartRef.current === null || !enabled) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();

      const worldX = getWorldXFromPointer(event.nativeEvent.clientX, event.nativeEvent.clientY);
      if (worldX === null || dragStartRef.current === null) return;

      const deltaM = worldX - dragStartRef.current.startWorldX;
      const deltaMm = deltaM * 1000;

      const result = computeDragResult(
        geometry,
        dragStartRef.current.startConfig,
        dragStartRef.current.separatorIndex,
        deltaMm,
        'precise1',
        true,
      );

      if (result.changed) {
        onDragMove(result);
      }
    },
    [geometry, enabled, onDragMove],
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
        'precise1',
        true,
      );

      onDragEnd(result);
      dragStartRef.current = null;
      setDraggingIndex(null);
    },
    [geometry, onDragEnd],
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
  }, [onDragEnd]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dragStartRef.current !== null) {
        handlePointerCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePointerCancel]);

  return (
    <group>
      {dividers.map((divider) => {
        const isHovered = hoveredIndex === divider.index && draggingIndex === null;
        const isDragging = draggingIndex === divider.index;

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
                opacity: isHovered || isDragging ? 0.15 : 0,
                color: isDragging ? '#2f6feb' : '#2f6feb',
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
              raycast={(isHovered || isDragging) ? undefined : () => null}
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
}