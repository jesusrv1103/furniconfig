/**
 * FASE-4C-A — verificación visual REAL del modelador
 * (Playwright + Chromium), independiente del suite de las 200
 * pruebas del configurador (NO modifica sus criterios ni
 * umbrales).
 *
 * Verifica en Chromium:
 *
 * 1. Apertura del modelador (carga directa de `#/modeler`).
 * 2. Canvas y rejilla visibles (variación real de píxeles +
 *    etiquetas de ejes X/Y/Z en el DOM).
 * 3. Controles de cámara (Isométrica/Frontal/Lateral/Ajustar:
 *    cambio de estado y de píxeles).
 * 4. Navegación al configurador y regreso (enlace, atrás y
 *    adelante del navegador).
 * 5. Ausencia de errores de consola, de página y respuestas
 *    404/5xx (acumulados durante TODAS las secciones, incluido
 *    el modelado libre de la7).
 * 6. Correcta visualización en resolución de escritorio
 *    (1440×900, sin desplazamiento horizontal).
 * 7. Modelado libre (4C-B): herramientas, dibujo con LMB y
 *    cotas en vivo con snap, cotas exactas por campo,
 *    cancelación con Escape, extrusión con generación real del
 *    Worker (bajo demanda), selección por clic sobre el sólido
 *    (proyección determinista vía `__modelerProject`),
 *    edición de cotas, deselección en vacío y eliminación.
 *
 * Guarda evidencia reproducible (capturas + informe.json) en
 * /tmp/opencode/4c-a.
 *
 * Uso: node scripts/modeler-visual-check.mjs
 * (o npm run test:visual:modeler)
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { chromium } from 'playwright';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/tmp/opencode/4c-a';
const port = 4185;
const baseUrl = `http://localhost:${port}`;

// Workspaces hoisted: vite puede estar en el node_modules raíz o en el del paquete.
const viteCandidates = [
  join(webRoot, '..', '..', 'node_modules', '.bin', 'vite'),
  join(webRoot, 'node_modules', '.bin', 'vite'),
  'vite',
];
const viteBin = viteCandidates.find((candidate) =>
  candidate === 'vite' ? true : existsSync(candidate),
);

const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch {
    return await chromium.launch({ channel: 'chrome' });
  }
}

/** Captura con scroll normalizado y asentamiento (clip opcional de región). */
async function shootStable(page, name, clip = null) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const buffer = await page.screenshot(clip ? { clip } : {});
  writeFileSync(join(outDir, `${name}.png`), buffer);
  return buffer;
}

/**
 * Fracción de píxeles (0..1) del recorte dado que difieren de
 * su color dominante: mide "hay dibujo real" (rejilla, ejes)
 * frente a un lienzo plano de fondo. Se decodifica en el
 * navegador (sin dependencias de imagen en node).
 */
async function contentRatio(page, png, clip) {
  return page.evaluate(
    async ({ png, clip }) => {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `data:image/png;base64,${png}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = clip.width;
      canvas.height = clip.height;
      const context = canvas.getContext('2d');
      context.drawImage(
        image,
        clip.x,
        clip.y,
        clip.width,
        clip.height,
        0,
        0,
        clip.width,
        clip.height,
      );
      const { data } = context.getImageData(
        0,
        0,
        clip.width,
        clip.height,
      );
      // Color dominante por muestreo (cada 4 px).
      const counts = new Map();
      for (let i = 0; i < data.length; i += 16) {
        const key = `${data[i] >> 3}:${data[i + 1] >> 3}:${data[i + 2] >> 3}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      let max = 0;
      for (const value of counts.values()) {
        if (value > max) max = value;
      }
      const sampled = data.length / 16;
      return 1 - max / sampled;
    },
    { png, clip },
  );
}

/**
 * Cuenta píxeles por color de eje (rojo/verde/azul saturado)
 * dentro del recorte: verifica que los ejes X/Y/Z se DIBUJAN
 * en el canvas (son sprites en escena, no elementos del DOM).
 */
async function axisPixelCounts(page, png, clip) {
  return page.evaluate(
    async ({ png, clip }) => {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = `data:image/png;base64,${png}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = clip.width;
      canvas.height = clip.height;
      const context = canvas.getContext('2d');
      context.drawImage(
        image,
        clip.x,
        clip.y,
        clip.width,
        clip.height,
        0,
        0,
        clip.width,
        clip.height,
      );
      const { data } = context.getImageData(0, 0, clip.width, clip.height);
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > g + 40 && r > b + 40) red += 1;
        else if (g > r + 30 && g > b + 30) green += 1;
        else if (b > r + 40 && b > g + 40) blue += 1;
      }
      return { red, green, blue };
    },
    { png, clip },
  );
}

/** Fracción de píxeles que difieren entre dos capturas (umbral por canal). */
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
      const sample = (image) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, width, height).data;
      };
      const dataA = sample(imageA);
      const dataB = sample(imageB);
      let different = 0;
      const total = width * height;
      for (let i = 0; i < dataA.length; i += 4) {
        const delta =
          Math.abs(dataA[i] - dataB[i]) +
          Math.abs(dataA[i + 1] - dataB[i + 1]) +
          Math.abs(dataA[i + 2] - dataB[i + 2]);
        if (delta > tolerance * 3) different += 1;
      }
      return different / total;
    },
    { a: pngA.toString('base64'), b: pngB.toString('base64'), tolerance },
  );
}

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
mkdirSync(outDir, { recursive: true });

try {
  const serverReady = await waitForServer();
  check('dev server de Vite arranca (puerto 4185)', serverReady);
  if (!serverReady) throw new Error('dev server no respondió');

  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  const consoleErrors = [];
  const pageErrors = [];
  const notFound = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      notFound.push(`${response.status()} ${response.url()}`);
    }
  });

  // --- 1. Apertura directa del modelador -------------------
  await page.goto(`${baseUrl}/#/modeler`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  const brand = await page.locator('.modeler-brand-name').innerText();
  check('1a. carga directa de #/modeler monta el modelador', true, brand);
  check(
    '1b. el hash se conserva tras cargar',
    new URL(page.url()).hash === '#/modeler',
  );
  check(
    '1c. identidad visible (FurniConfig Modeler)',
    brand.trim() === 'FurniConfig Modeler',
  );
  const engineText = await page.locator('[data-modeler-engine]').innerText();
  check(
    '1d. estado honesto del motor (en reposo, sin Worker)',
    engineText.includes('en reposo'),
    engineText.trim(),
  );
  const toolButtons = await page
    .locator('[data-modeler-tools-placeholder] button')
    .count();
  check('1e. sin botones inactivos en Herramientas', toolButtons === 0);
  await shootStable(page, '01-modelador-carga');

  // --- 2. Canvas y rejilla visibles ------------------------
  await page.waitForSelector('[data-modeler-scene] canvas', {
    timeout: 15_000,
  });
  const canvasBox = await page
    .locator('[data-modeler-scene] canvas')
    .boundingBox();
  check(
    '2a. canvas del modelador con tamaño útil',
    canvasBox !== null && canvasBox.width > 800 && canvasBox.height > 500,
    canvasBox ? `${Math.round(canvasBox.width)}×${Math.round(canvasBox.height)}` : 'sin canvas',
  );
  const shot = await shootStable(page, '02-rejilla');
  const canvasClip = {
    x: Math.round(canvasBox.x),
    y: Math.round(canvasBox.y),
    width: Math.round(canvasBox.width),
    height: Math.round(canvasBox.height),
  };
  const content = await contentRatio(page, shot.toString('base64'), canvasClip);
  check(
    '2b. rejilla/ejes con dibujo real (variación de píxeles)',
    content > 0.01,
    `ratio=${content.toFixed(3)}`,
  );
  const axes = await axisPixelCounts(page, shot.toString('base64'), canvasClip);
  check(
    '2c. ejes X, Y y Z dibujados en el canvas (sprites de color)',
    axes.red > 50 && axes.green > 50 && axes.blue > 50,
    `rojo=${axes.red} verde=${axes.green} azul=${axes.blue}`,
  );
  const legend = await page.locator('.modeler-scene-legend').innerText();
  check('2d. leyenda de unidades/rejilla visible', legend.includes('100 mm'));

  // --- 3. Controles de cámara ------------------------------
  const viewGroup = page.locator('[data-modeler-view]');
  const pressed = async () => {
    const buttons = await viewGroup.locator('button[aria-pressed]').all();
    for (const button of buttons) {
      if ((await button.getAttribute('aria-pressed')) === 'true') {
        return (await button.innerText()).trim();
      }
    }
    return null;
  };
  check('3a. arranca en Isométrica', (await pressed()) === 'Isométrica');
  const isoCanvas = await shootStable(page, '02-iso-canvas', canvasClip);

  await page.getByRole('button', { name: 'Frontal' }).click();
  await page.waitForTimeout(300);
  check('3b. Frontal queda activa (aria-pressed)', (await pressed()) === 'Frontal');
  const shotFront = await shootStable(page, '03-frontal', canvasClip);
  // Se comparan SOLO las píxeles del canvas (la barra lateral
  // también cambia por aria-pressed y enmascararía el efecto).
  // Tolerancia ajustada a la escena: rejilla gris claro sobre
  // fondo gris claro (delta rejilla↔fondo ≈ 22 por suma de
  // canales); con tolerancia 4 (umbral 12) los cambios reales
  // de perspectiva cuentan y el ruido, no.
  const frontDiff = await pixelDiffRatio(page, isoCanvas, shotFront, 4);
  check(
    '3c. Frontal cambia la vista (píxeles del canvas)',
    frontDiff > 0.02,
    `diff=${(frontDiff * 100).toFixed(1)}%`,
  );

  await page.getByRole('button', { name: 'Lateral' }).click();
  await page.waitForTimeout(300);
  check('3d. Lateral queda activa', (await pressed()) === 'Lateral');
  await shootStable(page, '04-lateral');

  await page.getByRole('button', { name: 'Ajustar la vista a la escena' }).click();
  await page.waitForTimeout(300);
  check(
    '3e. Ajustar re-aplica sin cambiar de vista activa',
    (await pressed()) === 'Lateral',
  );

  await page.getByRole('button', { name: 'Isométrica' }).click();
  await page.waitForTimeout(300);
  check('3f. vuelve a Isométrica', (await pressed()) === 'Isométrica');

  // --- 4. Navegación al configurador y regreso -------------
  await page.locator('[data-modeler-back]').click();
  await page.waitForSelector('section.viewer canvas', { timeout: 15_000 });
  check('4a. enlace "Volver al configurador" abre el configurador', true);
  check(
    '4b. hash del configurador (#/)',
    new URL(page.url()).hash === '#/',
    new URL(page.url()).hash,
  );
  await shootStable(page, '05-configurador');

  await page.goBack();
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  check(
    '4c. "atrás" del navegador regresa al modelador',
    new URL(page.url()).hash === '#/modeler',
  );

  await page.goForward();
  await page.waitForSelector('section.viewer canvas', { timeout: 15_000 });
  check(
    '4d. "adelante" del navegador vuelve al configurador',
    new URL(page.url()).hash === '#/',
  );

  await page.goBack();
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  await page.waitForTimeout(600); // asentamiento: cualquier error React asíncrono debe haberse emitido ya

  // --- 7. Modelado libre (4C-B: B5/B6) ----------------------
  // Dibujo de rectángulo con LMB, cotas en vivo con snap,
  // cotas exactas por campo, cancelación con Escape, extrusión
  // con generación real del Worker, selección por clic sobre el
  // sólido (proyección determinista), edición de cotas,
  // deselección en vacío y eliminación. El remontaje anterior
  // garantiza documento vacío y herramienta "Seleccionar".

  await page.getByRole('button', { name: 'Rectángulo' }).click();
  const rectPressed = await page
    .getByRole('button', { name: 'Rectángulo' })
    .getAttribute('aria-pressed');
  const drawHint = await page.locator('[data-modeler-tools] .modeler-hint').innerText();
  check(
    '7a. herramienta Rectángulo activa con pista de dibujo',
    rectPressed === 'true' && drawHint.includes('Izquierdo: dibujar rectángulo'),
    drawHint.slice(0, 40),
  );

  const sceneBox = (
    await page.locator('[data-modeler-scene] canvas').boundingBox()
  ) ?? { x: 0, y: 0, width: 800, height: 600 };
  const dragStartX = sceneBox.x + sceneBox.width * 0.35;
  const dragStartY = sceneBox.y + sceneBox.height * 0.55;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 80, dragStartY + 40, { steps: 8 });
  await page.mouse.move(dragStartX + 240, dragStartY + 130, { steps: 12 });
  const liveCotas = (await page.locator('[data-modeler-draw-hint]').innerText()).trim();
  const cotasMatch = /^(\d+) × (\d+) mm$/.exec(liveCotas);
  check(
    '7b. cotas en vivo durante el arrastre (snap múltiplo de 100 mm)',
    cotasMatch !== null &&
      Number(cotasMatch[1]) > 0 &&
      Number(cotasMatch[2]) > 0 &&
      Number(cotasMatch[1]) % 100 === 0 &&
      Number(cotasMatch[2]) % 100 === 0,
    liveCotas,
  );
  await page.mouse.up();

  await page.waitForSelector('[data-modeler-pending]');
  const droppedWidth = Number(
    await page.locator('[data-modeler-field="pending-width"]').inputValue(),
  );
  check(
    '7c. al soltar nace el croquis pendiente con el ancho reflejado',
    droppedWidth > 0,
    `ancho=${droppedWidth}`,
  );

  await page.locator('[data-modeler-field="pending-width"]').fill('1200');
  await page.locator('[data-modeler-field="pending-depth"]').fill('600');
  await page.locator('[data-modeler-field="pending-height"]').fill('100');
  const pending = await page.evaluate(() => window.__modeler.getPending());
  const pendingUs = pending.sketch.pointsMm.map((point) => point[0]);
  const pendingVs = pending.sketch.pointsMm.map((point) => point[1]);
  const pendingWidth = Math.max(...pendingUs) - Math.min(...pendingUs);
  const pendingDepth = Math.max(...pendingVs) - Math.min(...pendingVs);
  check(
    '7d. cotas exactas aplicadas al croquis (1200×600 y altura100)',
    pendingWidth === 1200 && pendingDepth === 600 && pending.extrusionMm === 100,
    `${pendingWidth}×${pendingDepth}×${pending.extrusionMm}`,
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  const pendingAfterEscape = await page.locator('[data-modeler-pending]').count();
  check('7e. Escape cancela el croquis pendiente', pendingAfterEscape === 0);

  // Escape a MITAD del arrastre: la suelta no debe crear croquis.
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 150, dragStartY + 90, { steps: 8 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(150);
  const pendingAfterCancel = await page.locator('[data-modeler-pending]').count();
  check(
    '7f. Escape durante el arrastre cancela el gesto (suelta sin croquis)',
    pendingAfterCancel === 0,
  );

  // Nuevo dibujo con cotas exactas y extrusión real.
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 240, dragStartY + 130, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('[data-modeler-pending]');
  await page.locator('[data-modeler-field="pending-width"]').fill('1200');
  await page.locator('[data-modeler-field="pending-depth"]').fill('600');
  await page.locator('[data-modeler-field="pending-height"]').fill('100');
  await page.locator('[data-modeler-extrude]').click();

  await page.waitForSelector('[data-modeler-object="solid-1"]');
  // La generación es asíncrona (Worker bajo demanda): se espera
  // a que el estado pase a "ready" (timeout generoso por el
  // arranque WASM del primer dibujo).
  await page
    .waitForFunction(
      () => window.__modeler.getStates()['solid-1']?.status === 'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const states7g = await page.evaluate(() => window.__modeler.getStates());
  const engineAfterExtrude = await page.locator('[data-modeler-engine]').innerText();
  check(
    '7g. Extruir crea el sólido y la generación termina "Listo" con motor "listo"',
    states7g['solid-1']?.status === 'ready' && engineAfterExtrude.includes('listo'),
    `estado=${states7g['solid-1']?.status ?? 'ausente'}`,
  );
  await shootStable(page, '07-solido-extruido');

  // Selección por clic sobre el sólido (proyección determinista).
  await page.getByRole('button', { name: 'Seleccionar' }).click();
  const doc7h = await page.evaluate(() => window.__modeler.getDocument());
  const solid7h = doc7h.objects.find((object) => object.kind === 'solid');
  const points7h = solid7h.geometry.sketch.pointsMm;
  const center7h = {
    x:
      (Math.min(...points7h.map((point) => point[0])) +
        Math.max(...points7h.map((point) => point[0]))) /
      2,
    z:
      (Math.min(...points7h.map((point) => point[1])) +
        Math.max(...points7h.map((point) => point[1]))) /
      2,
    y: solid7h.geometry.extrusionMm / 2,
  };
  const screen7h = await page.evaluate(
    (point) => window.__modelerProject([point.x, point.y, point.z]),
    center7h,
  );
  await page.mouse.click(screen7h.x, screen7h.y);
  await page.waitForTimeout(200);
  const props7h = await page.locator('[data-modeler-props]').innerText();
  const selected7h = await page.evaluate(() => window.__modeler.getSelection());
  check(
    '7h. clic sobre el sólido lo selecciona (propiedades y lista)',
    props7h.includes('Sólido 1') && selected7h?.anchor === 'solid-1',
    `anchor=${selected7h?.anchor ?? 'null'}`,
  );

  // Edición de cotas del seleccionado: documento y lista reactivos.
  await page.locator('[data-modeler-field="selection-width"]').fill('900');
  await page.waitForTimeout(200);
  const doc7i = await page.evaluate(() => window.__modeler.getDocument());
  const solid7i = doc7i.objects.find((object) => object.kind === 'solid');
  const us7i = solid7i.geometry.sketch.pointsMm.map((point) => point[0]);
  const width7i = Math.max(...us7i) - Math.min(...us7i);
  const row7i = await page
    .locator('[data-modeler-object="solid-1"]')
    .innerText();
  check(
    '7i. editar el ancho del seleccionado actualiza documento y lista',
    width7i === 900 && row7i.includes('900 × 600 × 100 mm'),
    `ancho=${width7i}`,
  );

  // Clic en el vacío (cielo) → deselección (clickGuard incluido).
  await page.mouse.click(sceneBox.x + sceneBox.width * 0.5, sceneBox.y + 30);
  await page.waitForTimeout(200);
  const selected7j = await page.evaluate(() => window.__modeler.getSelection());
  const props7j = await page.locator('[data-modeler-props]').innerText();
  check(
    '7j. clic en el vacío deselecciona',
    selected7j === null && props7j.includes('Selecciona un sólido'),
    `anchor=${selected7j?.anchor ?? 'null'}`,
  );

  // Eliminación del sólido (selección vía lista).
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(200);
  const rows7k = await page.locator('[data-modeler-object]').count();
  const doc7k = await page.evaluate(() => window.__modeler.getDocument());
  check(
    '7k. Eliminar retira el sólido (lista y documento vacíos)',
    rows7k === 0 && doc7k.objects.length === 0,
    `filas=${rows7k} objetos=${doc7k.objects.length}`,
  );

  // 7l — Ciclo de vida de BufferGeometry (auditoría §2): tras editar
  // cotas (7i, la malla se sustituye) y eliminar (7k, desmontaje),
  // TODO lo adoptado debe estar dispuesto (cero fugas). Verifica en
  // navegador real la celosía React `useSolidGeometry`; la lógica
  // pura `retainSolidGeometry` cubre la unitaria.
  const geometryStats = await page.evaluate(() =>
    window.__modeler.getGeometryStats(),
  );
  check(
    '7l. geometrías liberadas tras editar y eliminar (cero fugas)',
    geometryStats.created >= 2 && geometryStats.disposed === geometryStats.created,
    `creadas=${geometryStats.created} liberadas=${geometryStats.disposed}`,
  );
  await shootStable(page, '08-tras-eliminar');

  // --- 5. Sin errores de consola/página --------------------
  check(
    '5a. sin errores de consola',
    consoleErrors.length === 0,
    consoleErrors[0] ?? '',
  );
  check('5b. sin excepciones de página', pageErrors.length === 0, pageErrors[0] ?? '');
  check('5c. sin respuestas 4xx/5xx', notFound.length === 0, notFound[0] ?? '');

  // --- 6. Resolución de escritorio -------------------------
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check('6a. sin desplazamiento horizontal (1440×900)', overflowX <= 0, `delta=${overflowX}`);
  // El canvas necesita un frame tras el remontaje del
  // modelador para re-encuadrarse: se espera a que crezca.
  await page
    .waitForFunction(
      () => {
        const canvas = document.querySelector('[data-modeler-scene] canvas');
        return (
          canvas instanceof HTMLCanvasElement &&
          canvas.getBoundingClientRect().width > 900 &&
          canvas.getBoundingClientRect().height > 500
        );
      },
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
  const finalBox = await page
    .locator('[data-modeler-scene] canvas')
    .boundingBox();
  check(
    '6b. lienzo dominante en escritorio',
    finalBox !== null && finalBox.width > 900 && finalBox.height > 500,
    finalBox ? `${Math.round(finalBox.width)}×${Math.round(finalBox.height)}` : 'sin canvas',
  );
  await shootStable(page, '06-escritorio-final');

  await browser.close();

  const failures = results.filter((entry) => !entry.ok);
  writeFileSync(
    join(outDir, 'informe.json'),
    JSON.stringify(
      {
        fase: '4C-A + 4C-B',
        fecha: new Date().toISOString(),
        viewport: '1440×900',
        total: results.length,
        aprobadas: results.length - failures.length,
        fallos: failures.length,
        results,
      },
      null,
      2,
    ),
  );
  console.log(
    `\n${results.length - failures.length}/${results.length} verificaciones OK · evidencia en ${outDir}`,
  );
  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  console.error('✗ error en la verificación visual del modelador:', error);
  exitCode = 1;
} finally {
  server.kill();
}

process.exit(exitCode);
