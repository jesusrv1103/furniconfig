/**
 * WAVE-02 BLOQUE 3 (UX-C) — `ModelerDialog`: diálogo modal PROPIO
 * que sustituye a `window.prompt`/`window.confirm`.
 *
 * Verifica (SSR, marcado puro): roles accesibles (dialog + aria-modal
 * + labelledby/describedby), variante prompt con campo, variante
 * confirm, botones Cancelar/Confirmar con etiqueta configurable,
 * error del caller con `role="alert"` y atributos de verificación.
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import {
  ModelerDialog,
  type ModelerDialogSpec,
} from '../../src/components/modeler/ModelerDialog.js';

function renderDialog(spec: Partial<ModelerDialogSpec> = {}): string {
  const base = {
    kind: 'confirm' as const,
    title: 'Título de prueba',
    description: 'Descripción de prueba.',
    confirmLabel: 'Confirmar',
    onConfirm: () => undefined,
    onCancel: () => undefined,
    ...spec,
  } as ModelerDialogSpec;
  return renderToString(<ModelerDialog dialog={base} />);
}

describe('ModelerDialog (diálogo modal propio)', () => {
  it('expone roles y ARIA correctos (dialog, modal, labelledby, describedby)', () => {
    const html = renderDialog();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="modeler-dialog-title"');
    expect(html).toContain('aria-describedby="modeler-dialog-description"');
    expect(html).toContain('id="modeler-dialog-title"');
    expect(html).toContain('id="modeler-dialog-description"');
    expect(html).toContain('data-modeler-dialog-overlay');
  });

  it('variante confirm: sin campo de texto, con Cancelar y acción confirmatoria', () => {
    const html = renderDialog({
      kind: 'confirm',
      title: 'Eliminar diseño',
      description: '¿Eliminar el proyecto «X»? Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar',
    });
    expect(html).toContain('Eliminar diseño');
    expect(html).toContain('no se puede deshacer');
    expect(html).toContain('data-modeler-dialog-cancel');
    expect(html).toContain('data-modeler-dialog-confirm');
    expect(html).toContain('>Eliminar<');
    expect(html).not.toContain('data-modeler-dialog-input');
  });

  it('variante prompt: campo de texto con el valor precargado y etiqueta «Nombre»', () => {
    const html = renderDialog({
      kind: 'prompt',
      title: 'Guardar como',
      initialValue: 'Escena sin título',
      confirmLabel: 'Guardar',
    } as Partial<ModelerDialogSpec>);
    expect(html).toContain('data-modeler-dialog-input');
    expect(html).toContain('value="Escena sin título"');
    expect(html).toContain('>Nombre<');
    expect(html).toContain('>Guardar<');
    expect(html).toContain('autofocus');
  });

  it('error del caller: visible con role="alert" (el diálogo no cierra)', () => {
    const html = renderDialog({
      kind: 'prompt',
      initialValue: '',
      error: 'El nombre no puede estar vacío.',
    } as Partial<ModelerDialogSpec>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-modeler-dialog-error');
    expect(html).toContain('El nombre no puede estar vacío');
  });

  it('sin error no queda marcado el contenedor de error', () => {
    const html = renderDialog({ error: null });
    expect(html).not.toContain('data-modeler-dialog-error');
  });
});
