/**
 * FASE-4C-A — pantalla del modelador 3D (ruta `#/modeler`).
 *
 * Composición:
 *
 * - `ModelerShell`: chrome (barra, panel lateral, estados) —
 *   marcado puro testeable con `renderToString`.
 * - `ModelerScene`: Canvas R3F con rejilla/ejes/vistas.
 *
 * Documento (§5): UN `SceneDocument` v1 vacío creado con
 * `createEmptySceneDocument()` y verificado con
 * `validateSceneDocument()`; estado INMUTABLE (el objeto se
 * congela de fábrica y no se muta nunca). En 4C-C este estado
 * se sustituirá por el `present` de un `CommandHistory`
 * (mismo `SceneDocument`, otro contenedor): el seam es este
 * `useMemo`, no hay edición en esta fase.
 *
 * Motor geométrico (§6): `useModelerGeometry` mantiene el
 * estado `idle` — abrir la pantalla NO crea el Worker ni
 * calcula Manifold; la escena vacía no lo necesita.
 */

import { useCallback, useMemo, useState } from 'react';

import {
  createEmptySceneDocument,
  validateSceneDocument,
} from '@furniconfig/modeler-core';

import { useModelerGeometry } from '../../hooks/use-modeler-geometry.js';
import {
  createCameraControlsState,
  requestFit,
  requestView,
  type ModelerCameraControlsState,
} from '../../lib/modeler/camera-controls.js';
import type { CameraView } from '../../lib/camera-views.js';
import { ModelerScene } from './ModelerScene.js';
import { ModelerShell } from './ModelerShell.js';
import './modeler.css';

export function ModelerApp() {
  // Documento único e inmutable de la sesión (v1, vacío).
  const document = useMemo(() => createEmptySceneDocument(), []);
  const validation = useMemo(
    () => validateSceneDocument(document),
    [document],
  );

  const geometry = useModelerGeometry();
  const [camera, setCamera] = useState<ModelerCameraControlsState>(
    createCameraControlsState,
  );

  const handleViewChange = useCallback((view: CameraView) => {
    setCamera((current) => requestView(current, view));
  }, []);

  const handleFit = useCallback(() => {
    setCamera((current) => requestFit(current));
  }, []);

  // `createEmptySceneDocument` valida internamente y congela;
  // la doble validación aquí es la garantía del contrato.
  if (!validation.ok) {
    // Estado imposible en 4C-A: si el documento creado no
    // valida, la pantalla lo dice en lugar de fingir normalidad.
    return (
      <div className="modeler-root modeler-root--error" data-modeler="">
        <p role="alert">
          El documento de escena no es válido:{' '}
          {validation.errors.map((issue) => issue.message).join('; ')}
        </p>
        <a href="#/">Volver al configurador</a>
      </div>
    );
  }

  const info = {
    name: document.name,
    objectCount: document.objects.length,
    gridStepMm: document.gridStepMm,
  };

  return (
    <ModelerShell
      document={info}
      engineStatus={geometry.status}
      view={camera.view}
      onViewChange={handleViewChange}
      onFit={handleFit}
    >
      <ModelerScene viewRequest={camera.request} />
    </ModelerShell>
  );
}
