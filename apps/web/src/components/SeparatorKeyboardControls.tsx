/**
 * Controles de separadores por teclado (Fase 3F.2).
 *
 * Alternativa DOM accesible al arrastre con puntero: cada
 * separador es un grupo enfocable con botones −/+ y atajos
 * de flechas. Reutiliza `computeDragResult` (la misma
 * geometría y los mismos límites que el arrastre 3D): no
 * hay segunda implementación de cálculos.
 */

import { useCallback } from 'react';
import type {
  GeometryResult,
  WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  computeDragResult,
  type DragMode,
  type SeparatorDragResult,
} from '../lib/studio/separators.js';
import { formatMm } from '../lib/units.js';

interface SeparatorKeyboardControlsProps {
  geometry: GeometryResult;
  config: WardrobeConfig;
  dragMode: DragMode;
  onMove: (result: SeparatorDragResult) => void;
  onEnd: (result: SeparatorDragResult) => void;
}

export function SeparatorKeyboardControls({
  geometry,
  config,
  dragMode,
  onMove,
  onEnd,
}: SeparatorKeyboardControlsProps) {
  const stepMm = dragMode === 'step10' ? 10 : 1;
  const separatorCount = Math.max(geometry.wardrobe.modules.length - 1, 0);

  const adjust = useCallback(
    (separatorIndex: number, direction: 1 | -1) => {
      const result = computeDragResult(
        geometry,
        config,
        separatorIndex,
        direction * stepMm,
        dragMode,
        true,
      );
      if (result.changed) {
        // Una pulsación = una operación: preview + confirmación
        // inmediata (coherente con Undo/Redo del editor).
        onMove(result);
        onEnd(result);
      }
      return result;
    },
    [geometry, config, dragMode, stepMm, onMove, onEnd],
  );

  const handleGroupKeyDown = useCallback(
    (event: React.KeyboardEvent, separatorIndex: number) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      // Evita que las flechas desplacen la página con el control enfocado.
      event.preventDefault();
      event.stopPropagation();
      adjust(separatorIndex, event.key === 'ArrowRight' ? 1 : -1);
    },
    [adjust],
  );

  if (separatorCount === 0) {
    return null;
  }

  return (
    <fieldset
      className="separator-controls"
      data-separator-controls={separatorCount}
    >
      <legend>Separadores (teclado)</legend>
      <p className="separator-controls-hint">
        Ajusta cada división con los botones o con las flechas
        del teclado (paso {stepMm} mm). Escape cancela el
        arrastre con puntero; los límites del motor se aplican
        automáticamente.
      </p>
      {Array.from({ length: separatorCount }, (_, separatorIndex) => {
        const probe = computeDragResult(
          geometry,
          config,
          separatorIndex,
          0,
          dragMode,
          true,
        );
        const atMin = probe.minDeltaMm >= 0;
        const atMax = probe.maxDeltaMm <= 0;
        return (
          <div
            key={separatorIndex}
            className="separator-control"
            data-separator-index={separatorIndex}
            onKeyDown={(event) => handleGroupKeyDown(event, separatorIndex)}
          >
            <span
              className="separator-control-label"
              data-separator-readout={separatorIndex}
            >
              Separador {separatorIndex + 1}: módulo {separatorIndex + 1}{' '}
              {formatMm(probe.leftWidthMm)} ↔ módulo {separatorIndex + 2}{' '}
              {formatMm(probe.rightWidthMm)} (rango {probe.minDeltaMm}…
              {probe.maxDeltaMm} mm)
            </span>
            <div className="separator-control-buttons">
              <button
                type="button"
                data-separator-dec={separatorIndex}
                disabled={atMin}
                aria-label={`Reducir separador ${separatorIndex + 1} en ${stepMm} milímetros`}
                title={atMin ? 'Límite mínimo alcanzado' : undefined}
                onClick={() => adjust(separatorIndex, -1)}
              >
                −
              </button>
              <button
                type="button"
                data-separator-inc={separatorIndex}
                disabled={atMax}
                aria-label={`Aumentar separador ${separatorIndex + 1} en ${stepMm} milímetros`}
                title={atMax ? 'Límite máximo alcanzado' : undefined}
                onClick={() => adjust(separatorIndex, 1)}
              >
                +
              </button>
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
