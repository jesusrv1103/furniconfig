import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { DEFAULT_CONFIG } from '../src/lib/config.js';
import { SeparatorKeyboardControls } from '../src/components/SeparatorKeyboardControls.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** React inserta `<!-- -->` entre segmentos de texto en SSR. */
function text(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

const geometry = deepFreeze(calculateGeometry(DEFAULT_CONFIG));
const noop = () => {};

function controlsHtml(dragMode: 'precise1' | 'step10' = 'precise1'): string {
  return renderToString(
    <SeparatorKeyboardControls
      geometry={geometry}
      config={DEFAULT_CONFIG}
      dragMode={dragMode}
      onMove={noop}
      onEnd={noop}
    />,
  );
}

describe('SeparatorKeyboardControls (accesibilidad Fase 3F.2)', () => {
  it('expone un grupo por separador con botones −/+ etiquetados', () => {
    const html = controlsHtml();
    // 3 módulos → 2 separadores.
    expect(html).toContain('data-separator-controls="2"');
    expect(html).toContain('data-separator-index="0"');
    expect(html).toContain('data-separator-index="1"');
    expect(html).toContain('data-separator-dec="0"');
    expect(html).toContain('data-separator-inc="0"');
    expect(html).toContain('data-separator-dec="1"');
    expect(html).toContain('data-separator-inc="1"');
    expect(html).toContain('Reducir separador 1 en 1 milímetros');
    expect(html).toContain('Aumentar separador 2 en 1 milímetros');
  });

  it('muestra valores actuales y rango del motor', () => {
    const plain = text(controlsHtml());
    // DEFAULT_CONFIG: 3 módulos automáticos de 776 mm.
    expect(plain).toContain('776 mm');
    expect(plain).toContain('rango');
  });

  it('el paso configurable se refleja en etiquetas y ayuda', () => {
    const plain = text(controlsHtml('step10'));
    expect(plain).toContain('paso 10 mm');
    expect(plain).toContain('Reducir separador 1 en 10 milímetros');
  });

  it('documenta Escape y los límites', () => {
    const plain = text(controlsHtml());
    expect(plain).toContain('Escape');
    expect(plain).toContain('límites');
  });

  it('los botones son elementos button reales (foco por Tab)', () => {
    const html = controlsHtml();
    const buttons = html.match(/<button/g) ?? [];
    // 2 separadores × 2 botones.
    expect(buttons.length).toBe(4);
  });
});
