/**
 * Verificación visual real de Fase 2A con Playwright + Chromium.
 *
 * Lanza el dev server de Vite, abre la aplicación en un
 * Chromium real y verifica —con capturas de pantalla y
 * lectura del DOM— que:
 *
 * 1. El visualizador 3D monta (canvas de R3F presente).
 * 2. El resumen refleja la configuración por defecto,
 *    incluida la barra de colgado.
 * 3. Cambiar el ancho actualiza el resumen Y la escena 3D
 *    (los screenshots difieren).
 * 4. Cambiar el número de módulos actualiza la escena
 *    (más divisiones).
 * 5. La rotación de órbita (drag) y el zoom (rueda)
 *    cambian la vista.
 * 6. La barra aparece/desaparece según el tipo de módulo.
 * 7. Una dimensión inválida muestra el estado de error
 *    controlado (no un crash).
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
const outDir = '/tmp/opencode/fase2a';
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
