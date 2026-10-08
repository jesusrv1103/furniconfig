import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { App } from '../src/App.js';
import { DEFAULT_CONFIG, setDimension, setModuleCount } from '../src/lib/config.js';

describe('renderizado básico de la aplicación', () => {
  it('renderiza la interfaz con la configuración por defecto', () => {
    const html = renderToString(<App />);
    expect(html).toContain('FurniConfig');
    expect(html).toContain('Visualizador de clósets modulares');
  });

  it('renderiza los controles de configuración', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Ancho');
    expect(html).toContain('Alto');
    expect(html).toContain('Profundidad');
    expect(html).toContain('Módulos');
    expect(html).toContain('Materiales y acabados');
    expect(html).toContain('Restablecer configuración');
  });

  it('renderiza el resumen geométrico en estado válido', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Resumen geométrico');
    expect(html).toContain('2.400 mm');
    expect(html).toContain('Entrepaños');
    expect(html).toContain('Paneles por tipo');
    // React SSR separa texto e interpolaciones con comentarios.
    expect(html).toMatch(/Módulo <!-- -->1/);
  });

  it('el visualizador 3D se carga diferidamente (Suspense)', () => {
    const html = renderToString(<App />);
    // En servidor el lazy chunk no se resuelve: muestra el fallback.
    expect(html).toContain('Cargando visualizador 3D');
  });

  it('acepta una configuración inicial alternativa', () => {
    const html = renderToString(
      <App initialConfig={setDimension(DEFAULT_CONFIG, 'widthMm', 1200)} />,
    );
    expect(html).toContain('1.200 mm');
  });
});

describe('manejo de errores de validación', () => {
  it('muestra el estado inválido y los errores del motor', () => {
    const invalid = setDimension(DEFAULT_CONFIG, 'widthMm', -1);
    const html = renderToString(<App initialConfig={invalid} />);
    expect(html).toContain('Configuración inválida');
    expect(html).toContain('Errores de validación');
    expect(html).toContain('dimensions.widthMm');
    // El resumen de medidas solo se renderiza con geometría válida.
    expect(html).not.toContain('Ancho útil interior');
  });

  it('muestra errores de módulos inválidos', () => {
    // La validación de forma pasa, pero el motor no puede
    // distribuir 4 módulos en 800 mm: la app lo detecta como
    // configuración no renderizable y muestra el error del motor.
    const narrow = setModuleCount(
      setDimension(DEFAULT_CONFIG, 'widthMm', 800),
      4,
    );
    const html = renderToString(<App initialConfig={narrow} />);
    expect(html).toContain('Configuración inválida');
    expect(html).toContain('engine');
    expect(html).toContain('no alcanza');
  });

  it('muestra múltiples errores a la vez', () => {
    const invalid = {
      ...DEFAULT_CONFIG,
      dimensions: { widthMm: 0, heightMm: -5, depthMm: 9999 },
    };
    const html = renderToString(<App initialConfig={invalid} />);
    // React SSR intercala comentarios entre texto e interpolaciones.
    expect(html).toMatch(/Errores de validación \(\s*<!-- -->3<!-- -->\)/);
    expect(html).toContain('dimensions.widthMm');
    expect(html).toContain('dimensions.heightMm');
    expect(html).toContain('dimensions.depthMm');
  });
});

describe('no mutación de datos', () => {
  it('la configuración inicial no se muta al renderizar', () => {
    const initial = structuredClone(DEFAULT_CONFIG);
    const snapshot = JSON.stringify(initial);
    renderToString(<App initialConfig={initial} />);
    expect(JSON.stringify(initial)).toBe(snapshot);
  });
});
