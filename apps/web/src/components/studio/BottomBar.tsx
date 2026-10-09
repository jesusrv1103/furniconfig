import { WARDROBE_CONFIG_SCHEMA_VERSION } from '@furniconfig/geometry-core';
import { formatMm } from '../../lib/units.js';
import type { SaveState } from './TopBar.js';

/**
 * Barra inferior del Studio (Fase 3C): información
 * relevante sin saturar — dimensiones generales, número
 * de módulos, estado de validación y estado de guardado.
 */

export interface BottomBarProps {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  moduleCount: number;
  /** `true` si la configuración pasa validación y cálculo. */
  valid: boolean;
  /** Cantidad de problemas de validación (0 si es válida). */
  issueCount: number;
  saveState: SaveState;
}

const SAVE_STATE_LABELS: Readonly<Record<SaveState, string>> = {
  dirty: 'Cambios sin guardar',
  clean: 'Guardado',
  none: 'Sin diseño activo',
};

export function BottomBar({
  widthMm,
  heightMm,
  depthMm,
  moduleCount,
  valid,
  issueCount,
  saveState,
}: BottomBarProps) {
  return (
    <footer className="app-footer studio-bottombar">
      <span className="bottombar-item" data-bottombar="dimensions">
        {formatMm(widthMm).replace(' mm', '')} × {formatMm(heightMm).replace(' mm', '')} ×{' '}
        {formatMm(depthMm).replace(' mm', '')} mm
      </span>
      <span className="bottombar-item" data-bottombar="modules">
        {moduleCount} {moduleCount === 1 ? 'módulo' : 'módulos'}
      </span>
      <span
        className="bottombar-item"
        data-bottombar="validation"
        data-valid={valid ? 'true' : 'false'}
      >
        {valid
          ? 'Configuración válida'
          : `${issueCount} ${issueCount === 1 ? 'error' : 'errores'} de validación`}
      </span>
      <span
        className="bottombar-item"
        data-bottombar="save"
        data-save-state={saveState}
      >
        {SAVE_STATE_LABELS[saveState]}
      </span>
      <span className="chip bottombar-item">Contrato v{WARDROBE_CONFIG_SCHEMA_VERSION}</span>
      <span className="bottombar-note bottombar-item">
        Unidad interna: milímetros · Motor @furniconfig/geometry-core ·
        Cotas provisionales: validar con carpintería
      </span>
    </footer>
  );
}
