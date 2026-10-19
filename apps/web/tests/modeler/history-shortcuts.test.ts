/**
 * FASE-4C-C, C3 — política de atajos de historial (§7.10).
 *
 * `historyShortcutFromEvent` es pura (sin DOM): decide a partir del
 * evento normalizado y del objetivo. La cableación real del listener
 * (window + cleanup) se verifica en las pruebas visuales de Chromium.
 */

import { describe, expect, it } from 'vitest';

import {
  historyShortcut,
  isEditableTarget,
  type ShortcutKeyEvent,
  type ShortcutTarget,
} from '../../src/lib/modeler/history-shortcuts.js';

function key(overrides: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent {
  return {
    key: 'z',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  };
}

const body: ShortcutTarget = { tagName: 'BODY', isContentEditable: false };
const input: ShortcutTarget = { tagName: 'INPUT', isContentEditable: false };

describe('historyShortcut (atajos del modelador)', () => {
  it('fuera de campos: Ctrl+Z deshace y Ctrl+Shift+Z rehace', () => {
    expect(historyShortcut(key(), body)).toBe('undo');
    expect(historyShortcut(key({ shiftKey: true }), body)).toBe('redo');
    // Cmd (macOS) equivale a Ctrl.
    expect(historyShortcut(key({ ctrlKey: false, metaKey: true }), body)).toBe(
      'undo',
    );
  });

  it('dentro de INPUT/TEXTAREA/SELECT/contentEditable NO intercepta', () => {
    expect(historyShortcut(key(), input)).toBeNull();
    expect(
      historyShortcut(key(), { tagName: 'TEXTAREA', isContentEditable: false }),
    ).toBeNull();
    expect(
      historyShortcut(key(), { tagName: 'SELECT', isContentEditable: false }),
    ).toBeNull();
    expect(
      historyShortcut(key(), { tagName: 'DIV', isContentEditable: true }),
    ).toBeNull();
    // Sin HTMLElement (raro: target no editable) → actúa globalmente,
    // igual que la guardia del configurador (`use-editor-history`).
    expect(historyShortcut(key(), null)).toBe('undo');
  });

  it('event.repeat (tecla mantenida) → una pulsación, una operación', () => {
    expect(historyShortcut(key({ repeat: true }), body)).toBeNull();
    expect(
      historyShortcut(key({ repeat: true, shiftKey: true }), body),
    ).toBeNull();
  });

  it('otras combinaciones → ignoradas', () => {
    expect(historyShortcut(key({ ctrlKey: false, metaKey: false }), body)).toBeNull();
    expect(historyShortcut(key({ key: 'x' }), body)).toBeNull();
    expect(historyShortcut(key({ key: 'Z', shiftKey: true }), body)).toBe('redo');
    expect(historyShortcut(key({ key: 'y' }), body)).toBeNull();
  });

  it('isEditableTarget clasifica correctamente', () => {
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(body)).toBe(false);
    expect(isEditableTarget(input)).toBe(true);
    expect(
      isEditableTarget({ tagName: 'div', isContentEditable: true }),
    ).toBe(true);
  });
});
