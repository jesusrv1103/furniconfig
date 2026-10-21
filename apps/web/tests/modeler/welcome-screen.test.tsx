/**
 * WAVE-02 BLOQUE 0 — pantalla de inicio (renderToString).
 *
 * Verifica: acción principal «Crear clóset», secundarias (continuar,
 * abrir diseños, diseño libre), borrador con identificación y opción
 * de descartar, corrupto expuesto sin borrarse, avisos de storage y
 * `formatDraftAge` determinista.
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import {
  WelcomeScreen,
  formatDraftAge,
  type WelcomeScreenProps,
} from '../../src/components/modeler/WelcomeScreen.js';
import type { SceneDesignSummary } from '../../src/lib/modeler/design-store.js';

function renderWelcome(
  overrides: Partial<WelcomeScreenProps> = {},
): string {
  const props: WelcomeScreenProps = {
    storageAvailable: true,
    designs: [],
    draft: null,
    error: null,
    onCreateCloset: () => undefined,
    onContinueDraft: () => undefined,
    onDiscardDraft: () => undefined,
    onOpenDesign: () => undefined,
    onFreeDesign: () => undefined,
    ...overrides,
  };
  return renderToString(<WelcomeScreen {...props} />);
}

/** Texto visible de SSR: React separa nodos dinámicos con `<!-- -->`. */
function text(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

describe('WelcomeScreen (marcado puro)', () => {
  it('acción principal «Crear clóset» y secundarias completas', () => {
    const html = renderWelcome();
    expect(html).toContain('data-welcome-create');
    expect(html).toContain('Crear clóset');
    expect(html).toContain('data-welcome-free');
    expect(html).toContain('Diseño libre — avanzado');
    expect(html).toContain('¿Qué quieres crear?');
    expect(html).toContain('data-welcome-designs');
    expect(html).toContain('Todavía no tienes proyectos guardados');
    // Identidad y vuelta al configurador.
    expect(html).toContain('FurniConfig');
    expect(html).toContain('href="#/"');
    // Sin borrador NO hay tarjeta de continuación.
    expect(html).not.toContain('data-welcome-draft');
  });

  it('borrador válido: nombre, tamaño, antigüedad y acción de descartar', () => {
    const html = renderWelcome({
      draft: {
        corrupted: false,
        name: 'Cocina norte',
        designName: 'Cocina norte',
        objectCount: 2,
        ageText: 'hace 3 min',
      },
    });
    expect(html).toContain('data-welcome-draft="ok"');
    expect(html).toContain('data-welcome-continue');
    expect(html).toContain('Continuar');
    expect(html).toContain('data-welcome-discard');
    expect(text(html)).toContain('2 objetos');
    expect(text(html)).toContain('hace 3 min');
    expect(html).toContain('borrador con cambios sin guardar');
  });

  it('borrador sin diseño asociado: solo el nombre de la escena', () => {
    const html = renderWelcome({
      draft: {
        corrupted: false,
        name: 'Escena sin título',
        designName: null,
        objectCount: 1,
        ageText: null,
      },
    });
    expect(html).toContain('Escena sin título');
    expect(html).not.toContain('borrador con cambios sin guardar');
  });

  it('borrador dañado: expuesto con opción de descartar (nunca automático)', () => {
    const html = renderWelcome({
      draft: { corrupted: true, message: 'Sobre ilegible (ERR_X).' },
    });
    expect(html).toContain('data-welcome-draft="corrupted"');
    expect(html).toContain('dañado');
    expect(html).toContain('ERR_X');
    expect(html).toContain('data-welcome-discard');
    expect(html).not.toContain('data-welcome-continue');
  });

  it('listado de diseños con «Abrir» por entrada y corruptos marcados', () => {
    const designs: readonly SceneDesignSummary[] = [
      { id: 'design-1', name: 'Cocina norte', corrupted: false },
      {
        id: 'design-2',
        name: null,
        corrupted: true,
        message: 'sobre ilegible',
      },
    ];
    const html = renderWelcome({ designs });
    expect(html).toContain('data-welcome-open="design-1"');
    expect(html).toContain('Cocina norte');
    expect(text(html)).toContain('Proyecto dañado (design-2)');
    expect(html).toContain('no se elimina automáticamente');
  });

  it('sin storage local → aviso honesto; error de acción → alerta', () => {
    const html = renderWelcome({
      storageAvailable: false,
      error: 'No se pudo abrir: diseño dañado.',
    });
    expect(html).toContain('data-welcome-warning');
    expect(html).toContain('no podrá conservarse');
    expect(html).toContain('data-welcome-error');
    expect(html).toContain('No se pudo abrir');
  });
});

describe('formatDraftAge', () => {
  const now = 1_700_000_000_000;

  it('tramos legibles y deterministas', () => {
    expect(formatDraftAge(now - 10_000, now)).toBe('hace un momento');
    expect(formatDraftAge(now - 3 * 60_000, now)).toBe('hace 3 min');
    expect(formatDraftAge(now - 59 * 60_000, now)).toBe('hace 59 min');
    expect(formatDraftAge(now - 2 * 3_600_000, now)).toBe('hace 2 h');
    expect(formatDraftAge(now - 26 * 3_600_000, now)).toBe('hace 1 día');
    expect(formatDraftAge(now - 3 * 86_400_000, now)).toBe('hace 3 días');
  });

  it('sin fecha válida → null; fecha futura → «un momento» (nunca negativo)', () => {
    expect(formatDraftAge(0, now)).toBeNull();
    expect(formatDraftAge(Number.NaN, now)).toBeNull();
    expect(formatDraftAge(now + 60_000, now)).toBe('hace un momento');
  });
});
