/**
 * WAVE-02 BLOQUE 0 — pantalla de inicio del modelador.
 *
 * Antes (auditoría P-01): `#/modeler` abría directamente la escena
 * técnica vacía — la primera pantalla parecía un programa roto. Ahora
 * la primera visita muestra una bienvenida CLARA con una acción
 * principal evidente y las secundarias ordenadas.
 *
 * Acciones:
 *
 * - **Crear clóset** (principal): componente paramétrico válido,
 *   centrado y encuadrado (BLOQUE 0/1), seleccionado con sus
 *   propiedades visibles.
 * - **Continuar un proyecto** (si hay borrador de sesión válido): nombra
 *   qué se continúa (nombre, objetos, antigüedad) y ofrece
 *   «Descartar borrador» como acción explícita (BLOQUE 3).
 * - **Abrir mis proyectos**: listado local con apertura directa; una
 *   entrada corrupta se muestra como corrupta (nunca se borra).
 * - **Diseño libre**: escena vacía en MODO AVANZADO (escape honesto
 *   para quien quiere el modelador técnico actual).
 *
 * Componente MARCADO PURO: sin efectos ni storage (el storage vive en
 * `ModelerApp`); testeable con `renderToString`.
 */

import type { ReactElement } from 'react';

import type { SceneDesignSummary } from '../../lib/modeler/design-store.js';

/** Tarjeta de continuación del borrador de sesión. */
export type WelcomeDraftCard =
  | {
      readonly corrupted: false;
      /** Nombre del borrador (el del diseño activo o «Escena…»). */
      readonly name: string;
      /** Diseño guardado del que procede el borrador (si lo hay). */
      readonly designName: string | null;
      readonly objectCount: number;
      /** Texto ya formateado («hace 3 min»…); `null` si no hay fecha. */
      readonly ageText: string | null;
    }
  | {
      readonly corrupted: true;
      readonly message: string;
    };

/** Props puras de la pantalla de inicio. */
export interface WelcomeScreenProps {
  /** `false` → aviso de que nada puede guardarse en este navegador. */
  readonly storageAvailable: boolean;
  readonly designs: readonly SceneDesignSummary[];
  readonly draft: WelcomeDraftCard | null;
  /** Error de la última acción de la bienvenida (apertura fallida…). */
  readonly error: string | null;
  readonly onCreateCloset: () => void;
  readonly onContinueDraft: () => void;
  readonly onDiscardDraft: () => void;
  readonly onOpenDesign: (id: string) => void;
  readonly onFreeDesign: () => void;
}

/**
 * Antigüedad legible de un borrador (texto determinista para tests:
 * pasan las horas mismo; fuera de ellas se usa «hace N h»; > 7 días →
 * «hace N días»; sin fecha → `null`).
 */
export function formatDraftAge(updatedAt: number, now: number): string | null {
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;
  const deltaMs = Math.max(0, now - updatedAt);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'hace 1 día' : `hace ${days} días`;
}

/** Pantalla de inicio (marcado puro SSR). */
export function WelcomeScreen(props: WelcomeScreenProps): ReactElement {
  const { designs, draft, error, storageAvailable } = props;

  return (
    <div className="modeler-welcome" data-modeler-welcome="">
      <header className="modeler-welcome-topbar">
        <span className="modeler-brand" data-testid="modeler-brand">
          FurniConfig <strong>Modeler</strong>
        </span>
        <span className="modeler-units" data-testid="modeler-units">
          Milímetros (mm)
        </span>
        <a
          className="modeler-back"
          href="#/"
          data-modeler-back=""
          aria-label="Volver al configurador de clósets"
        >
          Volver al configurador
        </a>
      </header>

      <main className="modeler-welcome-main">
        <h1 className="modeler-welcome-title">¿Qué quieres crear?</h1>
        <p className="modeler-welcome-subtitle">
          Un mueble a medida en pocos clics: sin instrucciones ni conceptos
          técnicos.
        </p>

        {error !== null && (
          <p className="modeler-welcome-error" role="alert" data-welcome-error="">
            {error}
          </p>
        )}
        {!storageAvailable && (
          <p className="modeler-welcome-warning" role="status" data-welcome-warning="">
            Este navegador no permite guardar: tu trabajo no podrá conservarse
            al cerrar.
          </p>
        )}

        <div className="modeler-welcome-primary">
          <button
            type="button"
            className="modeler-welcome-create"
            data-welcome-create=""
            onClick={props.onCreateCloset}
          >
            Crear clóset
          </button>
          <p className="modeler-welcome-primary-hint">
            Crea un clóset listo para editar y lo centra en pantalla.
          </p>
        </div>

        {draft !== null && (
          <section
            className="modeler-welcome-draft"
            aria-labelledby="modeler-welcome-draft-heading"
            data-welcome-draft={draft.corrupted ? 'corrupted' : 'ok'}
          >
            <h2 id="modeler-welcome-draft-heading">Continuar un proyecto</h2>
            {draft.corrupted ? (
              <>
                <p className="modeler-welcome-draft-warning">
                  No se pudo recuperar el último trabajo: el borrador local está
                  dañado o es de una versión incompatible.
                </p>
                <p className="modeler-welcome-draft-note">{draft.message}</p>
                <button
                  type="button"
                  className="modeler-button modeler-button-danger"
                  data-welcome-discard=""
                  onClick={props.onDiscardDraft}
                >
                  Descartar borrador
                </button>
              </>
            ) : (
              <>
                <p className="modeler-welcome-draft-name" data-welcome-draft-name="">
                  {draft.designName !== null
                    ? `«${draft.name}» · borrador con cambios sin guardar`
                    : draft.name}
                </p>
                <p className="modeler-welcome-draft-meta" data-welcome-draft-meta="">
                  {draft.objectCount} {draft.objectCount === 1 ? 'objeto' : 'objetos'}
                  {draft.ageText !== null ? ` · ${draft.ageText}` : ''}
                </p>
                <div className="modeler-welcome-draft-actions">
                  <button
                    type="button"
                    className="modeler-welcome-continue"
                    data-welcome-continue=""
                    onClick={props.onContinueDraft}
                  >
                    Continuar
                  </button>
                  <button
                    type="button"
                    className="modeler-button modeler-button-quiet"
                    data-welcome-discard=""
                    onClick={props.onDiscardDraft}
                  >
                    Descartar borrador
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        <section
          className="modeler-welcome-designs"
          aria-labelledby="modeler-welcome-designs-heading"
          data-welcome-designs=""
        >
          <h2 id="modeler-welcome-designs-heading">Abrir mis proyectos</h2>
          {designs.length === 0 ? (
            <p className="modeler-welcome-empty">
              Todavía no tienes proyectos guardados.
            </p>
          ) : (
            <ul className="modeler-welcome-design-list">
              {designs.map((design) => (
                <li key={design.id} className="modeler-welcome-design">
                  {design.corrupted ? (
                    <>
                      <span className="modeler-welcome-design-broken">
                        Proyecto dañado ({design.id})
                      </span>
                      <span className="modeler-welcome-design-note">
                        No se pudo leer; no se elimina automáticamente.
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="modeler-welcome-design-name">
                        {design.name}
                      </span>
                      <button
                        type="button"
                        className="modeler-button"
                        data-welcome-open={design.id}
                        onClick={() => props.onOpenDesign(design.id)}
                      >
                        Abrir
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="modeler-welcome-secondary">
          <button
            type="button"
            className="modeler-welcome-free"
            data-welcome-free=""
            onClick={props.onFreeDesign}
          >
            Diseño libre — avanzado
          </button>
          <p className="modeler-welcome-secondary-hint">
            Abre el modelador técnico completo (croquis, herramientas y
            propiedades avanzadas).
          </p>
        </div>
      </main>
    </div>
  );
}
