/**
 * FASE-4C-C, C3 — detección pura de atajos de historial.
 *
 * Funciones sin DOM ni React (testeables en node) que deciden, a
 * partir de un evento de teclado normalizado, si corresponde
 * deshacer/rehacer. La política imita a la del configurador
 * (`use-editor-history.ts`):
 *
 * - solo con Ctrl (Windows/Linux) o Cmd (macOS);
 * - `Ctrl/Cmd+Z` → deshacer; `Ctrl/Cmd+Shift+Z` → rehacer;
 * - `event.repeat` (tecla mantenida) → ignorado: una pulsación,
 *   una operación (sin ráfagas);
 * - dentro de INPUT, TEXTAREA, SELECT o contentEditable → NO se
 *   intercepta: el campo conserva su deshacer nativo del navegador;
 * - fuera de campos → el modelador deshace (el configurador no se
 *   ve afectado: cada pantalla registra su propio listener).
 */

/** Clave de historial detectada. */
export type HistoryShortcut = 'undo' | 'redo';

/** Información del objetivo del evento (evita dependencia de DOM real). */
export interface ShortcutTarget {
  readonly tagName: string;
  readonly isContentEditable: boolean;
}

/** Evento de teclado normalizado (subconjunto que consume la política). */
export interface ShortcutKeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly repeat: boolean;
}

/** ¿El objetivo es un campo editable donde manda el atajo nativo? */
export function isEditableTarget(target: ShortcutTarget | null): boolean {
  if (target === null) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * Decide si `event` sobre `target` debe ejecutar deshacer/rehacer
 * del modelador, o `null` si se ignora.
 */
export function historyShortcut(
  event: ShortcutKeyEvent,
  target: ShortcutTarget | null,
): HistoryShortcut | null {
  if (event.repeat) return null;
  if (!event.ctrlKey && !event.metaKey) return null;
  if (isEditableTarget(target)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' && event.shiftKey) return 'redo';
  if (key === 'z' && !event.shiftKey) return 'undo';
  return null;
}
