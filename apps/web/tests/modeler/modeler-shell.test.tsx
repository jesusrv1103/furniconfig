/**
 * FASE-4C-A §3, §7 y §8 — chrome del modelador (renderToString).
 *
 * Verifica: identidad "FurniConfig Modeler", enlace de vuelta
 * al configurador, indicadores de unidades/documento/estado
 * del motor, controles de vista funcionales (aria-pressed),
 * ausencia de botones inactivos en las secciones-reserva y
 * accesibilidad básica (roles, labels, secciones vinculadas).
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { ModelerShell } from '../../src/components/modeler/ModelerShell.js';
import type { ModelerShellProps } from '../../src/components/modeler/ModelerShell.js';

function renderShell(
  overrides: Partial<ModelerShellProps> = {},
): string {
  const props: ModelerShellProps = {
    document: { name: 'Escena sin título', objectCount: 0, gridStepMm: 10 },
    engineStatus: 'idle',
    view: 'isometric',
    onViewChange: () => undefined,
    onFit: () => undefined,
    children: <div data-testid="escena" />,
    ...overrides,
  };
  // React SSR marca los cortes de texto con `<!-- -->`.
  return renderToString(<ModelerShell {...props} />).replace(
    /<!-- -->/g,
    '',
  );
}

describe('ModelerShell (chrome del modelador)', () => {
  it('muestra la identidad y el badge de unidades mm', () => {
    const html = renderShell();
    expect(html).toContain('FurniConfig Modeler');
    expect(html).toContain('milímetros');
    expect(html).toMatch(/class="modeler-badge[^"]*"[^>]*>\s*mm\s*</);
  });

  it('el enlace de vuelta apunta al configurador (#/)', () => {
    const html = renderShell();
    expect(html).toContain('href="#/"');
    expect(html).toContain('Volver al configurador');
  });

  it('refleja el estado del documento (nombre, objetos y paso)', () => {
    const html = renderShell({
      document: { name: 'Taller', objectCount: 3, gridStepMm: 10 },
    });
    expect(html).toContain('Taller');
    expect(html).toContain('3 objetos');
    expect(html).toContain('paso de rejilla 10 mm');
  });

  it('estado del motor honesto: idle = en reposo, sin cálculos', () => {
    const html = renderShell({ engineStatus: 'idle' });
    expect(html).toContain('data-status="idle"');
    expect(html).toContain('en reposo (sin cálculos)');
    const ready = renderShell({ engineStatus: 'ready' });
    expect(ready).toContain('data-status="ready"');
  });

  it('los controles de vista reflejan la vista activa (aria-pressed)', () => {
    const html = renderShell({ view: 'front' });
    expect(html).toContain('Isométrica');
    expect(html).toContain('Frontal');
    expect(html).toContain('Lateral');
    expect(html).toContain('Ajustar');
    // Solo las3 vistas son toggles (aria-pressed): "Ajustar" es
    // una acción puntual y no lleva estado pulsado.
    const pressed = [...html.matchAll(/aria-pressed="(true|false)"/g)].map(
      (match) => match[1],
    );
    expect(pressed).toEqual(['false', 'true', 'false']);
  });

  it('las secciones-reserva NO contienen botones inactivos', () => {
    const html = renderShell();
    const toolsSection = html.slice(
      html.indexOf('data-modeler-tools-placeholder'),
      html.indexOf('data-modeler-props-placeholder'),
    );
    expect(toolsSection).not.toContain('<button');
    expect(html).toContain('Todavía no hay herramientas activas');
    // en total, SOLO los4 botones funcionales de vista
    expect((html.match(/<button/g) ?? []).length).toBe(4);
  });

  it('accesibilidad básica: landmarks, labels y secciones vinculadas', () => {
    const html = renderShell();
    expect(html).toContain('aria-label="Panel del modelador"');
    expect(html).toContain('aria-label="Área de modelado 3D"');
    expect(html).toContain('role="status"');
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-labelledby="modeler-view-heading"');
    expect(html).toContain('aria-labelledby="modeler-tools-heading"');
    expect(html).toContain('aria-labelledby="modeler-props-heading"');
    expect(html).toContain(
      'aria-label="Volver al configurador de clósets"',
    );
  });

  it('renderiza el área3D recibida por children', () => {
    const html = renderShell();
    expect(html).toContain('data-testid="escena"');
  });
});
