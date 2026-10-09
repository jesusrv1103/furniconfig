import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DesignSection } from '../src/components/DesignSection.js';
import type { DesignSession } from '../src/hooks/use-design-session.js';
import type { DesignSummary } from '../src/lib/designs/types.js';
import { App } from '../src/App.js';

const actions: DesignSession['actions'] = {
  createDesign: async () => true,
  saveNow: async () => true,
  openDesign: async () => true,
  renameDesign: async () => true,
  duplicateDesign: async () => true,
  deleteDesign: async () => true,
  newProject: async () => true,
  importDesign: async () => true,
  exportDesign: async () => null,
};

function makeSession(
  state: Partial<DesignSession['state']> = {},
): DesignSession {
  return {
    state: {
      hydrated: true,
      designs: [],
      activeId: null,
      activeName: null,
      dirty: false,
      status: null,
      ...state,
    },
    actions,
  };
}

const summaries: DesignSummary[] = [
  {
    id: 'design-1',
    name: 'Clóset salón',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
  },
  {
    id: 'design-2',
    name: 'Clóset dormitorio',
    createdAt: '2026-01-03T10:00:00.000Z',
    updatedAt: '2026-01-04T10:00:00.000Z',
  },
];

/** ¿El botón con ese texto se renderiza deshabilitado? */
function isDisabled(html: string, label: string): boolean {
  const match = new RegExp(`<button[^>]*>${label}</button>`).exec(html);
  if (!match) {
    throw new Error(`no se encontró el botón «${label}»`);
  }
  return /\bdisabled=""/.test(match[0]);
}

describe('DesignSection (sección de proyectos)', () => {
  it('muestra el estado inicial vacío y las acciones principales', () => {
    const html = renderToString(<DesignSection session={makeSession()} />);

    expect(html).toContain('data-hydrated="true"');
    expect(html).toContain('Sin diseño activo');
    expect(html).toContain('el borrador se conserva al recargar');
    expect(html).toContain('No hay diseños guardados todavía.');
    expect(html).toContain('Nombre del nuevo diseño');
    expect(html).toContain('Crear diseño');
    expect(html).toContain('Nuevo proyecto');
    expect(html).toContain('Importar diseño (JSON)');
    expect(html).toContain('Buscar diseños');
  });

  it('deshabilita las acciones hasta hidratar', () => {
    const html = renderToString(
      <DesignSection session={makeSession({ hydrated: false })} />,
    );

    expect(html).toContain('data-hydrated="false"');
    expect(html).toContain('Cargando diseños…');
    expect(isDisabled(html, 'Crear diseño')).toBe(true);
    expect(isDisabled(html, 'Nuevo proyecto')).toBe(true);
  });

  it('lista los diseños con sus acciones y marca el activo', () => {
    const html = renderToString(
      <DesignSection
        session={makeSession({
          designs: summaries,
          activeId: 'design-1',
          activeName: 'Clóset salón',
        })}
      />,
    );

    expect(html).toContain('Clóset salón');
    expect(html).toContain('Clóset dormitorio');
    expect(html).toContain('data-design-id="design-1"');
    expect(html).toContain('Diseño activo:');
    expect(html).toContain('guardado');
    expect(html.match(/class="design-badge"/g)).toHaveLength(1);
    for (const label of ['Abrir', 'Renombrar', 'Duplicar', 'Exportar', 'Eliminar']) {
      expect(html).toContain(`>${label}</button>`);
    }
  });

  it('indica cambios sin guardar y habilita Guardar', () => {
    const html = renderToString(
      <DesignSection
        session={makeSession({
          designs: summaries,
          activeId: 'design-2',
          activeName: 'Clóset dormitorio',
          dirty: true,
        })}
      />,
    );

    expect(html).toContain('data-dirty="true"');
    expect(html).toContain('cambios sin guardar');
    expect(isDisabled(html, 'Guardar')).toBe(false);
  });

  it('deshabilita Guardar sin diseño activo o sin cambios', () => {
    const sinActivo = renderToString(<DesignSection session={makeSession()} />);
    expect(isDisabled(sinActivo, 'Guardar')).toBe(true);

    const limpio = renderToString(
      <DesignSection
        session={makeSession({
          designs: summaries,
          activeId: 'design-1',
          activeName: 'Clóset salón',
          dirty: false,
        })}
      />,
    );
    expect(isDisabled(limpio, 'Guardar')).toBe(true);
  });

  it('muestra el último mensaje con su tono', () => {
    const html = renderToString(
      <DesignSection
        session={makeSession({
          status: { tone: 'error', text: 'Almacenamiento local lleno.' },
        })}
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('data-tone="error"');
    expect(html).toContain('Almacenamiento local lleno.');
  });
});

describe('App con la sección de proyectos integrada', () => {
  it('la aplicación renderiza la sección Proyectos', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Proyectos');
    expect(html).toContain('data-hydrated="false"');
    expect(html).toContain('Cargando diseños…');
  });
});
