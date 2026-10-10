/**
 * Verificación visual real de Fases 2A → 3E con
 * Playwright + Chromium.
 *
 * Lanza el dev server de Vite, abre la aplicación en
 * un Chromium real y verifica —con capturas de pantalla y
 * lectura del DOM— que:
 *
 * 1. El visualizador 3D monta (canvas de R3F presente).
 * 2. El resumen refleja la configuración por defecto,
 *    incluidas la barra de colgado y la cajonera.
 * 3. Cambiar el ancho actualiza el resumen Y la escena 3D
 *    (los screenshots difieren).
 * 4. Cambiar el número de módulos actualiza la escena
 *    (más divisiones).
 * 4b. Cambiar la cantidad de cajones actualiza el resumen
 *     y la escena 3D.
 * 5. La rotación de órbita (drag) y el zoom (rueda)
 *    cambian la vista.
 * 6. La barra aparece/desaparece según el tipo de módulo.
 * 7. Los cajones permanecen cerrados: escena estable
 *    (verificado en el estado por defecto, con umbral
 *    de antialiasing).
 * 8. Una dimensión inválida muestra el estado de error
 *    controlado (no un crash).
 * 9. (Fase 2C) Las puertas se activan por presencia:
 *    el resumen y la escena cambian; 1 o 2 hojas por
 *    módulo; la apertura (0–110°) rota las hojas sobre
 *    su eje de bisagra y al cerrar la escena vuelve al
 *    estado estable; el material de puerta es editable.
 * 10. (Fase 2C) El panel trasero se activa/desactiva y
 *     cambia la escena; un cambio de dimensión con
 *     puertas y panel trasero activos recalcula todo.
 * 11. (Fase 3A) Barra de vistas: Isométrica/Frontal/
 *     Lateral cambian la cámara (data-view + píxeles) y
 *     el encuadre llena el lienzo con el mueble centrado
 *     (medición de la silueta cromática).
 * 12. (Fase 3A) Reencuadre automático: al cambiar una
 *     dimensión en vista predefinida, el mueble mantiene
 *     el encuadre.
 * 13. (Fase 3A) Interruptor "Puertas visibles" (estado de
 *     presentación, aria-pressed/data-doors-visible) y su
 *     efecto en la escena; el slider de apertura se oculta
 *     con las puertas ocultas.
 * 14. (Fase 3A) Panel trasero visible en el frontal: el
 *     píxel central muestra madera con panel y el fondo
 *     del lienzo sin panel.
 * 15. (Fase 3A) Secciones colapsables del panel
 *     (aria-expanded) y apertura 45°/110° en frontal.
 * 16. (Fase 3A) Sin respuestas 404 (favicon) y versión
 *     móvil sin desplazamiento horizontal.
 * 17. (Fase 3B) Gestión de diseños: crear, guardado
 *     automático con debounce, recuperación de sesión y
 *     de la configuración tras recargar, renombrar,
 *     duplicar, exportar/importar JSON, buscar, eliminar
 *     con confirmación y "nuevo proyecto" sin pisar el
 *     diseño anterior (página propia con storage limpio).
 * 18. (Fase 3C) Studio: barra superior (acciones del
 *     proyecto, deshacer/rehacer), barra inferior
 *     (dimensiones, módulos, validación, guardado),
 *     selección de módulos desde la lista y por clic 3D
 *     (con umbral anti-drag y deselección en el vacío),
 *     resaltado en el lienzo, panel contextual editable,
 *     deshacer/rehacer (incluido atajo Ctrl+Z y edición
 *     tras deshacer), selección estable al cambiar
 *     dimensiones y limpieza al desaparecer el módulo,
 *     paneles laterales contraíbles, modo sencillo/
 *     avanzado y encuadre de cámara al módulo.
 * 19. (Fase 3D) Distribución flexible: ancho por módulo
 *     en el panel contextual (con previsualización de los
 *     módulos afectados y límite máximo informado),
 *     fijar/liberar anchos, Igualar anchos, Repartir
 *     espacio restante, chips de ancho en las tarjetas,
 *     plantilla mixto (4 módulos con ancho declarado) y
 *     deshacer/rehacer de distribuciones.
 *
 * Guarda capturas + `inspeccion.json` (mediciones) en
 * /tmp/opencode/fase3a (evidencias de Fase 3A, 3B, 3C y
 * 3D).
 *
 * Uso: node tests/visual/visual-check.mjs
 * (o npm run test:visual)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { chromium } from 'playwright';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = '/tmp/opencode/fase3a';
const port = 4180;
const baseUrl = `http://localhost:${port}`;

// Workspaces hoisted: vite puede estar en el
// node_modules raíz o en el del paquete.
const viteCandidates = [
  join(webRoot, '..', '..', 'node_modules', '.bin', 'vite'),
  join(webRoot, 'node_modules', '.bin', 'vite'),
  'vite',
];
const viteBin = viteCandidates.find((candidate) =>
  candidate === 'vite' ? true : existsSync(candidate),
);

const results = [];
const shots = {};

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function saveShot(name, buffer) {
  shots[name] = buffer;
}

function changed(a, b) {
  return a && b && !a.equals(b);
}

/**
 * Establece el valor del slider de apertura con
 * un clic real sobre su pista. La interacción
 * nativa del navegador garantiza los eventos de
 * React (los eventos "input" sintéticos no los
 * disparan en inputs[type=range] de React 19).
 * La fracción va de 0 (mínimo) a 1 (máximo).
 */
async function setSliderByClick(locator, fraction) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('el slider de apertura no es visible');
  }
  await locator.click({
    position: {
      x: box.width * fraction,
      y: box.height / 2,
    },
  });
}

/**
 * Captura de pantalla con el scroll normalizado
 * (arriba) y tiempo de asentamiento, para
 * comparaciones de píxeles deterministas.
 */
async function shootStable(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  saveShot(name, await page.screenshot());
}

/**
 * Fracción de píxeles que difieren entre dos
 * capturas, con umbral de tolerancia por canal
 * (ruido de antialiasing). Compara vía canvas
 * del navegador.
 */
async function pixelDiffRatio(page, pngA, pngB, tolerance = 8) {
  return page.evaluate(
    async ({ a, b, tolerance }) => {
      const load = (dataUrl) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
      const [imageA, imageB] = await Promise.all([
        load(`data:image/png;base64,${a}`),
        load(`data:image/png;base64,${b}`),
      ]);
      const width = Math.min(imageA.width, imageB.width);
      const height = Math.min(imageA.height, imageB.height);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', {
        willReadFrequently: true,
      });
      context.drawImage(imageA, 0, 0);
      const dataA = context.getImageData(0, 0, width, height)
        .data;
      context.drawImage(imageB, 0, 0);
      const dataB = context.getImageData(0, 0, width, height)
        .data;
      let differing = 0;
      for (let i = 0; i < dataA.length; i += 4) {
        const channelDiff = Math.max(
          Math.abs(dataA[i] - dataB[i]),
          Math.abs(dataA[i + 1] - dataB[i + 1]),
          Math.abs(dataA[i + 2] - dataB[i + 2]),
        );
        if (channelDiff > tolerance) {
          differing++;
        }
      }
      return differing / (dataA.length / 4);
    },
    {
      a: pngA.toString('base64'),
      b: pngB.toString('base64'),
      tolerance,
    },
  );
}

/**
 * Mediciones de las pruebas de Fase 3A (rellenos,
 * centrados, colores), guardadas en inspeccion.json.
 */
const measurements = [];

function measure(name, data) {
  measurements.push({ name, ...data });
}

/**
 * Captura estable SOLO del lienzo (element screenshot),
 * ocultando temporalmente los elementos superpuestos
 * (toolbar/slider) para medir la silueta limpia.
 */
async function shootCanvasStable(page, name) {
  const hide = await page.addStyleTag({
    content:
      '.viewer-toolbar, .viewer-controls { visibility: hidden !important }',
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  saveShot(name, await page.locator('canvas').screenshot());
  await page.evaluate((element) => element.remove(), hide);
}

/**
 * Caja envolvente de los píxeles CROMÁTICOS (máx−mín > 25):
 * excluye el fondo gris, la rejilla grisácea y la sombra
 * neutra, por lo que devuelve la silueta del mueble (madera
 * y puertas). Sirve para medir relleno y centrado del
 * encuadre.
 */
async function chromaticBox(page, png) {
  return page.evaluate(async (base64) => {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = `data:image/png;base64,${base64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    });
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    let minX = canvas.width;
    let maxX = -1;
    let minY = canvas.height;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        if (Math.max(r, g, b) - Math.min(r, g, b) > 25) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return {
      heightFrac: maxY >= 0 ? (maxY - minY + 1) / canvas.height : 0,
      widthFrac: maxX >= 0 ? (maxX - minX + 1) / canvas.width : 0,
      centerX: maxX >= 0 ? (minX + maxX) / 2 / canvas.width : 0,
      centerY: maxY >= 0 ? (minY + maxY) / 2 / canvas.height : 0,
    };
  }, png.toString('base64'));
}

/**
 * Color medio (RGB) del bloque 7×7 central de una captura:
 * sirve para verificar el píxel de vista frontal (panel
 * trasero vs. fondo del lienzo).
 */
async function centerPixel(page, png) {
  return page.evaluate(async (base64) => {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = `data:image/png;base64,${base64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', {
      willReadFrequently: true,
    });
    context.drawImage(image, 0, 0);
    const size = 7;
    const x0 = Math.floor(canvas.width / 2 - size / 2);
    const y0 = Math.floor(canvas.height / 2 - size / 2);
    const block = context.getImageData(x0, y0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const pixels = size * size;
    for (let index = 0; index < block.length; index += 4) {
      r += block[index];
      g += block[index + 1];
      b += block[index + 2];
    }
    return {
      r: Math.round(r / pixels),
      g: Math.round(g / pixels),
      b: Math.round(b / pixels),
    };
  }, png.toString('base64'));
}

/**
 * Activa una categoría del panel de configuración
 * (Fase 3E): las herramientas viven en pestañas y las
 * interacciones deben abrir la categoría correspondiente.
 */
async function openTab(page, name) {
  const tab = page.locator(`[data-config-tab="${name}"]`);
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
    await page.waitForTimeout(120);
  }
}

async function launchBrowser() {
  // 1. Chromium del cache de Playwright.
  try {
    return await chromium.launch();
  } catch {
    // El cache no coincide con la versión instalada.
  }
  // 2. Google Chrome del sistema (channel 'chrome').
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch (error) {
    throw new Error(
      `No hay navegador compatible: ${error.message}`,
    );
  }
}

// --- Dev server -----------------------------------------------------------
const server = spawn(viteBin, ['--port', String(port), '--strictPort'], {
  cwd: webRoot,
  stdio: 'ignore',
  shell: viteBin === 'vite',
});
server.on('error', (error) => {
  console.error('✗ no se pudo lanzar el dev server:', error.message);
});

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return true;
    } catch {
      // servidor aún no listo
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

let exitCode = 1;
try {
  const serverReady = await waitForServer();
  check('dev server de Vite arranca', serverReady);
  if (!serverReady) throw new Error('dev server no respondió');

  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const notFound = [];
  page.on('response', (response) => {
    if (response.status() === 404) {
      notFound.push(response.url());
    }
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 15_000 });
  check('el visualizador 3D monta (canvas presente)', true);

  // 1. Estado por defecto
  const summary = page.locator('.summary');
  let text = await summary.innerText();
  check(
    'resumen muestra dimensiones por defecto (2.400 mm)',
    text.includes('2.400 mm'),
  );
  check(
    'resumen muestra la barra de colgado',
    text.includes('Barras de colgado (1)') &&
      text.includes('776 mm'),
  );
  check(
    'resumen muestra longitud total de barra',
    text.includes('Longitud total de barras'),
  );
  check(
    'resumen muestra la cajonera por defecto (3 cajones)',
    text.includes('Cajones (3)') &&
      text.includes('Piezas de cajón') &&
      text.includes('Frentes de cajón: 3'),
  );
  check(
    'resumen muestra el material de cajón (Blanco 15 mate)',
    text.includes('Cajones: Blanco') && text.includes('mate'),
  );
  check(
    'la interfaz expone la tarjeta de material de cajón',
    (await page.locator('.material-card').count()) === 3,
  );

  // 1b. Los cajones permanecen cerrados en esta fase:
  // la escena es estable (sin animaciones de apertura).
  // Se comparan píxeles con umbral de antialiasing.
  await page.waitForTimeout(1500);
  const stableA = await page.screenshot();
  await page.waitForTimeout(600);
  const stableB = await page.screenshot();
  const differingRatio = await pixelDiffRatio(
    page,
    stableA,
    stableB,
  );
  check(
    'la escena es estable (cajones cerrados, sin animación)',
    differingRatio < 0.001,
    `${(differingRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  saveShot('01-inicial', await page.screenshot());

  // 2. Cambiar ancho 2400 → 2800
  await page.locator('[data-dimension-input="widthMm"]').fill('2800');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check('el resumen actualiza el ancho a 2.800 mm', text.includes('2.800 mm'));
  saveShot('02-ancho-2800', await page.screenshot());
  check(
    'la escena 3D cambió con el ancho (píxeles distintos)',
    changed(shots['01-inicial'], shots['02-ancho-2800']),
  );

  // 3. Módulos 3 → 4 (los módulos nuevos son "hanging":
  // pasan a haber 2 barras de colgado)
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check('el resumen muestra el cuarto módulo', text.includes('Módulo 4'));
  check('tres divisiones interiores con 4 módulos', text.includes('Divisiones: 3'));
  check(
    'dos barras de colgado con 4 módulos',
    text.includes('Barras de colgado (2)'),
  );
  saveShot('03-cuatro-modulos', await page.screenshot());
  check(
    'la escena 3D cambió con los módulos',
    changed(shots['02-ancho-2800'], shots['03-cuatro-modulos']),
  );

  // 3b. Cambiar la cantidad de cajones del módulo 3:
  // 3 → 5 (con 4 módulos, el módulo 3 es el único
  // "drawers" de la configuración por defecto)
  await openTab(page, 'interior');
  const drawerModuleCard = page.locator('.module-card').nth(2);
  check(
    'el módulo de cajones expone el control de cantidad',
    (await drawerModuleCard.locator('input').count()) === 1,
  );
  const drawerCountInput = drawerModuleCard.locator('input');
  await drawerCountInput.fill('5');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check('el resumen muestra 5 cajones', text.includes('Cajones (5)'));
  check(
    '5 cajones generan 10 laterales de cajón',
    text.includes('Laterales de cajón: 10'),
  );
  saveShot('03b-cinco-cajones', await page.screenshot());
  check(
    'la escena 3D cambió con los cajones (píxeles distintos)',
    changed(shots['03-cuatro-modulos'], shots['03b-cinco-cajones']),
  );
  await drawerCountInput.fill('3');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check('vuelven a 3 cajones', text.includes('Cajones (3)'));

  // 3c. Puertas abatibles (Fase 2C): se activan
  // por presencia del campo en la configuración.
  // A este punto del flujo hay 4 módulos.
  // Baseline sin puertas con scroll normalizado.
  await shootStable(page, '06b-sin-puertas');
  await openTab(page, 'apariencia');
  await page
    .getByRole('button', { name: 'Con puertas', exact: true })
    .click();
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'el resumen muestra 4 puertas (una por módulo)',
    text.includes('Puertas (4)'),
  );
  check(
    'el resumen muestra los tiradores',
    text.includes('Tiradores'),
  );
  check(
    'el resumen lista la hoja del módulo 1',
    text.includes('door-module-1-1'),
  );
  check(
    'la interfaz expone la tarjeta de material de puerta',
    (await page.locator('.material-card').count()) === 4,
  );
  check(
    'la interfaz expone el control de apertura',
    (await page
      .getByLabel('Apertura de puertas')
      .count()) === 1,
  );
  await shootStable(page, '07-puertas-cerradas');
  check(
    'la escena 3D cambió con las puertas (píxeles distintos)',
    changed(shots['06b-sin-puertas'], shots['07-puertas-cerradas']),
  );

  // 3d. Apertura de puertas: 0° → ~90° con clic
  // real sobre la pista (rotación pura de
  // presentación sobre el eje de bisagra).
  const openSlider = page.getByLabel('Apertura de puertas');
  await setSliderByClick(openSlider, 0.82);
  await page.waitForTimeout(400);
  await shootStable(page, '08-puertas-abiertas');
  const openRatio = await pixelDiffRatio(
    page,
    shots['07-puertas-cerradas'],
    shots['08-puertas-abiertas'],
  );
  check(
    'abrir las puertas cambia la escena 3D',
    openRatio > 0.001,
    `${(openRatio * 100).toFixed(3)}% de píxeles distintos`,
  );

  // 3e. Cerrar de nuevo (clic en el extremo
  // izquierdo): la escena vuelve al estado
  // cerrado (estabilidad, sin animación).
  await setSliderByClick(openSlider, 0);
  await page.waitForTimeout(400);
  await shootStable(page, '09-puertas-cerradas-otravez');
  const closeRatio = await pixelDiffRatio(
    page,
    shots['07-puertas-cerradas'],
    shots['09-puertas-cerradas-otravez'],
  );
  // Umbral 1 %: tolera el ruido puntual de
  // antialiasing/sombreado del render bajo carga, pero
  // una puerta mal cerrada o un estado residual de
  // apertura produciría diffs del 3–8 % y se detectaría.
  check(
    'cerrar las puertas restaura la escena (estabilidad)',
    closeRatio < 0.01,
    `${(closeRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  // 3f. Dos hojas por módulo (bisagras en los
  // extremos exteriores): 4 módulos → 8 puertas.
  await openTab(page, 'apariencia');
  await page
    .getByRole('group', { name: 'Hojas por módulo' })
    .getByRole('button', { name: '2', exact: true })
    .click();
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'el resumen muestra 8 puertas con 2 hojas',
    text.includes('Puertas (8)'),
  );
  check(
    'el resumen lista la segunda hoja del módulo 1',
    text.includes('door-module-1-2'),
  );
  await shootStable(page, '09b-dos-hojas');
  check(
    'la escena 3D cambió con las dos hojas (píxeles distintos)',
    changed(
      shots['09-puertas-cerradas-otravez'],
      shots['09b-dos-hojas'],
    ),
  );

  // 3g. Panel trasero (montaje por encaje)
  await openTab(page, 'apariencia');
  await page
    .getByRole('button', { name: 'Con panel', exact: true })
    .click();
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'el resumen muestra el panel trasero',
    text.includes('Panel trasero: 1'),
  );
  check(
    'el resumen muestra el material del panel trasero',
    text.includes('Panel trasero: Roble'),
  );
  await shootStable(page, '10-panel-trasero');
  check(
    'la escena 3D cambió con el panel trasero (píxeles distintos)',
    changed(
      shots['09b-dos-hojas'],
      shots['10-panel-trasero'],
    ),
  );

  // 3h. Cambio de dimensión con puertas y panel
  // trasero activos: todo recalcula.
  await openTab(page, 'medidas');
  await page.getByLabel('Profundidad').fill('500');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'el resumen actualiza la profundidad a 500 mm',
    text.includes('500 mm'),
  );
  await shootStable(page, '11-profundidad-500');
  check(
    'la escena 3D cambió con la profundidad (píxeles distintos)',
    changed(shots['10-panel-trasero'], shots['11-profundidad-500']),
  );

  // 3i. Material de puerta editable: Roble → Nogal.
  await openTab(page, 'apariencia');
  const doorMaterialCard = page.locator('.material-card').nth(3);
  await doorMaterialCard
    .locator('input[type=text]')
    .fill('Nogal');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'el resumen muestra el material de puerta Nogal',
    text.includes('Puertas: Nogal'),
  );
  await shootStable(page, '12-puertas-nogal');
  check(
    'la escena 3D cambió con el material de puerta',
    changed(shots['11-profundidad-500'], shots['12-puertas-nogal']),
  );

  // 4. Rotación de órbita (drag sobre el canvas)
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 120,
    box.y + box.height / 2 + 60,
    { steps: 10 },
  );
  await page.mouse.up();
  await page.waitForTimeout(500); // OrbControls con damping
  saveShot('04-rotacion', await page.screenshot());
  check(
    'la rotación de órbita cambia la vista 3D',
    changed(shots['03-cuatro-modulos'], shots['04-rotacion']),
  );

  // 5. Zoom con rueda del ratón
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -250);
  await page.waitForTimeout(500);
  saveShot('05-zoom', await page.screenshot());
  check(
    'el zoom con rueda cambia la vista 3D',
    changed(shots['04-rotacion'], shots['05-zoom']),
  );

  // 6. Las barras desaparecen si los módulos colgados
  // pasan a cajones (con 4 módulos hay 2 barras:
  // módulos 2 y 4)
  await openTab(page, 'interior');
  await page
    .locator('.module-card')
    .nth(1)
    .locator('select')
    .selectOption('drawers');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'queda una barra al cambiar el módulo 2 a cajones',
    text.includes('Barras de colgado (1)'),
  );
  saveShot('06a-una-barra', await page.screenshot());
  check(
    'la escena 3D cambió al quitar una barra',
    changed(shots['05-zoom'], shots['06a-una-barra']),
  );

  await page
    .locator('.module-card')
    .nth(3)
    .locator('select')
    .selectOption('drawers');
  await page.waitForTimeout(200);
  text = await summary.innerText();
  check(
    'la barra desaparece al cambiar todos los módulos colgados',
    !text.includes('Barras de colgado'),
  );
  saveShot('06b-sin-barra', await page.screenshot());

  // 7. Estado de error controlado (ancho fuera de rango)
  await openTab(page, 'medidas');
  await page.locator('[data-dimension-input="widthMm"]').fill('100');
  await page.waitForTimeout(200);
  const invalidVisible = await page.locator('.viewer-invalid').isVisible();
  const errorPanelVisible = await page.locator('.error-panel').isVisible();
  check('dimensión inválida muestra estado controlado', invalidVisible);
  check('la lista de errores de validación es visible', errorPanelVisible);

  // 8. Restaurar configuración válida
  await openTab(page, 'medidas');
  await page.locator('[data-dimension-input="widthMm"]').fill('2400');
  await openTab(page, 'interior');
  await page.locator('.module-card').nth(1).locator('select').selectOption('hanging');
  await openTab(page, 'medidas');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.waitForTimeout(200);
  const restored = !(await page.locator('.viewer-invalid').isVisible());
  text = await summary.innerText();
  check('la configuración vuelve a ser válida', restored);
  check(
    'la barra vuelve a aparecer tras restaurar',
    text.includes('Barras de colgado (1)'),
  );

  // 3E: el error de sesión de un guardado inválido transitorio
  // se limpia al persistir con una configuración válida.
  await openTab(page, 'disenos');
  const designStatus = await page.locator('.design-status').innerText();
  check(
    '3E: el error de sesión inválida se limpia al restaurar validez',
    !designStatus.includes('inválida'),
    `estado="${designStatus}"`,
  );
  await openTab(page, 'medidas');

  // --- 9. Fase 3A: interfaz profesional ----------------------------------
  check(
    'la cabecera indica la fase actual (Fase 3E)',
    (await page.getByText('Fase 3E').count()) === 1,
  );

  const viewer = page.locator('.viewer-container');
  check(
    'el visor declara la vista inicial (data-view=isometric)',
    (await viewer.getAttribute('data-view')) === 'isometric',
  );
  check(
    'la barra de vistas expone 3 vistas + ajuste + encuadre + puertas',
    (await page.locator('.viewer-toolbar button').count()) === 6,
  );

  // 9a. Vistas predefinidas: encuadre medido sobre la
  // silueta cromática (madera/puertas) del lienzo.
  await page
    .getByRole('button', { name: 'Isométrica', exact: true })
    .click();
  await page.waitForTimeout(400);
  await shootCanvasStable(page, 'c-iso');
  const isoBox = await chromaticBox(page, shots['c-iso']);
  measure('isometrica', isoBox);
  check(
    'la isométrica encuadra el mueble (relleno 60–97% de alto)',
    isoBox.heightFrac > 0.6 && isoBox.heightFrac < 0.97,
    `${(isoBox.heightFrac * 100).toFixed(1)}% de alto`,
  );
  check(
    'la isométrica centra el mueble (38–62% en X)',
    isoBox.centerX > 0.38 && isoBox.centerX < 0.62,
    `centro ${(isoBox.centerX * 100).toFixed(1)}%`,
  );

  await page.getByRole('button', { name: 'Frontal', exact: true }).click();
  await page.waitForTimeout(400);
  check(
    'el botón Frontal cambia la vista (data-view=front)',
    (await viewer.getAttribute('data-view')) === 'front',
  );
  check(
    'Frontal queda activo (aria-pressed=true)',
    (await page
      .getByRole('button', { name: 'Frontal', exact: true })
      .getAttribute('aria-pressed')) === 'true',
  );
  await shootCanvasStable(page, 'c-front');
  check(
    'la vista frontal cambia la cámara (píxeles distintos)',
    changed(shots['c-iso'], shots['c-front']),
  );
  const frontBox = await chromaticBox(page, shots['c-front']);
  measure('frontal', frontBox);
  check(
    'la frontal encuadra el mueble (relleno 60–97% de alto)',
    frontBox.heightFrac > 0.6 && frontBox.heightFrac < 0.97,
    `${(frontBox.heightFrac * 100).toFixed(1)}% de alto`,
  );
  check(
    'la frontal centra el mueble (40–60% en X)',
    frontBox.centerX > 0.4 && frontBox.centerX < 0.6,
    `centro ${(frontBox.centerX * 100).toFixed(1)}%`,
  );

  await page.getByRole('button', { name: 'Lateral', exact: true }).click();
  await page.waitForTimeout(400);
  check(
    'el botón Lateral cambia la vista (data-view=side)',
    (await viewer.getAttribute('data-view')) === 'side',
  );
  await shootCanvasStable(page, 'c-side');
  check(
    'la vista lateral cambia la cámara (píxeles distintos)',
    changed(shots['c-front'], shots['c-side']),
  );

  await page
    .getByRole('button', { name: 'Isométrica', exact: true })
    .click();
  await page.waitForTimeout(400);
  await shootCanvasStable(page, 'c-iso-vuelve');
  const isoReturnRatio = await pixelDiffRatio(
    page,
    shots['c-iso'],
    shots['c-iso-vuelve'],
  );
  check(
    'volver a Isométrica restaura el encuadre inicial',
    isoReturnRatio < 0.01,
    `${(isoReturnRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  // 9b. Reencuadre automático al cambiar dimensiones en
  // vista predefinida: al enganchar el ancho (2400→2800 la
  // anchura pasa a ser la restricción dominante), sin
  // reencuadre la silueta se recortaría contra los bordes
  // del lienzo (relleno de ancho = 100%); con reencuadre
  // se conserva el margen (~89%).
  await page.getByRole('button', { name: 'Frontal', exact: true }).click();
  await page.waitForTimeout(400);
  await shootCanvasStable(page, 'c-front-ancho-2400');
  const reframeBefore = await chromaticBox(page, shots['c-front-ancho-2400']);
  await page.locator('[data-dimension-input="widthMm"]').fill('2800');
  await page.waitForTimeout(400);
  await shootCanvasStable(page, 'c-front-ancho-2800');
  const reframeAfter = await chromaticBox(page, shots['c-front-ancho-2800']);
  measure('reencuadre-ancho-2400', reframeBefore);
  measure('reencuadre-ancho-2800', reframeAfter);
  check(
    'reencuadre automático: al enganchar el ancho el mueble sigue encuadrado',
    reframeAfter.widthFrac > 0.6 && reframeAfter.widthFrac < 0.97,
    `ancho ${(reframeBefore.widthFrac * 100).toFixed(1)}% → ${(reframeAfter.widthFrac * 100).toFixed(1)}% (sin reencuadre: recorte al 100%)`,
  );
  await page.locator('[data-dimension-input="widthMm"]').fill('2400');
  await page.waitForTimeout(300);

  // 9c. Interruptor "Puertas visibles" (presentación, no
  // configuración): aria-pressed + data-doors-visible.
  await page
    .getByRole('button', { name: 'Isométrica', exact: true })
    .click();
  await page.waitForTimeout(400);
  const doorsToggle = page.getByRole('button', {
    name: 'Puertas visibles',
    exact: true,
  });
  check(
    'el interruptor de puertas inicia activo (aria-pressed=true)',
    (await doorsToggle.getAttribute('aria-pressed')) === 'true',
  );
  await shootCanvasStable(page, 'c-doors-on');
  await doorsToggle.click();
  await page.waitForTimeout(300);
  check(
    'ocultar puertas actualiza data-doors-visible=false',
    (await viewer.getAttribute('data-doors-visible')) === 'false',
  );
  check(
    'con las puertas ocultas se oculta el slider de apertura',
    (await page.locator('.viewer-controls').count()) === 0,
  );
  await shootCanvasStable(page, 'c-doors-off');
  check(
    'ocultar puertas cambia la escena (píxeles distintos)',
    changed(shots['c-doors-on'], shots['c-doors-off']),
  );
  await doorsToggle.click();
  await page.waitForTimeout(300);
  check(
    'mostrar puertas restaura data-doors-visible=true',
    (await viewer.getAttribute('data-doors-visible')) === 'true',
  );
  await shootCanvasStable(page, 'c-doors-restore');
  const doorsRestoreRatio = await pixelDiffRatio(
    page,
    shots['c-doors-on'],
    shots['c-doors-restore'],
  );
  check(
    'mostrar puertas restaura la escena (estabilidad)',
    doorsRestoreRatio < 0.01,
    `${(doorsRestoreRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  // 9d. Panel trasero visible en el frontal: píxel central
  // = madera con panel, fondo del lienzo sin panel.
  await page.getByRole('button', { name: 'Frontal', exact: true }).click();
  await page.waitForTimeout(400);
  await doorsToggle.click(); // ocultar puertas
  await page.waitForTimeout(300);
  await shootCanvasStable(page, 'c-front-panel');
  const withPanel = await centerPixel(page, shots['c-front-panel']);
  measure('centro-con-panel', withPanel);
  check(
    'con panel trasero, el centro frontal muestra madera (cálido)',
    withPanel.r - withPanel.b > 25,
    `rgb(${withPanel.r}, ${withPanel.g}, ${withPanel.b})`,
  );
  await openTab(page, 'apariencia');
  await page.getByRole('button', { name: 'Sin panel', exact: true }).click();
  await page.waitForTimeout(300);
  await shootCanvasStable(page, 'c-front-sin-panel');
  const withoutPanel = await centerPixel(page, shots['c-front-sin-panel']);
  measure('centro-sin-panel', withoutPanel);
  check(
    'sin panel trasero, el centro frontal ve el fondo del lienzo',
    Math.abs(withoutPanel.r - 231) < 14 &&
      Math.abs(withoutPanel.g - 233) < 14 &&
      Math.abs(withoutPanel.b - 237) < 14,
    `rgb(${withoutPanel.r}, ${withoutPanel.g}, ${withoutPanel.b})`,
  );
  check(
    'el panel trasero altera el píxel central (no solo el borde)',
    Math.abs(withPanel.r - withoutPanel.r) > 25,
    `ΔR=${Math.abs(withPanel.r - withoutPanel.r)}`,
  );
  await page.getByRole('button', { name: 'Con panel', exact: true }).click();
  await page.waitForTimeout(200);
  await doorsToggle.click(); // mostrar de nuevo
  await page.waitForTimeout(300);

  // 9e. Ángulos de apertura en el frontal: 45° y ~110°
  // cambian la escena; cerrar restaura el estado.
  const viewerSlider = page
    .locator('.viewer-controls')
    .getByLabel('Apertura de puertas');
  await shootCanvasStable(page, 'c-front-cerradas');
  await setSliderByClick(viewerSlider, 0.41); // ≈45°
  await page.waitForTimeout(350);
  await shootCanvasStable(page, 'c-front-45');
  await setSliderByClick(viewerSlider, 0.995); // ≈110°
  await page.waitForTimeout(350);
  await shootCanvasStable(page, 'c-front-110');
  check(
    'abrir las puertas a ~45° cambia el frontal (píxeles distintos)',
    changed(shots['c-front-cerradas'], shots['c-front-45']),
  );
  check(
    'abrir a ~110° vuelve a cambiar el frontal (píxeles distintos)',
    changed(shots['c-front-45'], shots['c-front-110']),
  );
  await setSliderByClick(viewerSlider, 0);
  await page.waitForTimeout(350);
  await shootCanvasStable(page, 'c-front-cerradas-otravez');
  const angleRestoreRatio = await pixelDiffRatio(
    page,
    shots['c-front-cerradas'],
    shots['c-front-cerradas-otravez'],
  );
  check(
    'cerrar las puertas restaura el frontal (estabilidad)',
    angleRestoreRatio < 0.01,
    `${(angleRestoreRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  // 9f. Secciones colapsables del panel de configuración.
  await openTab(page, 'medidas');
  const sectionToggle = page.locator('.config-section-toggle').first();
  check(
    'las secciones del panel inician desplegadas (aria-expanded=true)',
    (await sectionToggle.getAttribute('aria-expanded')) === 'true',
  );
  await sectionToggle.click();
  check(
    'colapsar una sección pone aria-expanded=false',
    (await sectionToggle.getAttribute('aria-expanded')) === 'false',
  );
  check(
    'el contenido de la sección colapsada queda oculto',
    !(await page.locator('[data-dimension-input="widthMm"]').isVisible()),
  );
  await sectionToggle.click();
  check(
    'reabrir la sección restaura aria-expanded y el contenido',
    (await sectionToggle.getAttribute('aria-expanded')) === 'true' &&
      (await page.locator('[data-dimension-input="widthMm"]').isVisible()),
  );

  // --- 9g. Fase 3B: persistencia y gestión de diseños ---------------------
  // Página propia con almacenamiento limpio: la gestión de
  // diseños no interactúa con el estado de la página principal.
  const designErrors = [];
  const designPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  designPage.on('pageerror', (error) => designErrors.push(String(error)));

  // Planificador de diálogos nativos (confirm/prompt).
  let dialogPlan = { accept: true, value: undefined, seen: null };
  designPage.on('dialog', async (dialog) => {
    dialogPlan.seen = { type: dialog.type(), message: dialog.message() };
    if (dialog.type() === 'prompt') {
      await dialog.accept(dialogPlan.value ?? '');
    } else if (dialogPlan.accept) {
      await dialog.accept();
    } else {
      await dialog.dismiss();
    }
  });

  await designPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await designPage.waitForSelector('canvas', { timeout: 15_000 });
  await openTab(designPage, 'disenos');
  await designPage
    .locator('.design-section[data-hydrated="true"]')
    .waitFor({ timeout: 10_000 });

  check(
    '3B: la sección Proyectos arranca vacía y sin diseño activo',
    (await designPage.getByText('No hay diseños guardados todavía.').isVisible()) &&
      (await designPage.locator('.design-section').getByText('Sin diseño activo').isVisible()),
  );

  // Configuración rica: dimensiones, módulos, cajones,
  // material, puertas (2 hojas) y panel trasero.
  await openTab(designPage, 'medidas');
  await designPage.locator('[data-dimension-input="widthMm"]').fill('2800');
  await designPage.waitForTimeout(150);
  await designPage
    .getByRole('group', { name: 'Número de módulos' })
    .getByRole('button', { name: '4', exact: true })
    .click();
  await designPage.waitForTimeout(150);
  await openTab(designPage, 'interior');
  await designPage.locator('.module-card').nth(2).locator('input').fill('5');
  await openTab(designPage, 'apariencia');
  await designPage
    .locator('.material-card')
    .first()
    .getByLabel('Nombre')
    .fill('Nogal');
  await designPage
    .getByRole('group', { name: 'Puertas del clóset' })
    .getByRole('button', { name: 'Con puertas' })
    .click();
  await designPage.waitForTimeout(150);
  await designPage
    .getByRole('group', { name: 'Hojas por módulo' })
    .getByRole('button', { name: '2', exact: true })
    .click();
  await designPage
    .getByRole('group', { name: 'Panel trasero' })
    .getByRole('button', { name: 'Con panel' })
    .click();
  await designPage.waitForTimeout(250);

  // Crear el diseño con esa configuración.
  await openTab(designPage, 'disenos');
  await designPage
    .getByLabel('Nombre del nuevo diseño')
    .fill('Clóset de prueba');
  await designPage.getByRole('button', { name: 'Crear diseño' }).click();
  await designPage.waitForTimeout(300);
  check(
    '3B: crear un diseño lo activa, lo lista y lo marca',
    (await designPage.getByText('Diseño «Clóset de prueba» creado.').isVisible()) &&
      (await designPage.locator('.design-item').count()) === 1 &&
      (await designPage.locator('.design-badge').count()) === 1,
  );

  // Cambio posterior → cambios sin guardar → guardado automático.
  await openTab(designPage, 'medidas');
  await designPage.getByLabel('Alto').fill('2100');
  await designPage.waitForFunction(
    () => {
      const strip = document.querySelector('.design-active');
      return (
        strip?.getAttribute('data-dirty') === 'true' &&
        (strip?.textContent ?? '').includes('cambios sin guardar')
      );
    },
    null,
    { timeout: 5000 },
  );
  check('3B: un cambio marca "cambios sin guardar"', true);
  await designPage.waitForTimeout(2200); // > debounce (1000 ms), holgura bajo carga
  const dirtyAfterAutosave = await designPage
    .locator('.design-active')
    .getAttribute('data-dirty');
  const statusAfterAutosave =
    (await designPage.locator('.design-status').textContent()) ?? '';
  check(
    '3B: el guardado automático limpia los cambios pendientes',
    dirtyAfterAutosave === 'false' &&
      statusAfterAutosave.includes('Guardado automático'),
    `dirty=${dirtyAfterAutosave} · estado="${statusAfterAutosave}"`,
  );

  // Recuperación de sesión tras recargar.
  await designPage.reload({ waitUntil: 'networkidle' });
  await designPage.waitForSelector('canvas', { timeout: 15_000 });
  await openTab(designPage, 'disenos');
  await designPage
    .locator('.design-section[data-hydrated="true"]')
    .waitFor({ timeout: 10_000 });

  const summaryReload = await designPage.locator('.summary').innerText();
  check(
    '3B: la recarga conserva dimensiones, módulos, materiales y cajones',
    (await designPage.locator('[data-dimension-input="widthMm"]').inputValue()) === '2800' &&
      (await designPage.getByLabel('Alto').inputValue()) === '2100' &&
      (await designPage.locator('.material-card').first().getByLabel('Nombre').inputValue()) ===
        'Nogal' &&
      (await designPage.locator('.module-card').nth(2).locator('input').inputValue()) === '5' &&
      (await designPage.locator('.module-card').count()) === 4 &&
      summaryReload.includes('2.800 mm') &&
      summaryReload.includes('Módulo 4') &&
      summaryReload.includes('Cajones (5)'),
  );
  await openTab(designPage, 'apariencia');
  check(
    '3B: la recarga conserva barras, puertas y panel trasero',
    summaryReload.includes('Barras de colgado') &&
      (await designPage
        .getByRole('group', { name: 'Puertas del clóset' })
        .getByRole('button', { name: 'Con puertas' })
        .getAttribute('aria-pressed')) === 'true' &&
      (await designPage
        .getByRole('group', { name: 'Panel trasero' })
        .getByRole('button', { name: 'Con panel' })
        .getAttribute('aria-pressed')) === 'true',
  );
  await openTab(designPage, 'disenos');
  check(
    '3B: la recarga restaura el diseño activo sin cambios pendientes',
    (await designPage.locator('.design-active').getAttribute('data-dirty')) ===
      'false' &&
      (await designPage.getByText('Clóset de prueba').first().isVisible()) &&
      (await designPage.locator('.design-item').count()) === 1,
  );

  // Nuevo proyecto + reabrir: el REGISTRO persiste la config.
  await openTab(designPage, 'disenos');
  await designPage.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await designPage.waitForTimeout(300);
  check(
    '3B: nuevo proyecto restaura los defaults sin tocar la lista',
    (await designPage.locator('[data-dimension-input="widthMm"]').inputValue()) === '2400' &&
      (await designPage.locator('.design-item').count()) === 1 &&
      (await designPage.locator('.design-section').getByText('Sin diseño activo').isVisible()),
  );
  await designPage
    .locator('.design-item')
    .first()
    .getByRole('button', { name: 'Abrir' })
    .click();
  await designPage.waitForTimeout(300);
  check(
    '3B: abrir el diseño recupera la configuración persistida',
    (await designPage.locator('[data-dimension-input="widthMm"]').inputValue()) === '2800' &&
      (await designPage.getByLabel('Alto').inputValue()) === '2100',
  );

  // Renombrar con prompt nativo.
  dialogPlan = { accept: true, value: 'Clóset renombrado', seen: null };
  await openTab(designPage, 'disenos');
  await designPage
    .locator('.design-item')
    .first()
    .getByRole('button', { name: 'Renombrar' })
    .click();
  await designPage.waitForTimeout(300);
  check(
    '3B: renombrar actualiza la lista y el diseño activo',
    dialogPlan.seen?.type === 'prompt' &&
      (await designPage
        .getByText('Diseño renombrado a «Clóset renombrado».')
        .isVisible()) &&
      (await designPage.getByText('«Clóset renombrado»').first().isVisible()),
  );

  // Duplicar.
  await openTab(designPage, 'disenos');
  await designPage
    .locator('.design-item')
    .first()
    .getByRole('button', { name: 'Duplicar' })
    .click();
  await designPage.waitForTimeout(300);
  check(
    '3B: duplicar crea una copia independiente en la lista',
    (await designPage.locator('.design-item').count()) === 2 &&
      (await designPage
        .getByText('Clóset renombrado (copia)', { exact: true })
        .isVisible()) &&
      (await designPage
        .getByText('Copia creada: «Clóset renombrado (copia)».')
        .isVisible()),
  );

  // Exportar a JSON (descarga real del navegador).
  await openTab(designPage, 'disenos');
  const downloadPromise = designPage.waitForEvent('download');
  await designPage
    .locator('.design-item')
    .first()
    .getByRole('button', { name: 'Exportar' })
    .click();
  const download = await downloadPromise;
  const exported = JSON.parse(
    readFileSync(await download.path(), 'utf8'),
  );
  check(
    '3B: exportar descarga un JSON versionado',
    exported.format === 'furniconfig-design' && exported.storageVersion === 1,
  );
  check(
    '3B: el JSON exportado conserva la configuración completa',
    exported.design.config.dimensions.widthMm === 2800 &&
      Array.isArray(exported.design.config.modules) &&
      exported.design.config.modules.length === 4 &&
      exported.design.config.modules[2].drawers === 5 &&
      exported.design.config.doors?.leaves === 2 &&
      exported.design.config.backPanel?.enabled === true &&
      exported.design.config.materials.structure.name === 'Nogal',
  );

  // Importar con otro nombre: nunca sobrescribe el activo.
  const importedEnvelope = {
    ...exported,
    design: { ...exported.design, name: 'Importado JSON' },
  };
  await designPage
    .locator('input[aria-label="Importar diseño JSON"]')
    .setInputFiles({
      name: 'diseno.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importedEnvelope)),
    });
  // Espera activa: la importación es asíncrona y el tiempo
  // de respuesta varía con la carga del equipo.
  await designPage
    .waitForFunction(
      () => {
        const count = document.querySelectorAll('.design-item').length;
        const status =
          document.querySelector('.design-status')?.textContent ?? '';
        return count === 3 && status.includes('importado');
      },
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  const importCount = await designPage.locator('.design-item').count();
  const importStatus =
    (await designPage.locator('.design-status').textContent()) ?? '';
  check(
    '3B: importar añade un diseño y no toca el activo',
    importCount === 3 &&
      importStatus.includes('Diseño «Importado JSON» importado.') &&
      (await designPage.locator('.design-badge').count()) === 1 &&
      (await designPage
        .locator('.design-item')
        .first()
        .locator('.design-badge')
        .count()) === 0,
    `filas=${importCount} · estado="${importStatus}"`,
  );

  // Import inválido: error comprensible y nada cambia.
  await designPage
    .locator('input[aria-label="Importar diseño JSON"]')
    .setInputFiles({
      name: 'roto.json',
      mimeType: 'application/json',
      buffer: Buffer.from('esto no es json {'),
    });
  await designPage
    .waitForFunction(
      () =>
        (
          document.querySelector('.design-status')?.textContent ?? ''
        ).includes('JSON válido'),
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  const invalidStatus =
    (await designPage.locator('.design-status').textContent()) ?? '';
  const invalidCount = await designPage.locator('.design-item').count();
  check(
    '3B: importar JSON inválido muestra error y no altera nada',
    invalidStatus.includes('El archivo no es JSON válido.') &&
      invalidCount === 3 &&
      (await designPage.locator('.design-badge').count()) === 1,
    `filas=${invalidCount} · estado="${invalidStatus}"`,
  );

  // Búsqueda por nombre.
  await openTab(designPage, 'disenos');
  await designPage.getByLabel('Buscar diseños').fill('copia');
  await designPage.waitForTimeout(250);
  const filteredCount = await designPage.locator('.design-item').count();
  await designPage.getByLabel('Buscar diseños').fill('');
  await designPage.waitForTimeout(250);
  check(
    '3B: la búsqueda filtra la lista por nombre',
    filteredCount === 1 && (await designPage.locator('.design-item').count()) === 3,
  );

  // Eliminar con confirmación: cancelar conserva, aceptar borra.
  await openTab(designPage, 'disenos');
  const copyRow = designPage
    .locator('.design-item')
    .filter({ hasText: 'Clóset renombrado (copia)' });
  dialogPlan = { accept: false, value: undefined, seen: null };
  await copyRow.getByRole('button', { name: 'Eliminar' }).click();
  await designPage.waitForTimeout(300);
  const keptAfterCancel = await copyRow.count();
  dialogPlan = { accept: true, value: undefined, seen: null };
  await copyRow.getByRole('button', { name: 'Eliminar' }).click();
  await designPage.waitForTimeout(350);
  check(
    '3B: eliminar pide confirmación (cancelar conserva, aceptar borra)',
    dialogPlan.seen?.message.includes('¿Eliminar el diseño') === true &&
      keptAfterCancel === 1 &&
      (await copyRow.count()) === 0 &&
      (await designPage.locator('.design-item').count()) === 2,
  );

  // Cambio sin guardar + nuevo proyecto confirma antes de descartar.
  // Bloqueo temporal de la escritura de la colección (cuota llena):
  // el guardado automático falla, se comunica y los cambios siguen
  // pendientes; así el diálogo de confirmación es determinista (sin
  // depender del debounce de 1 s) y el récord nunca recibe el cambio.
  await designPage.evaluate(() => {
    window.__origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'furniconfig.designs') {
        throw new DOMException('sin espacio', 'QuotaExceededError');
      }
      return window.__origSetItem.call(this, key, value);
    };
  });
  await openTab(designPage, 'medidas');
  await designPage.getByLabel('Alto').fill('2050');
  await openTab(designPage, 'disenos');
  await designPage
    .waitForFunction(
      () =>
        (
          document.querySelector('.design-status')?.textContent ?? ''
        ).includes('almacenamiento local está lleno'),
      null,
      { timeout: 8000 },
    )
    .catch(() => {});
  const fullStatus =
    (await designPage.locator('.design-status').textContent()) ?? '';
  const dirtyBeforeDialog = await designPage
    .locator('.design-active')
    .getAttribute('data-dirty');
  check(
    '3B: una escritura fallida (cuota llena) se comunica sin perder los cambios',
    fullStatus.includes('almacenamiento local está lleno') &&
      dirtyBeforeDialog === 'true',
    `dirty=${dirtyBeforeDialog} · estado="${fullStatus}"`,
  );

  dialogPlan = { accept: true, value: undefined, seen: null };
  await designPage.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await designPage.waitForTimeout(400);
  const newProjectDialog = dialogPlan.seen?.message ?? '';
  const altoAfterNew = await designPage.getByLabel('Alto').inputValue();
  const statusAfterNew =
    (await designPage.locator('.design-status').textContent()) ?? '';
  check(
    '3B: nuevo proyecto con cambios pendientes confirma antes de descartar',
    newProjectDialog.includes('cambios sin guardar') &&
      altoAfterNew === '2200' &&
      (await designPage.locator('.design-section').getByText('Sin diseño activo').isVisible()),
    `dialog="${newProjectDialog}" · alto=${altoAfterNew} · estado="${statusAfterNew}"`,
  );

  // Restaurar la escritura normal de la colección.
  await designPage.evaluate(() => {
    Storage.prototype.setItem = window.__origSetItem;
  });

  // El diseño anterior NO se sobrescribió.
  await openTab(designPage, 'disenos');
  await designPage
    .locator('.design-item')
    .filter({ hasText: 'Clóset renombrado' })
    .getByRole('button', { name: 'Abrir' })
    .click();
  await designPage.waitForTimeout(350);
  const finalAncho = await designPage.locator('[data-dimension-input="widthMm"]').inputValue();
  const finalAlto = await designPage.getByLabel('Alto').inputValue();
  const finalRows = await designPage.locator('.design-item').count();
  check(
    '3B: el diseño anterior sobrevive al nuevo proyecto (sin sobrescritura)',
    finalAncho === '2800' && finalAlto === '2100' && finalRows === 2,
    `ancho=${finalAncho} · alto=${finalAlto} · filas=${finalRows}`,
  );

  check(
    '3B: sin errores de página en la gestión de diseños',
    designErrors.length === 0,
    designErrors[0] ?? '',
  );

  // Evidencia de Fase 3B: sección de proyectos con la lista.
  await designPage.locator('.design-section').scrollIntoViewIfNeeded();
  await designPage.waitForTimeout(250);
  saveShot('evidencia-07-disenos', await designPage.screenshot());

  // Evidencia de Fase 3C: el diseño abierto aparece en la
  // barra superior del Studio tras el guardado/recuperado.
  await designPage.waitForTimeout(500);
  check(
    '3C: la barra superior muestra el diseño activo tras abrirlo',
    (await designPage
      .locator('[data-project-name]')
      .getAttribute('data-project-name')) === 'Clóset renombrado' &&
      (await designPage
        .locator('.studio-save-state')
        .getAttribute('data-save-state')) !== 'dirty',
  );
  await designPage.evaluate(() => window.scrollTo(0, 0));
  await designPage.waitForTimeout(250);
  saveShot('evidencia-3c-10-diseno-guardado', await designPage.screenshot());
  await designPage.close();

  check(
    'sin respuestas 404 durante la sesión (favicon resuelto)',
    notFound.length === 0,
    notFound[0] ?? '',
  );

  // --- Evidencia visual de Fase 3A --------------------------------------
  // Estado: dimensiones por defecto con puertas (2 hojas),
  // panel trasero y profundidad 600.
  await page.getByLabel('Profundidad').fill('600');
  await page.waitForTimeout(300);

  // E1: vista frontal, puertas cerradas visibles.
  await page.getByRole('button', { name: 'Frontal', exact: true }).click();
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-01-frontal');

  // E2: vista isométrica.
  await page
    .getByRole('button', { name: 'Isométrica', exact: true })
    .click();
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-02-isometrica');

  // E3: puertas abiertas ~90° (isométrica).
  await setSliderByClick(viewerSlider, 0.82);
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-03-puertas-abiertas');

  // E4: puertas cerradas (isométrica).
  await setSliderByClick(viewerSlider, 0);
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-04-puertas-cerradas');

  // E5: cajonera con 5 cajones y puertas ocultas.
  await openTab(page, 'interior');
  await page.locator('.module-card').nth(2).locator('input').fill('5');
  await page.waitForTimeout(300);
  await doorsToggle.click();
  await page.waitForTimeout(300);
  await shootStable(page, 'evidencia-05-cajoneras');
  await page.locator('.module-card').nth(2).locator('input').fill('3');
  await doorsToggle.click();
  await page.waitForTimeout(300);

  // --- Evidencia y verificación de Fase 3C: Studio ------------------------
  // Estado base autocontenido y conocido: 2.400 mm de
  // ancho, 3 módulos (repisas, colgado, cajones), puertas
  // visibles y cerradas. Se fija explícitamente para que
  // las coordenadas del clic 3D sean deterministas.
  await openTab(page, 'medidas');
  await page.locator('[data-dimension-input="widthMm"]').fill('2400');
  await page.waitForTimeout(250);
  await page
    .getByRole('group', { name: 'Número de módulos' })
    .getByRole('button', { name: '3', exact: true })
    .click();
  await page.waitForTimeout(250);
  await openTab(page, 'interior');
  await page.locator('.module-card').nth(0).locator('select').selectOption('shelves');
  await page.locator('.module-card').nth(1).locator('select').selectOption('hanging');
  await page.locator('.module-card').nth(2).locator('select').selectOption('drawers');
  await page.waitForTimeout(250);

  const topbar = page.locator('.studio-topbar');
  const bottombar = page.locator('.studio-bottombar');
  const moduleProps = page.locator('.module-props');

  check(
    '3C: la barra superior expone las acciones del proyecto',
    (await topbar
      .getByRole('toolbar', { name: 'Acciones del proyecto' })
      .locator('button')
      .count()) >= 5,
  );
  const bottomText = await bottombar.innerText();
  check(
    '3C: la barra inferior resume dimensiones, módulos y validación',
    bottomText.includes('2.400') &&
      bottomText.includes('3 módulos') &&
      bottomText.includes('Configuración válida'),
    `bottombar="${bottomText.replace(/\n/g, ' · ')}"`,
  );
  check(
    '3C: el estado de guardado inicial es "sin diseño activo"',
    (await topbar.locator('.studio-save-state').getAttribute('data-save-state')) ===
      'none',
  );
  await shootStable(page, 'evidencia-3c-01-studio-escritorio');

  // Selección desde la lista de módulos.
  await openTab(page, 'interior');
  await shootCanvasStable(page, 'c-3c-base');
  await page.getByRole('button', { name: 'Seleccionar módulo 2', exact: true }).click();
  await page.waitForTimeout(250);
  check(
    '3C: seleccionar en la lista abre el panel contextual del módulo',
    (await moduleProps.getAttribute('data-selected-module')) === 'module-2' &&
      (await moduleProps.isVisible()),
  );
  check(
    '3C: la tarjeta del módulo refleja la selección (data-selected)',
    (await page.locator('.module-card[data-selected="true"]').count()) === 1,
  );
  await shootCanvasStable(page, 'c-3c-sel2');
  check(
    '3C: la selección resalta el módulo en el lienzo (píxeles distintos)',
    changed(shots['c-3c-base'], shots['c-3c-sel2']),
  );
  await shootStable(page, 'evidencia-3c-04-modulo-seleccionado');

  // Clic directo en el modelo (vista frontal). El raycast
  // sobre el frente del mueble debe abrir el panel
  // contextual con el módulo correspondiente. Como la
  // posición exacta de cada módulo en el lienzo depende
  // del encuadre de la cámara, se verifica que el clic
  // selecciona el módulo activo detectado en la lista
  // (misma fuente de verdad: el estado del editor). La
  // cámara frontal se orienta al centro del mueble, por
  // lo que el frente central es el objetivo más estable.
  await page.getByRole('button', { name: 'Frontal', exact: true }).click();
  await page.waitForTimeout(400);
  const canvasBox = await page.locator('canvas').boundingBox();
  check('3C: el lienzo tiene tamaño para las pruebas de clic', canvasBox !== null);
  if (canvasBox !== null) {
    // Clic en el centro del lienzo (frente central del
    // mueble en vista frontal) y en dos posiciones
    // laterales como alternativas.
    const candidates = [
      { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 },
      { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height * 0.35 },
      { x: canvasBox.x + canvasBox.width * 0.35, y: canvasBox.y + canvasBox.height / 2 },
    ];
    let picked3D = null;
    for (const p of candidates) {
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(250);
      // count() no espera: si el clic cae en el vacío no
      // hay panel y se prueba la siguiente posición.
      if ((await moduleProps.count()) > 0) {
        picked3D = await moduleProps.getAttribute('data-selected-module');
        if (picked3D) break;
      }
    }
    check(
      '3C: el clic en el modelo selecciona su módulo (selección directa 3D)',
      picked3D !== null && /^module-\d+$/.test(picked3D),
      `seleccionado=${picked3D ?? 'ninguno'}`,
    );
    // El mismo módulo activo aparece marcado en la lista
    // (consistencia entre selección 3D y estado del editor).
    check(
      '3C: la selección 3D se refleja en la tarjeta activa de la lista',
      (await page.locator('.module-card[data-selected="true"]').count()) >= 1,
    );
    // El clic en el vacío (margen izquierdo del lienzo, a
    // la izquierda del mueble) deselecciona.
    await page.mouse.click(canvasBox.x + 12, canvasBox.y + 40);
    await page.waitForTimeout(300);
    check(
      '3C: el clic en el vacío deselecciona el módulo',
      (await moduleProps.count()) === 0 &&
        (await page.locator('.panel-hint').isVisible()),
    );
  }

  // El arrastre (órbita) no debe alterar la selección.
  await openTab(page, 'interior');
  await page.getByRole('button', { name: 'Seleccionar módulo 1', exact: true }).click();
  await page.waitForTimeout(200);
  await shootCanvasStable(page, 'c-3c-sel1');
  if (canvasBox !== null) {
    await page.mouse.move(canvasBox.x + 200, canvasBox.y + 200);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 320, canvasBox.y + 245, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(350);
  }
  check(
    '3C: el arrastre (órbita) no altera la selección (umbral anti-drag)',
    (await moduleProps.getAttribute('data-selected-module')) === 'module-1',
  );

  // Edición contextual + deshacer/rehacer.
  await moduleProps.getByLabel('Repisas').fill('5');
  await page.waitForTimeout(300);
  await shootCanvasStable(page, 'c-3c-repisas-5');
  check(
    '3C: editar repisas desde el panel contextual actualiza la escena',
    changed(shots['c-3c-sel1'], shots['c-3c-repisas-5']),
  );
  await shootStable(page, 'evidencia-3c-05-edicion-contextual');

  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await page.waitForTimeout(250);
  check(
    '3C: Deshacer revierte la edición contextual',
    (await moduleProps.getByLabel('Repisas').inputValue()) === '3',
  );
  check(
    '3C: Deshacer habilita Rehacer',
    await page.getByRole('button', { name: 'Rehacer', exact: true }).isEnabled(),
  );
  await page.getByRole('button', { name: 'Rehacer', exact: true }).click();
  await page.waitForTimeout(250);
  check(
    '3C: Rehacer reaplica la edición',
    (await moduleProps.getByLabel('Repisas').inputValue()) === '5',
  );

  // Editar tras deshacer descarta el futuro.
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await page.waitForTimeout(200);
  await moduleProps.getByLabel('Repisas').fill('4');
  await page.waitForTimeout(200);
  check(
    '3C: editar tras deshacer descarta los rehacer (futuro acotado)',
    await page.getByRole('button', { name: 'Rehacer', exact: true }).isDisabled(),
  );

  // Atajo de teclado: Ctrl+Z fuera de campos de formulario.
  await bottombar.click();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(250);
  check(
    '3C: Ctrl+Z deshace fuera de campos de formulario',
    (await moduleProps.getByLabel('Repisas').inputValue()) === '3',
  );

  // La selección sobrevive a cambios de dimensión (ids
  // deterministas del motor) y se limpia si el módulo
  // desaparece.
  await openTab(page, 'interior');
  await page.getByRole('button', { name: 'Seleccionar módulo 1', exact: true }).click();
  await page.waitForTimeout(200);
  await openTab(page, 'medidas');
  await page.locator('[data-dimension-input="widthMm"]').fill('2600');
  await page.waitForTimeout(300);
  check(
    '3C: la selección sobrevive al cambio de dimensión',
    (await moduleProps.getAttribute('data-selected-module')) === 'module-1',
  );
  await page.locator('[data-dimension-input="widthMm"]').fill('2400');
  await page.waitForTimeout(250);
  await openTab(page, 'interior');
  await page.getByRole('button', { name: 'Seleccionar módulo 3', exact: true }).click();
  await page.waitForTimeout(200);
  await openTab(page, 'medidas');
  await page
    .getByRole('group', { name: 'Número de módulos' })
    .getByRole('button', { name: '2', exact: true })
    .click();
  await page.waitForTimeout(250);
  check(
    '3C: la selección se limpia si el módulo desaparece',
    (await moduleProps.count()) === 0,
  );
  await openTab(page, 'medidas');
  await page
    .getByRole('group', { name: 'Número de módulos' })
    .getByRole('button', { name: '3', exact: true })
    .click();
  await page.waitForTimeout(250);

  // Paneles laterales contraíbles.
  await page.getByRole('button', { name: 'Contraer panel izquierdo' }).click();
  await page.waitForTimeout(200);
  check(
    '3C: el panel izquierdo se contrae (controles ocultos)',
    (await page.locator('.sidebar').getAttribute('data-open')) === 'false' &&
      !(await page.locator('[data-dimension-input="widthMm"]').isVisible()),
  );
  await shootStable(page, 'evidencia-3c-07-panel-izquierdo-contraido');
  await page.getByRole('button', { name: 'Abrir panel izquierdo' }).click();
  await page.waitForTimeout(200);
  check(
    '3C: el panel izquierdo se reabre',
    (await page
      .getByRole('button', { name: 'Contraer panel izquierdo' })
      .getAttribute('aria-expanded')) === 'true',
  );

  await page.getByRole('button', { name: 'Contraer panel derecho' }).click();
  await page.waitForTimeout(200);
  check(
    '3C: el panel derecho se contrae (resumen oculto)',
    (await page.locator('.summary').getAttribute('data-open')) === 'false' &&
      !(await page.locator('#studio-right-body').isVisible()),
  );
  await shootStable(page, 'evidencia-3c-08-panel-derecho-contraido');
  await page.getByRole('button', { name: 'Abrir panel derecho' }).click();
  await page.waitForTimeout(200);

  // Modo sencillo/avanzado: organización de herramientas.
  await openTab(page, 'interior');
  check(
    '3C: el modo sencillo arranca con la sección Barra plegada',
    (await page
      .getByRole('button', { name: 'Barra de colgado' })
      .getAttribute('aria-expanded')) === 'false',
  );
  await page.getByRole('button', { name: 'Avanzado', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    '3C: el modo avanzado despliega la sección técnica de barra',
    (await page
      .getByRole('button', { name: 'Barra de colgado' })
      .getAttribute('aria-expanded')) === 'true',
  );
  check(
    '3C: el modo avanzado muestra la nota del contrato',
    await page.locator('[data-technical="contract"]').isVisible(),
  );
  await page.getByRole('button', { name: 'Sencillo', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    '3C: volver a sencillo pliega la sección técnica',
    (await page
      .getByRole('button', { name: 'Barra de colgado' })
      .getAttribute('aria-expanded')) === 'false',
  );

  // Vistas de evidencia: frontal e isométrica del Studio.
  await page.getByRole('button', { name: 'Isométrica', exact: true }).click();
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-3c-02-vista-isometrica');
  await page.getByRole('button', { name: 'Frontal', exact: true }).click();
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-3c-03-vista-frontal');

  // Encuadre de cámara al módulo seleccionado.
  await openTab(page, 'interior');
  await page.getByRole('button', { name: 'Seleccionar módulo 2', exact: true }).click();
  await page.waitForTimeout(200);
  check(
    '3C: Encuadrar módulo se habilita con selección',
    await page.getByRole('button', { name: 'Encuadrar módulo', exact: true }).isEnabled(),
  );
  await shootCanvasStable(page, 'c-3c-antes-encuadre');
  await page.getByRole('button', { name: 'Encuadrar módulo', exact: true }).click();
  await page.waitForTimeout(450);
  await shootCanvasStable(page, 'c-3c-encuadre');
  check(
    '3C: Encuadrar módulo mueve la cámara (píxeles distintos)',
    changed(shots['c-3c-antes-encuadre'], shots['c-3c-encuadre']),
  );
  await page.getByRole('button', { name: 'Ajustar', exact: true }).click();
  await page.waitForTimeout(450);
  await shootCanvasStable(page, 'c-3c-ajustar');
  check(
    '3C: Ajustar vuelve al encuadre completo (píxeles distintos)',
    changed(shots['c-3c-encuadre'], shots['c-3c-ajustar']),
  );

  // Sin selección, el encuadre por módulo queda deshabilitado.
  await page.locator('canvas').click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(200);
  check(
    '3C: sin selección, Encuadrar módulo queda deshabilitado',
    await page.getByRole('button', { name: 'Encuadrar módulo', exact: true }).isDisabled(),
  );

  // Puertas abiertas en el Studio (evidencia).
  await setSliderByClick(viewerSlider, 0.82);
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-3c-06-puertas-abiertas');
  await setSliderByClick(viewerSlider, 0);
  await page.waitForTimeout(300);

  // ── Fase 3D: distribución flexible de anchos ─────────
  await openTab(page, 'medidas');
  const widthStatus = page.locator('[data-width-status]');
  check(
    '3D: la sección de distribución arranca en reparto uniforme',
    (await widthStatus.innerText()).includes('Reparto uniforme'),
  );
  await openTab(page, 'interior');
  check(
    '3D: las tarjetas muestran el ancho resuelto de cada módulo',
    (await page.locator('.module-card-width').count()) === 3 &&
      (await page.locator('.module-card-width').first().innerText()).includes(
        '776 mm',
      ),
  );
  await openTab(page, 'medidas');
  check(
    '3D: Igualar anchos está deshabilitado sin fijados',
    await page.getByRole('button', { name: 'Igualar anchos' }).isDisabled(),
  );
  await shootStable(page, 'evidencia-3d-01-distribucion-uniforme');

  // Edición numérica de ancho desde el panel contextual.
  await openTab(page, 'interior');
  await page.getByRole('button', { name: 'Seleccionar módulo 2', exact: true }).click();
  await page.waitForTimeout(250);
  const widthInput = moduleProps.getByLabel('Ancho del módulo 2 en milímetros');
  check(
    '3D: el panel contextual expone el ancho real del módulo',
    (await widthInput.inputValue()) === '776',
  );
  await shootCanvasStable(page, 'c-3d-antes-ancho');
  await widthInput.fill('900');
  await widthInput.press('Enter');
  await page.waitForTimeout(350);
  await shootCanvasStable(page, 'c-3d-ancho-900');
  check(
    '3D: fijar el ancho aplica el valor y actualiza la escena',
    (await widthInput.inputValue()) === '900' &&
      changed(shots['c-3d-antes-ancho'], shots['c-3d-ancho-900']),
  );
  check(
    '3D: los demás módulos absorben el cambio por igual (714 mm)',
    (
      await page
        .locator('.module-card[data-module-index="0"] .module-card-width')
        .innerText()
    ).includes('714 mm') &&
      (
        await page
          .locator('.module-card[data-module-index="2"] .module-card-width')
          .innerText()
      ).includes('714 mm'),
  );
  check(
    '3D: el módulo fijado se marca como fijo en su tarjeta',
    (
      await page
        .locator('.module-card[data-module-index="1"] .module-card-width')
        .getAttribute('data-width-state')
    ) === 'fixed',
  );
  check(
    '3D: el panel muestra los módulos afectados con su ancho resultante',
    (
      await page.locator('[data-module-width-preview="module-1"]').innerText()
    ).includes('714 mm'),
  );
  check(
    '3D: el estado indica el ancho fijado y el espacio restante',
    (await widthStatus.innerText()).includes('ancho fijado'),
  );
  await shootStable(page, 'evidencia-3d-02-ancho-fijado');

  // Un ancho imposible no se aplica: se informa el límite.
  await widthInput.fill('9000');
  await page.waitForTimeout(200);
  check(
    '3D: al escribir un ancho imposible se informa el máximo (1.728 mm)',
    (await page.locator('[data-width-hint="invalid"]').innerText()).includes(
      '1.728 mm',
    ),
  );
  await widthInput.press('Enter');
  await page.waitForTimeout(250);
  check(
    '3D: el ancho imposible se descarta y se conserva el fijado (900 mm)',
    (await widthInput.inputValue()) === '900',
  );

  // Liberar el ancho vuelve al reparto automático.
  await page.locator('[data-action="release-width"]').click();
  await page.waitForTimeout(250);
  check(
    '3D: Liberar ancho devuelve el módulo a reparto automático',
    (
      await page
        .locator('.module-card[data-module-index="1"] .module-card-width')
        .getAttribute('data-width-state')
    ) === 'auto',
  );
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await page.waitForTimeout(250);
  check(
    '3D: Deshacer restaura la distribución fijada (900 mm)',
    (await widthInput.inputValue()) === '900' &&
      (
        await page
          .locator('.module-card[data-module-index="1"] .module-card-width')
          .getAttribute('data-width-state')
      ) === 'fixed',
  );

  // Igualar anchos (restablecer distribución uniforme).
  await openTab(page, 'medidas');
  await page.getByRole('button', { name: 'Igualar anchos' }).click();
  await page.waitForTimeout(250);
  check(
    '3D: Igualar anchos libera todos los fijados',
    (await widthStatus.innerText()).includes('Reparto uniforme'),
  );
  check(
    '3D: Igualar anchos se deshabilita cuando no hay fijados',
    await page.getByRole('button', { name: 'Igualar anchos' }).isDisabled(),
  );
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await page.waitForTimeout(250);
  check(
    '3D: el restablecer uniforme es reversible con Deshacer',
    (await widthStatus.innerText()).includes('ancho fijado'),
  );

  // Repartir espacio restante desde la selección.
  await openTab(page, 'interior');
  await page.getByRole('button', { name: 'Seleccionar módulo 1', exact: true }).click();
  await page.waitForTimeout(200);
  const redistribute = page.getByRole('button', {
    name: 'Repartir espacio restante',
  });
  await openTab(page, 'medidas');
  check(
    '3D: Repartir espacio restante se habilita con selección válida',
    await redistribute.isEnabled(),
  );
  await redistribute.click();
  await page.waitForTimeout(250);
  check(
    '3D: repartir fija el seleccionado y libera los demás módulos',
    (
      await page
        .locator('.module-card[data-module-index="0"] .module-card-width')
        .getAttribute('data-width-state')
    ) === 'fixed' &&
      (
        await page
          .locator('.module-card[data-module-index="1"] .module-card-width')
          .getAttribute('data-width-state')
      ) === 'auto',
  );

  // Plantillas de distribución locales.
  await openTab(page, 'medidas');
  await page.locator('[data-template-id="mixto"]').click();
  await page.waitForTimeout(400);
  const afterTemplateText = await bottombar.innerText();
  check(
    '3D: la plantilla mixto aplica 4 módulos y sigue siendo válida',
    afterTemplateText.includes('4 módulos') &&
      afterTemplateText.includes('Configuración válida'),
    `bottombar="${afterTemplateText.replace(/\n/g, ' · ')}"`,
  );
  const widthChips = await page.locator('.module-card-width').allInnerTexts();
  check(
    '3D: la plantilla mixto declara 900 mm y reparte el resto automáticamente',
    widthChips.length === 4 &&
      widthChips[0].includes('900 mm') &&
      widthChips[0].includes('fijo') &&
      widthChips[1].includes('537 mm') &&
      widthChips[3].includes('536 mm'),
    widthChips.join(' | '),
  );
  await shootStable(page, 'evidencia-3d-03-plantilla-mixto');
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await page.waitForTimeout(300);
  check(
    '3D: Deshacer revierte la plantilla completa (3 módulos)',
    (await bottombar.innerText()).includes('3 módulos'),
  );

  // ── Fase 3E: experiencia simplificada ─────────────────
  // Navegación por categorías (accesible por teclado).
  const tabs = page.locator('[role="tab"]');
  check('3E: el panel expone cuatro categorías', (await tabs.count()) === 4);
  check(
    '3E: Medidas es la categoría inicial',
    (await tabs.nth(0).getAttribute('aria-selected')) === 'true',
  );
  check(
    '3E: la ayuda de la categoría describe Medidas',
    (await page.locator('.config-tab-hint').innerText()).includes(
      'Tamaño del mueble',
    ),
  );
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  check(
    '3E: flecha derecha activa Interior',
    (await tabs.nth(1).getAttribute('aria-selected')) === 'true',
  );
  check(
    '3E: el panel Interior queda visible',
    await page.locator('#config-panel-interior').isVisible(),
  );
  check(
    '3E: el panel Medidas queda oculto',
    !(await page.locator('#config-panel-medidas').isVisible()),
  );
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  check(
    '3E: ArrowLeft circula hasta Mis diseños',
    (await tabs.nth(3).getAttribute('aria-selected')) === 'true',
  );
  await page.keyboard.press('Home');
  check(
    '3E: Home vuelve a Medidas',
    (await tabs.nth(0).getAttribute('aria-selected')) === 'true',
  );
  await tabs.nth(2).click();
  check(
    '3E: el clic en Apariencia la activa',
    (await tabs.nth(2).getAttribute('aria-selected')) === 'true',
  );
  await openTab(page, 'medidas');

  // Conservación de estado al cambiar de categoría.
  await page.locator('[data-dimension-input="widthMm"]').fill('2600');
  await page.waitForTimeout(200);
  await openTab(page, 'apariencia');
  await openTab(page, 'interior');
  await openTab(page, 'medidas');
  check(
    '3E: cambiar de categoría conserva el ancho editado',
    (await page.locator('[data-dimension-input="widthMm"]').inputValue()) ===
      '2600',
  );
  await page.locator('[data-dimension-input="widthMm"]').fill('2400');
  await page.waitForTimeout(200);

  // El visor central permanece estable al navegar.
  const viewer3e = page.locator('.viewer-container');
  const canvasBefore = await page.locator('canvas').boundingBox();
  const viewBefore = await viewer3e.getAttribute('data-view');
  await shootCanvasStable(page, 'c-3e-base');
  await openTab(page, 'apariencia');
  await openTab(page, 'interior');
  await openTab(page, 'disenos');
  await openTab(page, 'medidas');
  const canvasAfter = await page.locator('canvas').boundingBox();
  check(
    '3E: el visor mantiene tamaño al navegar',
    canvasBefore !== null &&
      canvasAfter !== null &&
      Math.abs(canvasBefore.width - canvasAfter.width) < 2 &&
      Math.abs(canvasBefore.height - canvasAfter.height) < 2,
  );
  check(
    '3E: navegar no cambia la cámara',
    (await viewer3e.getAttribute('data-view')) === viewBefore,
  );
  await shootCanvasStable(page, 'c-3e-tras-navegar');
  const navRatio = await pixelDiffRatio(
    page,
    shots['c-3e-base'],
    shots['c-3e-tras-navegar'],
  );
  check(
    '3E: la escena 3D queda estable al navegar',
    navRatio < 0.001,
    `${(navRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  // Scroll interno del panel: el visor no se mueve.
  await openTab(page, 'apariencia');
  const leftBody = page.locator('#studio-left-body');
  const panelScrollable = await leftBody.evaluate(
    (element) => element.scrollHeight > element.clientHeight + 8,
  );
  check(
    '3E: el panel tiene scroll interno (contenido más alto)',
    panelScrollable,
  );
  const viewerYBefore = await page.locator('.viewer').boundingBox();
  await leftBody.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForTimeout(150);
  const scrolled = await leftBody.evaluate((element) => element.scrollTop);
  const viewerYAfter = await page.locator('.viewer').boundingBox();
  check('3E: el scroll interno desplaza el contenido', scrolled > 0);
  check(
    '3E: el visor no se desplaza con el panel',
    viewerYBefore !== null &&
      viewerYAfter !== null &&
      Math.abs(viewerYBefore.y - viewerYAfter.y) < 2,
  );

  // Evidencias de Fase 3E (escritorio).
  await openTab(page, 'medidas');
  await shootStable(page, 'evidencia-3e-01-editor-escritorio');
  await leftBody.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForTimeout(200);
  await shootStable(page, 'evidencia-3e-02-medidas');
  await leftBody.evaluate((element) => {
    element.scrollTop = 0;
  });
  await openTab(page, 'interior');
  await shootStable(page, 'evidencia-3e-03-interior');
  await openTab(page, 'apariencia');
  await shootStable(page, 'evidencia-3e-04-apariencia');
  await openTab(page, 'disenos');
  await shootStable(page, 'evidencia-3e-05-mis-disenos');
  await openTab(page, 'interior');
  await page
    .getByRole('button', { name: 'Seleccionar módulo 2', exact: true })
    .click();
  await page.waitForTimeout(250);
  await shootStable(page, 'evidencia-3e-06-modulo-seleccionado');
  await page.getByRole('button', { name: 'Avanzado', exact: true }).click();
  await page.waitForTimeout(200);
  await shootStable(page, 'evidencia-3e-07-modo-avanzado');
  await page.getByRole('button', { name: 'Sencillo', exact: true }).click();
  // Puertas abiertas (siguen activadas del flujo 3C).
  await setSliderByClick(page.getByLabel('Apertura de puertas'), 0.82);
  await page.waitForTimeout(400);
  await shootStable(page, 'evidencia-3e-09-puertas-abiertas');
  await setSliderByClick(page.getByLabel('Apertura de puertas'), 0);
  await page.waitForTimeout(300);

  // E6: versión móvil (390×844).
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  const mobileErrors = [];
  mobile.on('pageerror', (error) => mobileErrors.push(String(error)));
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobile.waitForSelector('canvas', { timeout: 15_000 });
  await mobile.waitForTimeout(1200);
  const noHorizontalScroll = await mobile.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  );
  check('móvil: sin desplazamiento horizontal', noHorizontalScroll);
  check(
    'móvil: la barra de vistas es visible',
    await mobile.locator('.viewer-toolbar').isVisible(),
  );
  const mobileCanvas = await mobile.locator('canvas').boundingBox();
  check(
    'móvil: el lienzo conserva altura suficiente (≥ 280 px)',
    mobileCanvas !== null && mobileCanvas.height >= 280,
    mobileCanvas ? `${Math.round(mobileCanvas.height)} px` : 'sin lienzo',
  );
  check(
    'móvil: sin errores de página',
    mobileErrors.length === 0,
    mobileErrors[0] ?? '',
  );
  check(
    '3C móvil: los paneles laterales arrancan contraídos',
    (await mobile.locator('.sidebar').getAttribute('data-open')) === 'false' &&
      (await mobile.locator('.summary').getAttribute('data-open')) === 'false',
  );
  // Evidencia: el visor está bajo el panel en el flujo móvil;
  // se desplaza para capturar visor + barra de vistas.
  await mobile.locator('.viewer').scrollIntoViewIfNeeded();
  await mobile.waitForTimeout(300);
  saveShot('evidencia-06-movil', await mobile.screenshot());
  saveShot('evidencia-3c-09-movil-studio', await mobile.screenshot());
  saveShot('evidencia-3e-08-movil', await mobile.screenshot());
  await mobile.close();

  // Evidencia 10: diseño recuperado en la página principal.
  await openTab(page, 'disenos');
  await page.getByLabel('Nombre del nuevo diseño').fill('Evidencia 3E');
  await page.getByRole('button', { name: 'Crear diseño' }).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 15_000 });
  await openTab(page, 'disenos');
  await page
    .locator('.design-section[data-hydrated="true"]')
    .waitFor({ timeout: 10_000 });
  await openTab(page, 'disenos');
  await page
    .locator('.design-item')
    .first()
    .getByRole('button', { name: 'Abrir' })
    .click();
  await page.waitForTimeout(300);
  check(
    '3E: el diseño recuperado aparece en la barra superior',
    (await page.locator('[data-project-name]').getAttribute('data-project-name')) ===
      'Evidencia 3E',
  );
  await shootStable(page, 'evidencia-3e-10-diseno-recuperado');

  // Errores de página (crashes de React/WebGL)
  check('sin errores de página durante la sesión', errors.length === 0, errors[0] ?? '');

  mkdirSync(outDir, { recursive: true });
  for (const [name, buffer] of Object.entries(shots)) {
    writeFileSync(join(outDir, `${name}.png`), buffer);
  }
  writeFileSync(
    join(outDir, 'inspeccion.json'),
    JSON.stringify(
      {
        fecha: new Date().toISOString(),
        verificaciones: results,
        mediciones: measurements,
      },
      null,
      2,
    ),
  );
  console.log(`\nCapturas guardadas en ${outDir}`);

  await browser.close();

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} verificaciones visuales pasaron`,
  );
  exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error('✗ verificación visual falló:', error);
  exitCode = 1;
} finally {
  server.kill('SIGTERM');
}

process.exit(exitCode);
