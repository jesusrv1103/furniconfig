import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { ModulePropertiesPanel } from '../src/components/studio/ModulePropertiesPanel.js';
import { TopBar } from '../src/components/studio/TopBar.js';
import { BottomBar } from '../src/components/studio/BottomBar.js';
import { DEFAULT_CONFIG, setModuleKind } from '../src/lib/config.js';
import { moduleContext } from '../src/lib/studio/selection.js';

const noop = () => {};

/** React inserta `<!-- -->` entre segmentos de texto en SSR. */
function text(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

function contextFor(index: number) {
  const geometry = calculateGeometry(DEFAULT_CONFIG);
  const context = moduleContext(geometry, geometry.wardrobe.modules[index]?.id ?? null);
  if (context === null) {
    throw new Error(`sin contexto para el módulo ${index}`);
  }
  return context;
}

describe('ModulePropertiesPanel (panel contextual)', () => {
  it('muestra número, tipo y dimensiones resueltas del módulo', () => {
    const html = renderToString(
      <ModulePropertiesPanel
        context={contextFor(0)}
        config={DEFAULT_CONFIG}
        mode="simple"
        onUpdate={noop}
        onDeselect={noop}
      />,
    );
    expect(html).toContain('data-selected-module="module-1"');
    expect(text(html)).toContain('Módulo 1');
    expect(html).toContain('Repisas');
    // Control de repisas presente para kind = shelves.
    expect(html).toContain('Repisas');
    expect(html).toContain('data-module-dim="width"');
    // Sin nota técnica en modo sencillo.
    expect(html).not.toContain('data-technical="module"');
  });

  it('expone cajones para un módulo de cajones', () => {
    const config = setModuleKind(DEFAULT_CONFIG, 2, 'drawers');
    const geometry = calculateGeometry(config);
    const context = moduleContext(geometry, 'module-3');
    const html = renderToString(
      <ModulePropertiesPanel
        context={context ?? contextFor(0)}
        config={config}
        mode="simple"
        onUpdate={noop}
        onDeselect={noop}
      />,
    );
    expect(html).toContain('data-module-kind="drawers"');
    expect(html).toContain('Cajones');
  });

  it('expone el diámetro de barra para un módulo colgado', () => {
    const html = renderToString(
      <ModulePropertiesPanel
        context={contextFor(1)}
        config={DEFAULT_CONFIG}
        mode="simple"
        onUpdate={noop}
        onDeselect={noop}
      />,
    );
    expect(html).toContain('data-module-kind="hanging"');
    expect(html).toContain('Espacio para colgar');
    expect(html).toContain('Diámetro de la barra');
  });

  it('muestra la nota técnica solo en modo avanzado', () => {
    const html = renderToString(
      <ModulePropertiesPanel
        context={contextFor(0)}
        config={DEFAULT_CONFIG}
        mode="advanced"
        onUpdate={noop}
        onDeselect={noop}
      />,
    );
    expect(html).toContain('data-technical="module"');
  });
});

describe('TopBar (barra superior)', () => {
  it('refleja proyecto, estado de guardado y disponibilidad de historial', () => {
    const html = renderToString(
      <TopBar
        projectName="Diseño A"
        saveState="dirty"
        canUndo={true}
        canRedo={false}
        onNewDesign={noop}
        onSave={noop}
        onUndo={noop}
        onRedo={noop}
        onOpenProjects={noop}
      />,
    );
    expect(html).toContain('FurniConfig Studio');
    expect(html).toContain('data-project-name="Diseño A"');
    expect(html).toContain('data-save-state="dirty"');
    expect(html).toContain('Cambios sin guardar');
    // Guardar habilitado con cambios; Rehacer deshabilitado sin futuro.
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Guardar/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Rehacer/);
  });

  it('deshabilita Guardar sin diseño activo', () => {
    const html = renderToString(
      <TopBar
        projectName="Proyecto sin título"
        saveState="none"
        canUndo={false}
        canRedo={false}
        onNewDesign={noop}
        onSave={noop}
        onUndo={noop}
        onRedo={noop}
        onOpenProjects={noop}
      />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Guardar/);
    expect(html).toContain('Sin diseño activo');
  });
});

describe('BottomBar (barra inferior)', () => {
  it('muestra dimensiones, módulos, validación y guardado', () => {
    const html = renderToString(
      <BottomBar
        widthMm={2400}
        heightMm={2200}
        depthMm={600}
        moduleCount={3}
        valid={true}
        issueCount={0}
        saveState="clean"
      />,
    );
    expect(html).toContain('data-bottombar="dimensions"');
    expect(text(html)).toContain('2.400 × 2.200 × 600 mm');
    expect(text(html)).toContain('3 módulos');
    expect(html).toContain('data-valid="true"');
    expect(html).toContain('Configuración válida');
    expect(html).toContain('Guardado');
  });

  it('anuncia errores de validación y cambios sin guardar', () => {
    const html = renderToString(
      <BottomBar
        widthMm={100}
        heightMm={2200}
        depthMm={600}
        moduleCount={3}
        valid={false}
        issueCount={2}
        saveState="dirty"
      />,
    );
    expect(html).toContain('data-valid="false"');
    expect(html).toContain('2 errores de validación');
    expect(html).toContain('Cambios sin guardar');
  });
});
