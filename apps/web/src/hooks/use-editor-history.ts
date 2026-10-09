import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WardrobeConfig } from '@furniconfig/geometry-core';
import {
  canRedo,
  canUndo,
  commitEditorHistory,
  createEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorHistory,
} from '../lib/studio/history.js';

export interface EditorHistoryApi {
  /** Configuración vigente (= `history.present`). */
  config: WardrobeConfig;
  /** Aplica una edición del usuario (registra un paso). */
  update(updater: (current: WardrobeConfig) => WardrobeConfig): void;
  /** Reemplaza el estado SIN registrar paso (abrir proyecto, restaurar sesión). */
  resetTo(config: WardrobeConfig): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * Historial de deshacer/rehacer del editor.
 *
 * - `config` es el estado presente del historial: los
 *   cambios del editor pasan siempre por `update`
 *   (registran paso) o `resetTo` (reinicio limpio).
 * - Los cambios EXTERNOS de proyecto (hidratación de la
 *   sesión 3B, abrir diseño, nuevo proyecto) llegan vía
 *   `resetTo`: reinician el historial y no lo contaminan.
 * - Atajos de teclado: Ctrl/Cmd+Z (deshacer),
 *   Ctrl/Cmd+Shift+Z o Ctrl/Cmd+Y (rehacer). Dentro de
 *   campos de formulario se deja actuar al deshacer
 *   nativo del navegador.
 */
export function useEditorHistory(
  initialConfig: WardrobeConfig,
): EditorHistoryApi {
  const [history, setHistory] = useState<EditorHistory>(() =>
    createEditorHistory(initialConfig),
  );

  const update = useCallback((updater: (current: WardrobeConfig) => WardrobeConfig) => {
    setHistory((previous) => commitEditorHistory(previous, updater(previous.present)));
  }, []);

  const resetTo = useCallback((config: WardrobeConfig) => {
    setHistory(createEditorHistory(config));
  }, []);

  const undo = useCallback(() => {
    setHistory((previous) => undoEditorHistory(previous));
  }, []);

  const redo = useCallback(() => {
    setHistory((previous) => redoEditorHistory(previous));
  }, []);

  // Los flags para render se derivan; la pasarela de
  // eventos necesita la referencia viva para los atajos.
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      const key = event.key.toLowerCase();
      const isUndo = key === 'z' && !event.shiftKey;
      const isRedo = key === 'y' || (key === 'z' && event.shiftKey);
      if (!isUndo && !isRedo) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return; // deshacer nativo del campo de texto
      }
      const current = historyRef.current;
      if (isUndo && canUndo(current)) {
        event.preventDefault();
        setHistory((previous) => undoEditorHistory(previous));
      } else if (isRedo && canRedo(current)) {
        event.preventDefault();
        setHistory((previous) => redoEditorHistory(previous));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const api = useMemo<EditorHistoryApi>(
    () => ({
      config: history.present,
      update,
      resetTo,
      undo,
      redo,
      canUndo: canUndo(history),
      canRedo: canRedo(history),
    }),
    [history, update, resetTo, undo, redo],
  );

  return api;
}
