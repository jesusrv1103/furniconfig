/**
 * FASE-4C-A/B — chrome del modelador (renderToString).
 *
 * Verifica: identidad "FurniConfig Modeler", enlace de vuelta
 * al configurador, indicadores de unidades/documento/estado
 * del motor (las5 etiquetas honestas), controles de vista y
 * herramientas funcionales (aria-pressed), ausencia de botones
 * deshabilitados, panel del croquis pendiente, lista de
 * objetos con estados, panel de propiedades (edición, error con
 * reintento, eliminar) y accesibilidad básica (roles, labels,
 * secciones vinculadas).
 */

import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';

import { ModelerShell } from '../../src/components/modeler/ModelerShell.js';
import type { ModelerShellProps } from '../../src/components/modeler/ModelerShell.js';

function renderShell(
  overrides: Partial<ModelerShellProps> = {},
): string {
  const props: ModelerShellProps = {
    document: { name: 'Escena sin título', objectCount: 0, gridStepMm: 100 },
    engineStatus: 'idle',
    view: 'isometric',
    onViewChange: () => undefined,
    onFit: () => undefined,
    tool: 'select',
    onToolChange: () => undefined,
    history: {
      canUndo: true,
      canRedo: true,
      undoLabel: 'Deshacer: Eliminar "Sólido 1"',
      redoLabel: 'Rehacer: Eliminar "Sólido 1"',
      message: null,
    },
    onUndo: () => undefined,
    onRedo: () => undefined,
    onInsertWardrobe: () => undefined,
    pendingSketch: null,
    objects: [],
    selection: null,
    wardrobe: null,
    children: <div data-testid="escena" />,
    ...overrides,
  };
  // React SSR maquetado: marcado puro sin dependencias de DOM.
  return renderToString(<ModelerShell {...props} />);
}

function slice(haystack: string, start: string, end: string): string {
  return haystack.slice(
    haystack.indexOf(start) === -1 ? 0 : haystack.indexOf(start),
    end === '-1' || end === ''
      ? haystack.length
      : haystack.indexOf(end) === -1
        ? haystack.length
        : haystack.indexOf(end),
  );
}

describe('ModelerShell (chrome del modelador)', () => {
  it('renderiza identidad, enlace de vuelta y badge de mm', () => {
    const html = renderShell();
    expect(html).toContain('FurniConfig Modeler');
    expect(html).toContain('href="#/"');
    expect(html).toContain('Volver al configurador');
    expect(html).toContain('data-modeler-units');
    expect(html).toContain('>mm<');
  });

  it('muestra el estado del documento honesto (objetos y rejilla)', () => {
    const html = renderShell({
      document: { name: 'Escena sin título', objectCount: 3, gridStepMm: 100 },
    });
    expect(html).toContain('3 objetos');
    expect(html).toContain('rejilla');
    expect(html).toContain('100 mm');
  });

  it('las5 etiquetas del motor geométrico son coherentes con su estado', () => {
    const cases = [
      ['idle', 'en reposo (sin cálculos)'],
      ['initializing', 'iniciando…'],
      ['ready', 'listo'],
      ['restarting', 'reiniciando…'],
      ['error', 'error del worker'],
    ] as const;
    for (const [status, label] of cases) {
      const html = renderShell({ engineStatus: status });
      expect(html).toContain(`data-status="${status}"`);
      expect(html).toContain(label);
    }
  });

  it('controles de vista: aria-pressed correcto y Ajustar accionable', () => {
    const html = renderShell({ view: 'front' });
    const section = slice(html, 'data-modeler-view', 'Herramientas');
    const pressed = [...section.matchAll(/aria-pressed="(\w+)"/g)].map(
      (match) => match[1],
    );
    expect(pressed).toEqual(['false', 'true', 'false']);
    expect(section).toContain('Isométrica');
    expect(section).toContain('Frontal');
    expect(section).toContain('Lateral');
    expect(section).toContain('Ajustar');
  });

  it('herramientas: dos botones reales con aria-pressed (sin placeholders)', () => {
    const html = renderShell({ tool: 'rectangle' });
    const section = slice(html, 'data-modeler-tools', 'data-modeler-objects');
    expect(section).not.toContain('Todavía no hay herramientas');
    const pressed = [...section.matchAll(/aria-pressed="(\w+)"/g)].map(
      (match) => match[1],
    );
    expect(pressed).toEqual(['false', 'true']);
    expect(section).toContain('Seleccionar');
    expect(section).toContain('Rectángulo');
    expect(section).toContain('Izquierdo: dibujar rectángulo');
  });

  it('pista de la herramienta activa coherente con el modo selección', () => {
    const html = renderShell({ tool: 'select' });
    expect(html).toContain('Clic para seleccionar');
  });

  it('ningún botón está deshabilitado (sin botones muertos)', () => {
    const html = renderShell({
      tool: 'rectangle',
      pendingSketch: {
        widthText: '1200',
        depthText: '600',
        heightText: '100',
        onWidthChange: () => undefined,
        onDepthChange: () => undefined,
        onHeightChange: () => undefined,
        onExtrude: () => undefined,
        onCancel: () => undefined,
      },
      objects: [
        {
          id: 'solid-1',
          kind: 'solid',
          name: 'Sólido 1',
          dimsText: '1200 × 600 × 100 mm',
          status: 'error',
          selected: true,
          onSelect: () => undefined,
        },
      ],
      selection: {
        name: 'Sólido 1',
        nameText: 'Sólido 1',
        onNameChange: () => undefined,
        widthText: '1200',
        depthText: '600',
        heightText: '100',
        onWidthChange: () => undefined,
        onDepthChange: () => undefined,
        onHeightChange: () => undefined,
        status: 'error',
        errorMessage: 'invalid-input',
        onRetry: () => undefined,
        onDelete: () => undefined,
      },
    });
    expect(html).not.toContain('disabled');
  });

  it('panel del croquis pendiente: campos y acciones Extruir/Cancelar', () => {
    const html = renderShell({
      pendingSketch: {
        widthText: '1200',
        depthText: '600',
        heightText: '100',
        onWidthChange: () => undefined,
        onDepthChange: () => undefined,
        onHeightChange: () => undefined,
        onExtrude: () => undefined,
        onCancel: () => undefined,
      },
    });
    const section = slice(html, 'data-modeler-pending', 'data-modeler-objects');
    expect(section).toContain('Croquis sin extruir');
    expect(section).toContain('data-modeler-field="pending-width"');
    expect(section).toContain('data-modeler-field="pending-depth"');
    expect(section).toContain('data-modeler-field="pending-height"');
    expect(section).toContain('value="1200"');
    expect(section).toContain('data-modeler-extrude');
    expect(section).toContain('Extruir');
    expect(section).toContain('Cancelar croquis');
  });

  it('sin croquis pendiente no existe la sección (sin estados fingidos)', () => {
    const html = renderShell();
    expect(html).not.toContain('data-modeler-pending');
    expect(html).toContain('Dibuja un rectángulo o inserta un clóset');
  });

  it('lista de objetos con nombre, cotas y estado de generación', () => {
    const html = renderShell({
      objects: [
        {
          id: 'solid-1',
          kind: 'solid',
          name: 'Sólido 1',
          dimsText: '1200 × 600 × 100 mm',
          status: 'pending',
          selected: false,
          onSelect: () => undefined,
        },
        {
          id: 'solid-2',
          kind: 'solid',
          name: 'Sólido 2',
          dimsText: '300 × 300 × 40 mm',
          status: 'ready',
          selected: true,
          onSelect: () => undefined,
        },
      ],
    });
    const section = slice(html, 'data-modeler-objects', 'data-modeler-props');
    expect(section).toContain('Sólido 1');
    expect(section).toContain('1200 × 600 × 100 mm');
    expect(section).toContain('Generando…');
    expect(section).toContain('Listo');
    expect(section).toContain('data-modeler-object="solid-2"');
    expect(section).toContain('aria-pressed="true"');
  });

  it('propiedades sin selección: texto informativo (no sección-reserva)', () => {
    const html = renderShell();
    const section = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(section).toContain('Selecciona un sólido');
    expect(section).not.toContain('próximamente');
  });

  it('propiedades con selección: campos editables, estado, error y acciones', () => {
    const html = renderShell({
      selection: {
        name: 'Sólido 1',
        nameText: 'Sólido 1',
        onNameChange: () => undefined,
        widthText: '1200',
        depthText: '600',
        heightText: '100',
        onWidthChange: () => undefined,
        onDepthChange: () => undefined,
        onHeightChange: () => undefined,
        status: 'error',
        errorMessage: 'invalid-input',
        onRetry: () => undefined,
        onDelete: () => undefined,
      },
    });
    const section = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(section).toContain('Sólido 1');
    expect(section).toContain('data-modeler-field="selection-width"');
    expect(section).toContain('data-modeler-field="selection-depth"');
    expect(section).toContain('data-modeler-field="selection-height"');
    expect(section).toContain('value="600"');
    expect(section).toContain('data-modeler-selection-status');
    expect(section).toContain('data-status="error"');
    expect(section).toContain('invalid-input');
    expect(section).toContain('data-modeler-retry');
    expect(section).toContain('data-modeler-delete');
    expect(section).toContain('Eliminar');
  });

  it('sin error de kernel no se muestra Reintentar (solo Eliminar)', () => {
    const html = renderShell({
      selection: {
        name: 'Sólido 1',
        nameText: 'Sólido 1',
        onNameChange: () => undefined,
        widthText: '1',
        depthText: '1',
        heightText: '1',
        onWidthChange: () => undefined,
        onDepthChange: () => undefined,
        onHeightChange: () => undefined,
        status: 'ready',
        errorMessage: null,
        onRetry: () => undefined,
        onDelete: () => undefined,
      },
    });
    const section = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(section).not.toContain('data-modeler-retry');
    expect(section).toContain('data-modeler-delete');
  });

  it('accesibilidad: secciones vinculadas a sus encabezados', () => {
    const html = renderShell();
    for (const heading of [
      'modeler-view-heading',
      'modeler-tools-heading',
      'modeler-objects-heading',
      'modeler-props-heading',
      'modeler-doc-heading',
    ]) {
      expect(html).toContain(`id="${heading}"`);
      expect(html).toContain(`aria-labelledby="${heading}"`);
    }
  });

  it('renderiza el área de escena (children)', () => {
    const html = renderShell();
    expect(html).toContain('data-testid="escena"');
    expect(html).toContain('data-modeler-viewport');
  });

  // -------------------------------------------------------------------------
  // Historial visual (FASE-4C-C, C3)
  // -------------------------------------------------------------------------

  const historySelection = {
    name: 'Sólido 1',
    nameText: 'Sólido 1',
    onNameChange: () => undefined,
    widthText: '1200',
    depthText: '600',
    heightText: '100',
    onWidthChange: () => undefined,
    onDepthChange: () => undefined,
    onHeightChange: () => undefined,
    status: 'ready' as const,
    errorMessage: null,
    onRetry: () => undefined,
    onDelete: () => undefined,
  };

  it('historial: botones con estado y etiqueta de lo que harían', () => {
    const html = renderShell({
      history: {
        canUndo: true,
        canRedo: false,
        undoLabel: 'Eliminar "Sólido 1"',
        redoLabel: null,
        message: null,
      },
    });
    expect(html).toContain('aria-label="Deshacer: Eliminar &quot;Sólido 1&quot;"');
    expect(html).toContain('data-modeler-undo');
    expect(html).toContain('data-modeler-redo');
    // Con algo que deshacer → Deshacer habilitado; sin futuro → Rehacer no.
    expect(html).not.toMatch(/disabled=""[^>]*data-modeler-undo/);
    expect(html).toMatch(/disabled=""[^>]*data-modeler-redo/);
    // La raíz del historial es un grupo accesible.
    expect(html).toContain('aria-label="Historial de operaciones"');
  });

  it('historial: sin operaciones ambos deshabilitados con etiqueta genérica', () => {
    const html = renderShell({
      history: {
        canUndo: false,
        canRedo: false,
        undoLabel: null,
        redoLabel: null,
        message: null,
      },
    });
    expect(html).toMatch(/disabled=""[^>]*data-modeler-undo/);
    expect(html).toMatch(/disabled=""[^>]*data-modeler-redo/);
    expect(html).toContain('aria-label="Deshacer"');
    expect(html).toContain('aria-label="Rehacer"');
  });

  it('historial: feedback aria-live del último deshacer/rehacer', () => {
    const html = renderShell({
      history: {
        canUndo: true,
        canRedo: true,
        undoLabel: 'Añadir "Sólido 1"',
        redoLabel: 'Eliminar "Sólido 1"',
        message: 'Deshecho: Eliminar "Sólido 1"',
      },
    });
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
    expect(html).toContain('Deshecho: Eliminar &quot;Sólido 1&quot;');
    expect(html).toContain('data-modeler-history-status');
  });

  it('propiedades: el nombre es un campo editable (commit Enter/blur)', () => {
    const html = renderShell({ selection: historySelection });
    const props = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(props).toContain('data-modeler-field="selection-name"');
    // El nombre visible sigue en el panel (innerText de la lista).
    expect(props).toContain('Sólido 1');
    expect(props).toContain('data-modeler-field="selection-width"');
    expect(props).toContain('data-modeler-field="selection-depth"');
    expect(props).toContain('data-modeler-field="selection-height"');
  });
});

// ---------------------------------------------------------------------------
// FASE-4C-D — inserción y panel de clósets
// ---------------------------------------------------------------------------

function wardrobeFixture(
  overrides: Partial<NonNullable<ModelerShellProps['wardrobe']>> = {},
): NonNullable<ModelerShellProps['wardrobe']> {
  const noop = () => undefined;
  return {
    name: 'Clóset 1',
    nameText: 'Clóset 1',
    onNameChange: noop,
    params: {
      widthText: '2400',
      heightText: '2200',
      depthText: '600',
      onWidthChange: noop,
      onHeightChange: noop,
      onDepthChange: noop,
      moduleCount: 3,
      onModuleCountChange: noop,
      modules: [
        {
          index: 0,
          kind: 'shelves',
          shelvesText: '3',
          drawersText: null,
          onKindChange: noop,
          onShelvesChange: noop,
          onDrawersChange: noop,
        },
        {
          index: 1,
          kind: 'hanging',
          shelvesText: null,
          drawersText: null,
          onKindChange: noop,
          onShelvesChange: noop,
          onDrawersChange: noop,
        },
        {
          index: 2,
          kind: 'drawers',
          shelvesText: null,
          drawersText: '2',
          onKindChange: noop,
          onShelvesChange: noop,
          onDrawersChange: noop,
        },
      ],
      doorsEnabled: false,
      onDoorsEnabledChange: noop,
      doorLeaves: 1,
      onDoorLeavesChange: noop,
      doorHinge: 'left',
      onDoorHingeChange: noop,
      backPanelEnabled: true,
      onBackPanelEnabledChange: noop,
    },
    status: 'ready',
    errorMessage: null,
    editError: null,
    onRetry: noop,
    onDelete: noop,
    ...overrides,
  };
}

describe('ModelerShell — 4C-D clósets', () => {
  it('botón «Insertar clóset» presente y HABILITADO (acción real)', () => {
    const html = renderShell();
    expect(html).toContain('data-modeler-insert-wardrobe');
    expect(html).toContain('Insertar clóset');
    const section = slice(html, 'data-modeler-insert', 'data-modeler-objects');
    expect(section).toContain('data-modeler-insert-wardrobe');
    expect(section).not.toContain('disabled');
  });

  it('lista: chip de TIPO distingue componente («Clóset») de sólido', () => {
    const html = renderShell({
      objects: [
        {
          id: 'component-1',
          kind: 'component',
          name: 'Clóset 1',
          dimsText: '2400 × 600 × 2200 mm',
          status: 'ready',
          selected: false,
          onSelect: () => undefined,
        },
        {
          id: 'solid-1',
          kind: 'solid',
          name: 'Sólido 1',
          dimsText: '800 × 600 × 100 mm',
          status: 'ready',
          selected: false,
          onSelect: () => undefined,
        },
      ],
    });
    expect(html).toContain('data-object-kind="component"');
    expect(html).toContain('data-modeler-object-kind="component"');
    expect(html).toContain('data-modeler-object-kind="solid"');
    expect(html).toContain('>Clóset<');
    expect(html).toContain('>Sólido<');
  });

  it('panel del clóset: dimensiones, módulos, puertas, panel trasero y errores', () => {
    const html = renderShell({ wardrobe: wardrobeFixture() });
    const props = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(props).toContain('data-modeler-field="wardrobe-name"');
    expect(props).toContain('data-modeler-field="wardrobe-width"');
    expect(props).toContain('data-modeler-field="wardrobe-height"');
    expect(props).toContain('data-modeler-field="wardrobe-depth"');
    expect(props).toContain('value="2400"');
    expect(props).toContain('data-modeler-module-count');
    expect(props).toContain('data-modeler-module-kind="0"');
    expect(props).toContain('data-modeler-module-kind="2"');
    expect(props).toContain('data-modeler-field="module-shelves-0"');
    expect(props).toContain('data-modeler-field="module-drawers-2"');
    expect(props).toContain('data-modeler-doors-enabled');
    expect(props).toContain('data-modeler-back-panel');
    // Puertas DESACTIVADAS → hojas y bisagra NO se muestran
    // (nunca controles que no aplican, ni deshabilitados sin explicación).
    expect(props).not.toContain('data-modeler-door-leaves');
    expect(props).not.toContain('data-modeler-door-hinge');
    expect(props).toContain('data-modeler-delete');
  });

  it('con puertas ACTIVADAS aparecen hojas y bisagra', () => {
    const base = wardrobeFixture();
    const params = base.params;
    const html = renderShell({
      wardrobe: wardrobeFixture({
        params:
          params === null
            ? null
            : { ...params, doorsEnabled: true, doorLeaves: 2, doorHinge: 'right' },
      }),
    });
    const props = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(props).toContain('data-modeler-door-leaves');
    expect(props).toContain('data-modeler-door-hinge');
    expect(props).toContain('value="right"');
  });

  it('error de EDICIÓN visible y separado del error de generación', () => {
    const html = renderShell({
      wardrobe: wardrobeFixture({
        editError: 'widthMm: fuera de rango (mínimo 400 mm).',
      }),
    });
    expect(html).toContain('data-modeler-wardrobe-edit-error');
    expect(html).toContain('fuera de rango');
    expect(html).not.toContain('data-modeler-selection-error');
  });

  it('params ilegibles (`params: null`) → panel reducido sin campos inaplicados', () => {
    const html = renderShell({ wardrobe: wardrobeFixture({ params: null }) });
    const props = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(props).toContain('data-modeler-field="wardrobe-name"');
    expect(props).not.toContain('wardrobe-width');
    expect(props).not.toContain('data-modeler-module-count');
    expect(props).toContain('data-modeler-delete');
  });

  it('sin selección ni clóset: el aviso menciona AMBOS objetos', () => {
    const html = renderShell();
    expect(html).toContain('Selecciona un sólido o un clóset');
  });
});
