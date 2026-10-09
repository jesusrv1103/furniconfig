import type { ReactNode } from 'react';

/**
 * Cabecera de un panel lateral colapsable (Studio).
 *
 * Contiene los controles de la barra del panel: herramientas
 * opcionales (`children`, p. ej. el selector de modo) y el
 * botón de contraer/abrir con `aria-expanded`/`aria-controls`
 * sobre el cuerpo del panel.
 */
export function PanelToolbar({
  bodyId,
  open,
  onToggle,
  side,
  children,
}: {
  /** Id del cuerpo que controla el botón. */
  bodyId: string;
  open: boolean;
  onToggle: () => void;
  /** Lado del panel: determina el glifo de contraer. */
  side: 'left' | 'right';
  children?: ReactNode;
}) {
  const name = side === 'left' ? 'panel izquierdo' : 'panel derecho';
  return (
    <div className="panel-toolbar">
      {children}
      <button
        type="button"
        className="panel-collapse"
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={
          open ? `Contraer ${name}` : `Abrir ${name}`
        }
        title={open ? `Contraer ${name}` : `Abrir ${name}`}
        onClick={onToggle}
      >
        <span aria-hidden="true">{open ? (side === 'left' ? '⟨' : '⟩') : (side === 'left' ? '⟩' : '⟨')}</span>
      </button>
    </div>
  );
}
