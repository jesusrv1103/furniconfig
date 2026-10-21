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
import type {
  DesignsPanelProps,
  ModelerShellProps,
  PositionPanelProps,
} from '../../src/components/modeler/ModelerShell.js';

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
    position: null,
    designs: null,
    // WAVE-02: el fixture por defecto usa MODO AVANZADO (paridad total
    // con la UI anterior; el modo sencillo se prueba aparte).
    mode: 'advanced',
    onModeChange: () => undefined,
    onHome: () => undefined,
    saveState: 'clean',
    startHint: null,
    cardActions: null,
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

describe('ModelerShell — WAVE-01 posición en el suelo', () => {
  const basePosition: PositionPanelProps = {
    xText: '500',
    zText: '300',
    onXChange: () => undefined,
    onZChange: () => undefined,
    onNudge: () => undefined,
    nudgeStepMm: 100,
    snapEnabled: true,
    onSnapChange: () => undefined,
    snapStepMm: 100,
    errorMessage: null,
    draggable: true,
  };

  it('sin panel de posición no existe la sección (sin reserva)', () => {
    const html = renderShell();
    expect(html).not.toContain('data-modeler-position');
  });

  it('campos X/Z, flechas por paso, snap y pista de arrastre', () => {
    const html = renderShell({ position: basePosition });
    expect(html).toContain('data-modeler-position');
    expect(html).toContain('data-modeler-field="position-x"');
    expect(html).toContain('data-modeler-field="position-z"');
    expect(html).toContain('value="500"');
    expect(html).toContain('value="300"');
    for (const direction of ['-x', '+x', '-z', '+z']) {
      expect(html).toContain(`data-modeler-nudge="${direction}"`);
    }
    expect(html).toContain('X −100');
    expect(html).toContain('Z +100');
    expect(html).toContain('data-modeler-snap');
    expect(html).toContain('Arrastra el objeto sobre el suelo (snap 100 mm)');
    expect(html).not.toContain('data-modeler-position-error');
  });

  it('snap desactivado → pista honesta sin snap', () => {
    const html = renderShell({
      position: { ...basePosition, snapEnabled: false },
    });
    expect(html).toContain('posiciones exactas');
    // Checkbox de SNAP sin marcar (el alcance evita confundirlo con el
    // interruptor de modo avanzado, WAVE-02, que sí va marcado).
    const snapRegion = slice(html, 'data-modeler-snap', 'data-modeler-drag-hint');
    expect(snapRegion).not.toContain('checked'); // checkbox sin marcar en SSR
  });

  it('objeto no arrastrable (generando) → pista explícita, sin fingir', () => {
    const html = renderShell({
      position: { ...basePosition, draggable: false },
    });
    expect(html).toContain('Generando geometría');
    expect(html).not.toContain('Arrastra el objeto');
  });

  it('error de posición visible en su nodo propio', () => {
    const html = renderShell({
      position: {
        ...basePosition,
        errorMessage: 'Posición: entero en mm con signo (p. ej. -250).',
      },
    });
    expect(html).toContain('data-modeler-position-error');
    expect(html).toContain('entero en mm con signo');
  });

  it('sin botones deshabilitados (controles reales)', () => {
    const html = renderShell({ position: basePosition });
    expect(html).not.toContain('disabled');
  });
});

describe('ModelerShell — WAVE-01 BLOQUE 3 panel de diseños', () => {
  const baseDesigns: DesignsPanelProps = {
    designs: [
      { id: 'design-1', name: 'Dormitorio', corrupted: false },
      { id: 'design-2', name: null, corrupted: true, message: 'dañado' },
    ],
    activeId: 'design-1',
    focusId: 'design-1',
    dirty: true,
    storageAvailable: true,
    onNew: () => undefined,
    onSave: () => undefined,
    onSaveAs: () => undefined,
    onFocusChange: () => undefined,
    onRename: () => undefined,
    onDuplicate: () => undefined,
    onDelete: () => undefined,
    message: 'Guardado: Dormitorio',
    error: null,
  };

  it('sin panel no existe la sección (sin reserva)', () => {
    const html = renderShell();
    expect(html).not.toContain('data-modeler-designs');
  });

  it('selector con el diseño activo, entradas y la dañada etiquetada', () => {
    const html = renderShell({ designs: baseDesigns });
    expect(html).toContain('data-modeler-designs');
    expect(html).toContain('data-modeler-design-select');
    expect(html).toContain('Dormitorio');
    expect(html).toContain('design-2 (dañado, no legible)');
    expect(html).toContain('value="design-1"');
  });

  it('los 6 botones del CRUD existen y están operativos', () => {
    const html = renderShell({ designs: baseDesigns });
    for (const action of [
      'new',
      'save',
      'save-as',
      'rename',
      'duplicate',
      'delete',
    ]) {
      expect(html).toContain('data-modeler-design-' + action);
    }
    expect(html).not.toContain('disabled');
  });

  it('cambios sin guardar + mensaje en aria-live; sin error → sin nodo', () => {
    const html = renderShell({ designs: baseDesigns });
    expect(html).toContain('data-modeler-design-dirty');
    expect(html).toContain('Cambios sin guardar');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Guardado: Dormitorio');
    expect(html).not.toContain('data-modeler-design-error');
  });

  it('error de diseño visible en su nodo propio', () => {
    const html = renderShell({
      designs: {
        ...baseDesigns,
        message: null,
        error: 'No existe el diseño «design-9».',
      },
    });
    expect(html).toContain('data-modeler-design-error');
    expect(html).toContain('No existe el diseño');
    expect(html).not.toContain('data-modeler-design-message');
  });

  it('sin storage local → aviso explícito (no finge operatividad)', () => {
    const html = renderShell({
      designs: { ...baseDesigns, storageAvailable: false },
    });
    expect(html).toContain('data-modeler-design-nostorage');
    expect(html).toContain('Almacenamiento local no disponible');
  });

  it('la sección explica el namespace aislado y la regeneración al abrir', () => {
    const html = renderShell({ designs: baseDesigns });
    expect(html).toContain('namespace propio del');
    expect(html).toContain('se regenera su geometría');
  });
});

describe('ModelerShell (WAVE-02: modos, chip de guardado e Inicio)', () => {
  it('modo avanzado: interruptor marcado, motor visible y texto técnico completo', () => {
    const html = renderShell({ mode: 'advanced', engineStatus: 'ready' });
    expect(html).toContain('data-modeler-mode');
    // Único input del fixture por defecto: la casilla del interruptor.
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked=""');
    expect(html).toContain('data-modeler-engine');
    expect(html).toContain('rejilla 100 mm');
    expect(html).toContain('>Ajustar<');
  });

  it('modo sencillo: sin jerga del motor, doc-state breve y «Encuadrar»', () => {
    const html = renderShell({
      mode: 'simple',
      engineStatus: 'ready',
      document: { name: 'Escena sin título', objectCount: 1, gridStepMm: 100 },
      view: 'front',
    });
    expect(html).not.toContain('data-modeler-engine');
    expect(html).not.toContain('rejilla 100 mm');
    expect(html).toContain('Escena sin título · 1 objeto');
    // El interruptor sigue desmarcado (sin `checked` en el fixture).
    expect(html).not.toContain('checked=""');
    // El aria-label técnico se conserva (accesibilidad/paridad de uso).
    expect(html).toContain('Ajustar la vista a la escena');
    const section = slice(html, 'data-modeler-view', 'Herramientas');
    expect(section).toContain('Encuadrar');
  });

  it('chip de guardado: estado y etiqueta coherentes en los cuatro casos', () => {
    expect(renderShell({ saveState: 'saved' })).toContain('data-save-state="saved"');
    expect(renderShell({ saveState: 'saved' })).toContain('Guardado');
    for (const state of ['dirty', 'dirty-unsaved'] as const) {
      const html = renderShell({ saveState: state });
      expect(html).toContain(`data-save-state="${state}"`);
      expect(html).toContain('Cambios sin guardar');
    }
    const clean = renderShell({ saveState: 'clean' });
    expect(clean).toContain('data-save-state="clean"');
    expect(clean).toContain('Sin proyecto guardado');
  });

  it('botón «Inicio» presente en la barra superior', () => {
    const html = renderShell();
    expect(html).toContain('data-modeler-home');
    expect(html).toContain('>Inicio<');
  });

  it('pista de bienvenida sobre el visor (una línea, aria-live)', () => {
    const html = renderShell({
      startHint: 'Este es tu clóset: cambia sus medidas en «Propiedades».',
    });
    expect(html).toContain('data-modeler-start-hint');
    expect(html).toContain('Este es tu clóset');
  });

  it('sin pista no queda marcado el contenedor de pista', () => {
    const html = renderShell({ startHint: null });
    expect(html).not.toContain('data-modeler-start-hint');
  });
});

/**
 * WAVE-02 BLOQUE 2 — tarjeta contextual flotante (modo sencillo):
 * sustituye al panel «Propiedades» con los MISMOS campos y añade
 * mover con palabras + duplicar (cada gesto = UNA entrada de
 * historial; eso se verifica en la App y en el script visual).
 */
describe('ModelerShell (WAVE-02 B2: tarjeta contextual)', () => {
  const cardActionsFixture = {
    onMoveWords: () => undefined,
    canDuplicate: true,
    onDuplicate: () => undefined,
    duplicateError: null,
  };
  const positionFixture: PositionPanelProps = {
    xText: '0',
    zText: '0',
    onXChange: () => undefined,
    onZChange: () => undefined,
    errorMessage: null,
    snapEnabled: false,
    onSnapChange: () => undefined,
    snapStepMm: 100,
    onNudge: () => undefined,
    nudgeStepMm: 100,
    draggable: true,
  };

  it('modo sencillo con clóset: tarjeta con TODOS los campos y la sección técnica OCULTA', () => {
    const html = renderShell({
      mode: 'simple',
      wardrobe: wardrobeFixture(),
      position: positionFixture,
      cardActions: cardActionsFixture,
    });
    const card = slice(html, 'data-modeler-card', '</main>');
    expect(card).toContain('data-modeler-card');
    expect(card).toContain('Tu clóset');
    // Mismos campos que el panel avanzado (sin lógica duplicada).
    for (const attr of [
      'wardrobe-name',
      'wardrobe-width',
      'wardrobe-height',
      'wardrobe-depth',
      'data-modeler-module-count',
      'data-modeler-module-kind',
      'data-modeler-doors-enabled',
      'data-modeler-back-panel',
      'data-modeler-delete',
    ]) {
      expect(card).toContain(attr);
    }
    // Mover con palabras + duplicar + posición legible.
    expect(card).toContain('data-modeler-move="left"');
    expect(card).toContain('data-modeler-move="right"');
    expect(card).toContain('data-modeler-move="forward"');
    expect(card).toContain('data-modeler-move="back"');
    expect(card).toContain('← Izquierda');
    expect(card).toContain('↑ Adelante');
    expect(card).toContain('data-modeler-card-position');
    expect(card).toContain('data-modeler-duplicate');
    // La sección «Propiedades» del sidebar NO se renderiza (evita
    // duplicar el marcado en el mismo modo).
    expect(html).not.toContain('data-modeler-props');
  });

  it('modo avanzado con clóset: SIN tarjeta y paridad TOTAL del panel', () => {
    const html = renderShell({
      mode: 'advanced',
      wardrobe: wardrobeFixture(),
      position: positionFixture,
      cardActions: cardActionsFixture,
    });
    expect(html).not.toContain('data-modeler-card');
    expect(html).not.toContain('data-modeler-move="left"');
    const props = slice(html, 'data-modeler-props', 'modeler-doc-heading');
    expect(props).toContain('data-modeler-field="wardrobe-width"');
    expect(props).toContain('data-modeler-module-count');
  });

  it('sólido seleccionado: tarjeta «Tu objeto» con cotas y extrusión', () => {
    const html = renderShell({
      mode: 'simple',
      selection: {
        name: 'Sólido 1',
        nameText: 'Sólido 1',
        onNameChange: () => undefined,
        widthText: '400',
        onWidthChange: () => undefined,
        depthText: '400',
        onDepthChange: () => undefined,
        heightText: '700',
        onHeightChange: () => undefined,
        status: 'ready',
        errorMessage: null,
        onRetry: () => undefined,
        onDelete: () => undefined,
      },
      position: positionFixture,
      cardActions: cardActionsFixture,
    });
    const card = slice(html, 'data-modeler-card', '</main>');
    expect(card).toContain('Tu objeto');
    expect(card).toContain('data-modeler-field="selection-width"');
    expect(card).toContain('data-modeler-field="selection-height"');
    expect(card).not.toContain('wardrobe-width');
  });

  it('errores visibles en la tarjeta (edición, posición y duplicación) — nunca silenciosos', () => {
    const html = renderShell({
      mode: 'simple',
      wardrobe: wardrobeFixture({
        editError:
          'No se aplicó el cambio: El ancho disponible (864 mm) no alcanza para 3 módulos de al menos 300 mm.',
      }),
      position: {
        ...positionFixture,
        errorMessage: 'La posición pedida está fuera de los límites de la escena.',
      },
      cardActions: {
        ...cardActionsFixture,
        duplicateError:
          'No se pudo duplicar: la copia saldría de los límites de la escena. Documento intacto.',
      },
    });
    const card = slice(html, 'data-modeler-card', '</main>');
    expect(card).toContain('data-modeler-wardrobe-edit-error');
    expect(card).toContain('No se aplicó el cambio');
    expect(card).toContain('data-modeler-position-error');
    expect(card).toContain('fuera de los límites');
    expect(card).toContain('data-modeler-duplicate-error');
    expect(card).toContain('role="alert"');
  });

  it('sin «Duplicar» utilizable: el botón NO se renderiza (canDuplicate=false)', () => {
    const html = renderShell({
      mode: 'simple',
      wardrobe: wardrobeFixture(),
      position: positionFixture,
      cardActions: { ...cardActionsFixture, canDuplicate: false },
    });
    const card = slice(html, 'data-modeler-card', '</main>');
    expect(card).not.toContain('data-modeler-duplicate');
  });

  it('sin selección (cardActions=null): sin tarjeta en modo sencillo', () => {
    const html = renderShell({ mode: 'simple', cardActions: null });
    expect(html).not.toContain('data-modeler-card');
  });
});
