/**
 * WAVE-02 BLOQUE 3 (UX-C) — diálogo modal PROPIO y accesible del
 * modelador: sustituye a `window.prompt` y `window.confirm` (nativos
 * incontrolables: sin estilo, sin localización, bloqueantes y con
 * textos que la app no puede verificar).
 *
 * Diseño (SSR puro: marcado + estado interno de React, sin efectos):
 *
 * - `role="dialog"` + `aria-modal` + `aria-labelledby`/
 *   `aria-describedby` (título y descripción).
 * - Variante `prompt` con campo de texto (estado interno; la
 *   confirmación entrega el valor SINRUTEO al caller) y variante
 *   `confirm` para guardias (cambios sin guardar, descartar
 *   borrador, eliminar).
 * - Escape y clic en el fondo CANCELAN (nunca ejecutan la acción
 *   destructiva); Enter en el campo CONFIRMA.
 * - El CIERRE lo decide el caller (estado en `ModelerApp`): si la
 *   validación falla (p. ej. nombre vacío), el caller devuelve un
 *   spec con `error` y el diálogo SIGUE ABIERTO con el mensaje
 *   (role="alert") y el valor conservado.
 */

import { useState, type ReactNode } from 'react';

/** Diálogo con campo de texto (Guardar como / Renombrar). */
export interface ModelerDialogPromptSpec {
  readonly kind: 'prompt';
  readonly title: string;
  readonly description: string;
  /** Valor precargado en el campo. */
  readonly initialValue: string;
  readonly confirmLabel: string;
  readonly onConfirm: (value: string) => void;
}

/** Diálogo de confirmación (guardias de pérdida / borrado). */
export interface ModelerDialogConfirmSpec {
  readonly kind: 'confirm';
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
}

/** Especificación completa de un diálogo abierto. */
export type ModelerDialogSpec = (
  | ModelerDialogPromptSpec
  | ModelerDialogConfirmSpec
) & {
  /** Cancelar (Escape, fondo o botón): cierra sin ejecutar nada. */
  readonly onCancel: () => void;
  /** Error de validación del caller (visible; el diálogo no cierra). */
  readonly error?: string | null;
};

/** Diálogo modal accesible (marcado puro; el cierre lo controla el caller). */
export function ModelerDialog(props: {
  readonly dialog: ModelerDialogSpec;
}): ReactNode {
  const { dialog } = props;
  const [value, setValue] = useState(
    dialog.kind === 'prompt' ? dialog.initialValue : '',
  );

  const handleCancel = (): void => {
    dialog.onCancel();
  };
  const handleConfirm = (): void => {
    if (dialog.kind === 'prompt') {
      dialog.onConfirm(value);
    } else {
      dialog.onConfirm();
    }
  };

  return (
    <div
      className="modeler-dialog-overlay"
      data-modeler-dialog-overlay=""
      onClick={handleCancel}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          handleCancel();
        }
      }}
    >
      <div
        className="modeler-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modeler-dialog-title"
        aria-describedby="modeler-dialog-description"
        data-modeler-dialog=""
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="modeler-dialog-title" data-modeler-dialog-title="">
          {dialog.title}
        </h2>
        <p id="modeler-dialog-description" data-modeler-dialog-description="">
          {dialog.description}
        </p>
        {dialog.kind === 'prompt' && (
          <label className="modeler-field">
            <span>Nombre</span>
            <input
              type="text"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleConfirm();
                }
              }}
              data-modeler-dialog-input=""
              // El diálogo es modal: el foco inicial va al campo
              // (patrón de los diálogos nativos que sustituye).
              autoFocus
            />
          </label>
        )}
        {dialog.error != null && (
          <p className="modeler-error" role="alert" data-modeler-dialog-error="">
            {dialog.error}
          </p>
        )}
        <div className="modeler-dialog-actions">
          <button
            type="button"
            onClick={handleCancel}
            data-modeler-dialog-cancel=""
          >
            Cancelar
          </button>
          <button
            type="button"
            className="modeler-dialog-confirm"
            onClick={handleConfirm}
            data-modeler-dialog-confirm=""
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
