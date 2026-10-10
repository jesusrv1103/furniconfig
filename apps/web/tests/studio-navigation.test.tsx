import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConfigPanel } from '../src/components/ConfigPanel.js';
import {
  CONFIG_TAB_IDS,
  CONFIG_TAB_LABELS,
} from '../src/lib/studio/tabs.js';
import { DEFAULT_CONFIG, setDoorsEnabled } from '../src/lib/config.js';

const noop = () => {};

/** React inserta `<!-- -->` entre segmentos de texto en SSR. */
function text(html: string): string {
  return html.replace(/<!--.*?-->/g, '');
}

function panelHtml(activeTab?: (typeof CONFIG_TAB_IDS)[number]) {
  return renderToString(
    <ConfigPanel
      config={DEFAULT_CONFIG}
      onUpdate={noop}
      onReset={noop}
      selectedModuleIndex={null}
      onSelectModule={noop}
      editorMode="simple"
      activeTab={activeTab}
      onTabChange={noop}
    />,
  );
}

describe('ConfigPanel — navegación por categorías (Fase 3E)', () => {
  it('expone las cuatro pestañas con roles y estados ARIA', () => {
    const html = panelHtml();
    expect(html).toContain('role="tablist"');
    for (const id of CONFIG_TAB_IDS) {
      expect(html).toContain(`id="config-tab-${id}"`);
      expect(html).toContain(`role="tab"`);
      expect(html).toContain(`data-config-tab="${id}"`);
      expect(html).toContain(`aria-controls="config-panel-${id}"`);
      expect(text(html)).toContain(CONFIG_TAB_LABELS[id]);
    }
    // Roving tabindex: la activa entra en tabulación, el resto no.
    expect(html).toContain(
      'id="config-tab-medidas" data-config-tab="medidas" aria-selected="true"',
    );
    expect(html).toMatch(
      /id="config-tab-interior"[^>]*tabindex="-1"/,
    );
  });

  it('los cuatro paneles están montados; solo el activo es visible', () => {
    const html = panelHtml();
    for (const id of CONFIG_TAB_IDS) {
      expect(html).toContain(`role="tabpanel"`);
      expect(html).toContain(`id="config-panel-${id}"`);
      expect(html).toContain(`aria-labelledby="config-tab-${id}"`);
    }
    // Medidas activa por defecto: su panel no lleva hidden.
    expect(html).toMatch(
      /id="config-panel-medidas"[^>]*class="config-tabpanel"/,
    );
    expect(html).toMatch(/id="config-panel-interior"[^>]*hidden=""/);
    expect(html).toMatch(/id="config-panel-apariencia"[^>]*hidden=""/);
    expect(html).toMatch(/id="config-panel-disenos"[^>]*hidden=""/);
  });

  it('la pestaña activa controlada cambia el panel visible', () => {
    const html = panelHtml('apariencia');
    expect(html).toMatch(
      /id="config-tab-apariencia"[^>]*aria-selected="true"/,
    );
    expect(html).toMatch(
      /id="config-panel-apariencia"[^>]*class="config-tabpanel"/,
    );
    expect(html).toMatch(/id="config-panel-medidas"[^>]*hidden=""/);
  });

  it('Medidas agrupa dimensiones, número de módulos, distribución y plantillas', () => {
    const html = panelHtml();
    const medidas = html.split('id="config-panel-medidas"')[1]?.split(
      'id="config-panel-interior"',
    )[0];
    expect(medidas).toBeDefined();
    expect(medidas).toContain('data-dimension-input="widthMm"');
    expect(medidas).toContain('data-dimension-input="heightMm"');
    expect(medidas).toContain('data-dimension-input="depthMm"');
    expect(medidas).toContain('aria-label="Número de módulos"');
    expect(medidas).toContain('data-width-status');
    expect(medidas).toContain('data-action="equalize-widths"');
    expect(medidas).toContain('data-action="redistribute-rest"');
    expect(medidas).toContain('data-template-id="mixto"');
    // Las tarjetas de módulos NO viven en Medidas.
    expect(medidas).not.toContain('data-module-index=');
  });

  it('Interior agrupa las tarjetas de módulos y la barra de colgado', () => {
    const html = panelHtml();
    const interior = html.split('id="config-panel-interior"')[1]?.split(
      'id="config-panel-apariencia"',
    )[0];
    expect(interior).toBeDefined();
    expect(interior).toContain('data-module-index="0"');
    expect(interior).toContain('data-module-index="1"');
    expect(interior).toContain('data-module-index="2"');
    // Barra visible con módulos colgados en la configuración base.
    expect(interior).toContain('id="section-rod"');
    // Las dimensiones NO viven en Interior.
    expect(interior).not.toContain('data-dimension-input=');
  });

  it('Apariencia agrupa puertas, panel trasero y materiales', () => {
    const withDoors = setDoorsEnabled(structuredClone(DEFAULT_CONFIG), true);
    const html = renderToString(
      <ConfigPanel
        config={withDoors}
        onUpdate={noop}
        onReset={noop}
        selectedModuleIndex={null}
        onSelectModule={noop}
        editorMode="simple"
      />,
    );
    const apariencia = html.split('id="config-panel-apariencia"')[1]?.split(
      'id="config-panel-disenos"',
    )[0];
    expect(apariencia).toBeDefined();
    expect(apariencia).toContain('aria-label="Puertas del clóset"');
    expect(apariencia).toContain('aria-label="Hojas por módulo"');
    expect(apariencia).toContain('aria-label="Panel trasero"');
    expect(apariencia).toContain('material-card');
    // Los módulos NO viven en Apariencia.
    expect(apariencia).not.toContain('data-module-index=');
  });

  it('el botón Restablecer y la nota del contrato viven fuera de las pestañas', () => {
    const html = panelHtml();
    const afterPanels = html.split('id="config-panel-disenos"')[1] ?? '';
    expect(afterPanels).toContain('Restablecer configuración');
    // La nota del contrato solo en modo avanzado (ver studio-panels).
  });

  it('conserva los atributos y etiquetas de todas las herramientas', () => {
    const html = panelHtml();
    // Atributos que usan las pruebas visuales y la auditoría.
    for (const attribute of [
      'data-dimension-input="widthMm"',
      'data-dimension-input="heightMm"',
      'data-dimension-input="depthMm"',
      'aria-label="Número de módulos"',
      'data-width-status',
      'data-action="equalize-widths"',
      'data-action="redistribute-rest"',
      'data-template-id="mixto"',
      'data-module-index="0"',
      'data-module-index="1"',
      'data-module-index="2"',
      'aria-label="Puertas del clóset"',
      'aria-label="Panel trasero"',
    ]) {
      expect(html).toContain(attribute);
    }
    expect(text(html)).toContain('Ancho');
    expect(text(html)).toContain('Alto');
    expect(text(html)).toContain('Profundidad');
  });
});
