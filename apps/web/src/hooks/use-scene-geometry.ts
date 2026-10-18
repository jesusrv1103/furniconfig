/**
 * FASE-4C-B, B4 — hook de derivación de geometría de escena.
 *
 * Enlace React fino sobre `SceneGeometryCoordinator` (toda la
 * lógica asíncrona vive en la clase pura, testeable con kernels
 * falsos; aquí solo se adapta el ciclo de vida):
 *
 * - El coordinador se crea DENTRO del efecto y se dispone en la
 *   limpieza (patrón de `useModelerGeometry`: con `StrictMode`
 *   queda uno vivo y los resultados tardíos se ignoran).
 * - `ensureKernel` se toma del runtime de 4C-A: el Worker solo
 *   se crea cuando el coordinador recibe un documento con
 *   sólidos (escena vacía → jamás se invoca).
 * - El estado `restarting` del runtime se traduce en
 *   reconstrucción total del servicio; la primera publicación
 *   posterior invoca `runtime.notifyReady()` vía `onRecovered`
 *   (sin sondeos ni temporizadores).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SceneDocument } from '@furniconfig/modeler-core';

import type { UseModelerGeometry } from './use-modeler-geometry.js';
import {
  SceneGeometryCoordinator,
  type SceneGeometryCoordinatorStats,
  type SolidGeometryState,
} from '../lib/modeler/scene-geometry-coordinator.js';

export interface UseSceneGeometry {
  /** Mapa objectId → estado de su derivación (inmutable). */
  readonly states: ReadonlyMap<string, SolidGeometryState>;
  /** Métricas de depuración (revisión, publicados, obsoletos). */
  readonly stats: SceneGeometryCoordinatorStats;
  /** Reintento de un objeto en error (o del arranque del motor). */
  readonly retry: (objectId: string) => void;
}

/**
 * El runtime del motor se inyecta (`geometry`) en lugar de
 * invocarse de nuevo: React no comparte hooks, y una segunda
 * llamada a `useModelerGeometry` crearía UN SEGUNDO runtime (y
 * potencialmente un segundo Worker).
 */
export function useSceneGeometry(
  document: SceneDocument,
  geometry: UseModelerGeometry,
): UseSceneGeometry {
  const { status, ensureKernel, notifyReady } = geometry;
  const coordinatorRef = useRef<SceneGeometryCoordinator | null>(null);
  const [states, setStates] = useState<
    ReadonlyMap<string, SolidGeometryState>
  >(() => new Map());
  const [stats, setStats] = useState<SceneGeometryCoordinatorStats>({
    revision: 0,
    published: 0,
    droppedStale: 0,
    service: null,
  });

  useEffect(() => {
    const coordinator = new SceneGeometryCoordinator({
      ensureKernel,
      onChange: (next) => {
        setStates(next);
        setStats(coordinator.stats);
      },
      onRecovered: () => {
        // El worker volvió a producir: el runtime puede salir de
        // `restarting` (lee el runtime vigente en el momento de
        // la llamada, seguro con StrictMode).
        notifyReady();
      },
    });
    coordinatorRef.current = coordinator;
    return () => {
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
    // `ensureKernel` y `notifyReady` son estables (useCallback).
  }, [ensureKernel, notifyReady]);

  useEffect(() => {
    coordinatorRef.current?.setDocument(document);
  }, [document]);

  useEffect(() => {
    coordinatorRef.current?.notifyEngineStatus(status);
  }, [status]);

  const retry = useCallback((objectId: string) => {
    coordinatorRef.current?.retry(objectId);
  }, []);

  return { states, stats, retry };
}
