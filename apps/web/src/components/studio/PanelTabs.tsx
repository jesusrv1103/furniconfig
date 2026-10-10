import type { KeyboardEvent } from 'react';
import {
  CONFIG_TAB_IDS,
  CONFIG_TAB_LABELS,
  nextTabOnArrowKey,
  type ConfigTabId,
} from '../../lib/studio/tabs.js';

/**
 * Barra de pestañas del panel de configuración (Fase 3E).
 *
 * Patrón accesible WAI-ARIA de pestañas: `role="tablist"`
 * con teclado (flechas circulan, Home/End saltan al
 * extremo), `aria-selected` por pestaña y roving
 * `tabIndex` (solo la pestaña activa entra en el orden de
 * tabulación). Los paneles asociados usan
 * `role="tabpanel"` + `aria-labelledby`/`aria-controls`
 * con los mismos ids.
 */
export function ConfigTabList({
  active,
  onChange,
}: {
  /** Pestaña activa. */
  active: ConfigTabId;
  /** Cambia la pestaña activa. */
  onChange: (tab: ConfigTabId) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextTabOnArrowKey(active, event.key);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onChange(next);
    // Tras el repintado, el foco sigue a la pestaña nueva
    // (la navegación por teclado encadena).
    requestAnimationFrame(() => {
      document.getElementById(`config-tab-${next}`)?.focus();
    });
  };

  return (
    <div
      className="config-tabs"
      role="tablist"
      aria-label="Categorías de edición"
      data-config-tabs
      onKeyDown={handleKeyDown}
    >
      {CONFIG_TAB_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`config-tab-${id}`}
          data-config-tab={id}
          aria-selected={active === id}
          aria-controls={`config-panel-${id}`}
          tabIndex={active === id ? 0 : -1}
          onClick={() => onChange(id)}
        >
          {CONFIG_TAB_LABELS[id]}
        </button>
      ))}
    </div>
  );
}
