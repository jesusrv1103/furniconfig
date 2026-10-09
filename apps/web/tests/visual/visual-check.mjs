/**
 * Verificación visual real de Fases 2A, 2B y 2C con
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
 *
 * Uso: node tests/visual/visual-check.mjs
 * (o npm run test:visual)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { chromium } from 'playwright';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = '/tmp/opencode/fase2c';
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
  await page.getByLabel('Ancho').fill('2800');
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
  check(
    'cerrar las puertas restaura la escena (estabilidad)',
    closeRatio < 0.001,
    `${(closeRatio * 100).toFixed(4)}% de píxeles distintos`,
  );

  // 3f. Dos hojas por módulo (bisagras en los
  // extremos exteriores): 4 módulos → 8 puertas.
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
  await page.getByLabel('Ancho').fill('100');
  await page.waitForTimeout(200);
  const invalidVisible = await page.locator('.viewer-invalid').isVisible();
  const errorPanelVisible = await page.locator('.error-panel').isVisible();
  check('dimensión inválida muestra estado controlado', invalidVisible);
  check('la lista de errores de validación es visible', errorPanelVisible);

  // 8. Restaurar configuración válida
  await page.getByLabel('Ancho').fill('2400');
  await page.locator('.module-card').nth(1).locator('select').selectOption('hanging');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.waitForTimeout(200);
  const restored = !(await page.locator('.viewer-invalid').isVisible());
  text = await summary.innerText();
  check('la configuración vuelve a ser válida', restored);
  check(
    'la barra vuelve a aparecer tras restaurar',
    text.includes('Barras de colgado (1)'),
  );

  // Errores de página (crashes de React/WebGL)
  check('sin errores de página durante la sesión', errors.length === 0, errors[0] ?? '');

  mkdirSync(outDir, { recursive: true });
  for (const [name, buffer] of Object.entries(shots)) {
    writeFileSync(join(outDir, `${name}.png`), buffer);
  }
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
