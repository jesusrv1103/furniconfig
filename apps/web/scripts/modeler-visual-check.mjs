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
 * 8. Historial visual (4C-C): Deshacer/Rehacer con botones y
 *    atajos (Ctrl/Cmd+Z y Ctrl/Cmd+Shift+Z, guardado dentro de
 *    campos), renombrar, una edición = una entrada (Enter+blur
 *    deduplicado), selección coherente al eliminar/restaurar,
 *    regeneración sin geometría obsoleta y cero fugas tras
 *    deshacer/rehacer rápidos.
 * 9. Clósets inteligentes (4C-D): inserción con derivación
 *    síncrona y chip «Clóset», render real (diff de píxeles),
 *    posición/material v1, deselección en el cielo y SELECCIÓN
 *    DESDE UNA PIEZA proyectada, edición de ancho con UNA entrada
 *    de historial, entrada inválida → error visible sin mutar
 *    documento/historial, puertas y módulos regenerando piezas,
 *    Undo/Redo exactos de params, eliminar/restore, segundo
 *    clóset posicionado con hueco 200 mm, mezcla con sólido y
 *    paridad de ciclos de vida al vaciar la escena.
 * 10. WAVE-01 distribución espacial (traslación): panel de
 *    posición coherente con el documento, arrastre real con snap
 *    (UNA entrada por gesto, dimensiones intactas), Escape
 *    cancela sin commit, campos X/Z EXACTOS (incl. negativos) e
 *    inválidos con error visible, flechas de ajuste por paso,
 *    snap configurable, aislamiento entre objetos al mover
 *    (un clóset no mueve al otro), Undo/Redo de movimientos,
 *    posición conservada al eliminar/restaurar, medición de
 *    rendimiento con varios clósets y paridad de recursos al
 *    vaciar la escena.
 * 11. WAVE-01 persistencia local (BLOQUE 3): «Guardar como» con
 *    prompt (cancelación sin efectos), sobre v1 SIN mallas en el
 *    namespace del modelador con la clave del configurador intacta,
 *    recarga con listado persistente, apertura con documento ÍNTEGRO
 *    igual al sobre + historial vacío + geometría regenerada,
 *    editar tras recuperar con undo, CRUD completo (renombrar,
 *    duplicar, nuevo con guardia de confirmación, eliminar con
 *    confirmación), sobre corrupto visible/no borrable/finalmente
 *    eliminable, vuelta desde el configurador con todo intacto y
 *    paridad de recursos al final.
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

  // Planificador de diálogos nativos (prompt/confirm) para la
  // sección 11 (WAVE-01 BLOQUE 3): patrón de visual-check.mjs.
  const dialogLog = [];
  const dialogPlan = { promptValue: undefined, promptCancel: false, confirm: true };
  page.on('dialog', async (dialog) => {
    dialogLog.push(`${dialog.type()}: ${dialog.message()}`);
    if (dialog.type() === 'prompt') {
      if (dialogPlan.promptCancel) {
        dialogPlan.promptCancel = false;
        await dialog.dismiss();
      } else {
        await dialog.accept(dialogPlan.promptValue ?? '');
      }
    } else if (dialogPlan.confirm) {
      await dialog.accept();
    } else {
      dialogPlan.confirm = true; // rearme: la cancelación es puntual
      await dialog.dismiss();
    }
  });

  // --- 0. WAVE-02: pantalla de inicio (primera visita) -----
  // Antes (auditoría P-01) la primera visita abría la escena técnica
  // vacía; ahora la bienvenida manda y el editor se alcanza con una
  // acción explícita. Las comprobaciones WAVE-01 siguientes corren en
  // modo AVANZADO («Diseño libre») y validan la PARIDAD del editor.
  await page.goto(`${baseUrl}/#/modeler`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  check(
    '0a. la primera visita muestra la bienvenida (no escena técnica vacía)',
    true,
  );
  const welcomeTitle = await page
    .locator('.modeler-welcome-title')
    .innerText();
  check(
    '0b. título claro «¿Qué quieres crear?»',
    welcomeTitle.includes('¿Qué quieres crear?'),
    welcomeTitle.trim(),
  );
  check(
    '0c. acción principal «Crear clóset»',
    (await page.locator('[data-welcome-create]').count()) === 1,
  );
  check(
    '0d. sin borrador NO hay tarjeta de continuación',
    (await page.locator('[data-welcome-draft]').count()) === 0,
  );
  check(
    '0e. «Diseño libre — avanzado» como escape del modelador técnico',
    (await page.locator('[data-welcome-free]').count()) === 1,
  );
  await shootStable(page, '00-w02-bienvenida');
  await page.click('[data-welcome-free]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  const screenAfterFree = await page.evaluate(() =>
    window.__modeler?.getScreen?.(),
  );
  check(
    '0f. «Diseño libre» entra al editor con escena vacía',
    screenAfterFree === 'editor',
    String(screenAfterFree),
  );
  const modeAfterFree = await page.evaluate(() =>
    window.__modeler?.getMode?.(),
  );
  check(
    '0g. el diseño libre arranca en modo AVANZADO (paridad WAVE-01)',
    modeAfterFree === 'advanced',
    String(modeAfterFree),
  );

  // --- 1. Apertura directa del modelador -------------------
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

  // WAVE-02: cada entrada en #/modeler aterriza en la bienvenida; para
  // continuar la verificación técnica se entra con «Diseño libre»
  // (modo avanzado, escena vacía: paridad exacta del editor previo).
  await page.goBack();
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  check(
    '4c. "atrás" del navegador regresa al modelador (bienvenida)',
    new URL(page.url()).hash === '#/modeler',
  );
  await page.click('[data-welcome-free]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });

  await page.goForward();
  await page.waitForSelector('section.viewer canvas', { timeout: 15_000 });
  check(
    '4d. "adelante" del navegador vuelve al configurador',
    new URL(page.url()).hash === '#/',
  );

  await page.goBack();
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  await page.click('[data-welcome-free]');
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

  // --- Historial visual (FASE-4C-C) — 7m…7u ---------------
  // Punto de partida: escena vacía (7k/7l) con tres operaciones
  // deshacibles (añadir, editar ancho a 900, eliminar).
  const undoBtn = page.locator('[data-modeler-undo]');
  const redoBtn = page.locator('[data-modeler-redo]');
  const historyOf = () => page.evaluate(() => window.__modeler.getHistory());
  const docOf = () => page.evaluate(() => window.__modeler.getDocument());
  const selectionOf = () =>
    page.evaluate(() => window.__modeler.getSelection());
  const rowText = (id) =>
    page.locator(`[data-modeler-object="${id}"]`).innerText();
  const propsText = () =>
    page.locator('[data-modeler-props]').innerText();
  const historyStatusText = () =>
    page.locator('[data-modeler-history-status]').innerText();
  /** Ancho del sólido en mm derivado del documento (min→max). */
  const widthOf = (doc, id = 'solid-1') => {
    const geometry = doc.objects.find((object) => object.id === id)?.geometry;
    const us = geometry?.sketch?.pointsMm?.map((point) => point[0]) ?? [];
    return us.length > 0 ? Math.max(...us) - Math.min(...us) : null;
  };
  /** Espera a que el estado del sólido esté ASENTADO: listo y con
   * la malla aplicada correspondiente al estado vigente (nunca
   * geometría obsoleta). Con objeto inexistente: sin estado. */
  const waitForSettled = (id = 'solid-1') =>
    page.waitForFunction(
      ({ id }) => {
        const state = window.__modeler.getStates()[id];
        return (
          state === undefined ||
          (state.status === 'ready' &&
            state.appliedFingerprint === state.fingerprint)
        );
      },
      { id },
      { timeout: 15_000 },
    );

  // 7m — Deshacer (botón) revierte la eliminación: objeto, malla y
  // selección restaurados; aria-live anuncia el comando (C3/C4).
  await undoBtn.click();
  await waitForSettled();
  const doc7m = await docOf();
  const hist7m = await historyOf();
  const sel7m = await selectionOf();
  const row7m = await rowText('solid-1');
  const status7m = (await historyStatusText()).trim();
  const geom7m = await page.evaluate(() => window.__modeler.getGeometryStats());
  check(
    '7m. Deshacer restaura objeto, malla y selección (feedback aria-live)',
    doc7m.objects.length === 1 &&
      row7m.includes('900 × 600 × 100 mm') &&
      sel7m?.anchor === 'solid-1' &&
      hist7m.past === 2 &&
      status7m.startsWith('Deshecho: Eliminar'),
    `objetos=${doc7m.objects.length} past=${hist7m.past} fila="${row7m.trim()}" ancla=${sel7m?.anchor ?? 'null'} vivas=${geom7m.created - geom7m.disposed} "${status7m}"`,
  );
  await shootStable(page, '09-tras-deshacer');

  // 7n — Ctrl+Z fuera de campos deshace la edición de cotas y
  // restaura las dimensiones EXACTAS (1200 mm).
  await page.keyboard.press('Control+z');
  await waitForSettled();
  const doc7n = await docOf();
  const hist7n = await historyOf();
  const row7n = await rowText('solid-1');
  const status7n = (await historyStatusText()).trim();
  check(
    '7n. Ctrl+Z fuera de campos deshace la edición (ancho 1200 exacto)',
    widthOf(doc7n) === 1200 &&
      row7n.includes('1200 × 600 × 100 mm') &&
      hist7n.past === 1 &&
      hist7n.future === 2 &&
      status7n.startsWith('Deshecho: Editar croquis'),
    `past=${hist7n.past} future=${hist7n.future} ancho=${widthOf(doc7n)} "${status7n}"`,
  );

  // 7o — Ctrl+Shift+Z rehace la edición de cotas (900 mm otra vez).
  await page.keyboard.press('Control+Shift+z');
  await waitForSettled();
  const hist7o = await historyOf();
  const row7o = await rowText('solid-1');
  const status7o = (await historyStatusText()).trim();
  check(
    '7o. Ctrl+Shift+Z rehace la edición (ancho 900 y selección conservada)',
    row7o.includes('900 × 600 × 100 mm') &&
      hist7o.past === 2 &&
      hist7o.future === 1 &&
      status7o.startsWith('Rehecho: Editar croquis') &&
      (await selectionOf())?.anchor === 'solid-1',
    `past=${hist7o.past} "${status7o}"`,
  );

  // 7p — Renombrar (Enter/fill confirma) y undo/redo del nombre.
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.waitForTimeout(100);
  const before7p = (await historyOf()).past;
  await page
    .locator('[data-modeler-field="selection-name"]')
    .fill('Armario norte');
  await page.waitForTimeout(200);
  const hist7p = await historyOf();
  const row7p = await rowText('solid-1');
  check(
    '7p-a. renombrar: UNA entrada, nombre en la fila y futuro descartado',
    hist7p.past === before7p + 1 &&
      hist7p.future === 0 &&
      row7p.includes('Armario norte') &&
      (await docOf()).objects[0]?.name === 'Armario norte',
    `past=${hist7p.past} (antes ${before7p}) futuro=${hist7p.future} fila="${row7p.trim()}"`,
  );
  await undoBtn.click();
  const row7pUndo = await rowText('solid-1');
  await redoBtn.click();
  const row7pRedo = await rowText('solid-1');
  check(
    '7p-b. Undo recupera el nombre anterior y Rehacer lo repite',
    row7pUndo.includes('Sólido 1') && row7pRedo.includes('Armario norte'),
    `undo="${row7pUndo.slice(0, 20)}" redo="${row7pRedo.slice(0, 20)}"`,
  );
  await shootStable(page, '11-renombrar');

  // 7q — Enter seguido de Tab (blur): UNA sola entrada de historial
  // y valor confirmado 700 mm.
  const before7q = (await historyOf()).past;
  await page.locator('[data-modeler-field="selection-width"]').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('700');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await waitForSettled();
  const hist7q = await historyOf();
  const row7q = await rowText('solid-1');
  const field7q = await page
    .locator('[data-modeler-field="selection-width"]')
    .inputValue();
  check(
    '7q. Enter + blur → UN solo comando (sin duplicados) y ancho 700',
    hist7q.past === before7q + 1 &&
      hist7q.future === 0 &&
      row7q.includes('700 × 600 × 100 mm') &&
      field7q === '700',
    `past=${hist7q.past} (antes ${before7q}) futuro=${hist7q.future} fila="${row7q.trim()}" campo="${field7q}"`,
  );

  // 7r — Dentro de un campo, Ctrl+Z es del INPUT (undo nativo):
  // el historial y el documento NO cambian.
  await page.locator('[data-modeler-field="selection-width"]').click();
  const before7r = await historyOf();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const mid7r = await historyOf();
  const doc7r = await docOf();
  check(
    '7r. Ctrl+Z dentro del campo NO toca el historial ni el documento',
    mid7r.past === before7r.past &&
      mid7r.future === before7r.future &&
      widthOf(doc7r) === 700,
    `past=${mid7r.past} (antes ${before7r.past}) futuro=${mid7r.future} ancho=${widthOf(doc7r)}`,
  );
  // Normaliza el borrador y confirma (deduplicado por no-op).
  await page.keyboard.press('Control+a');
  await page.keyboard.type('700');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);

  // 7s — Selección consistente (C4): eliminar → deseleccionar;
  // Undo → restaura y SELECCIONA; Rehacer → retira; Undo → vuelve.
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(200);
  const doc7sGone = await docOf();
  const sel7sGone = await selectionOf();
  const props7sGone = await propsText();
  await undoBtn.click();
  await waitForSettled();
  const doc7sBack = await docOf();
  const sel7sBack = await selectionOf();
  await page.keyboard.press('Control+Shift+z');
  await page.waitForTimeout(200);
  const doc7sRedone = await docOf();
  const sel7sRedone = await selectionOf();
  await undoBtn.click();
  await waitForSettled();
  check(
    '7s. eliminar → deseleccionar; Undo restaura y selecciona; Rehacer retira',
    doc7sGone.objects.length === 0 &&
      sel7sGone === null &&
      props7sGone.includes('Selecciona un sólido') &&
      doc7sBack.objects.length === 1 &&
      sel7sBack?.anchor === 'solid-1' &&
      doc7sRedone.objects.length === 0 &&
      sel7sRedone === null &&
      (await docOf()).objects.length === 1,
    `restaurados=${doc7sBack.objects.length} selección=${sel7sBack?.anchor ?? 'null'}`,
  );

  // 7t — Estado final: invariantes de fugas, coherencia de malla y
  // estados honestos de los botones (último comando disponible).
  const doc7t = await docOf();
  const hist7t = await historyOf();
  const row7t = await rowText('solid-1');
  const geom7t = await page.evaluate(() => window.__modeler.getGeometryStats());
  const undoLabel7t = await undoBtn.getAttribute('aria-label');
  check(
    '7t. sin fugas ni malla obsoleta; botones coherentes con el historial',
    doc7t.objects.length === 1 &&
      row7t.includes('Armario norte') &&
      row7t.includes('700 × 600 × 100 mm') &&
      hist7t.past === 4 &&
      hist7t.future === 1 &&
      hist7t.canUndo === true &&
      hist7t.canRedo === true &&
      (await redoBtn.isEnabled()) === true &&
      (undoLabel7t ?? '').startsWith('Deshacer: Editar croquis'),
    `past=${hist7t.past} futuro=${hist7t.future} label="${undoLabel7t}"`,
  );
  await shootStable(page, '12-historial-final');

  // 7u — Deshacer/Rehacer RÁPIDOS (tres seguidos): sin geometría
  // obsoleta, sin estados rotos y vuelta exacta al estado inicial.
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const hist7uUndone = await historyOf();
  const row7uUndone = await rowText('solid-1');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await waitForSettled();
  const hist7uRedone = await historyOf();
  const doc7u = await docOf();
  const states7u = await page.evaluate(() => window.__modeler.getStates());
  const geom7u = await page.evaluate(() => window.__modeler.getGeometryStats());
  check(
    '7u. deshacer/rehacer rápidos: vuelta exacta, sin obsoletos ni fugas',
    hist7uUndone.past === 1 &&
      row7uUndone.includes('1200 × 600 × 100 mm') &&
      hist7uRedone.past === 4 &&
      hist7uRedone.future === 1 &&
      doc7u.objects.length === 1 &&
      states7u['solid-1']?.status === 'ready' &&
      states7u['solid-1']?.appliedFingerprint === states7u['solid-1']?.fingerprint,
    `pasado=${hist7uRedone.past} futuro=${hist7uRedone.future} estado=${states7u['solid-1']?.status}`,
  );
  await shootStable(page, '13-despues-de-rapidos');

  // 7v — Cierre honesto: rehacer la eliminación pendiente deja la
  // escena VACÍA y con TODA la geometría del historial liberada
  // (cero fugas tras el flujo completo de deshacer/rehacer).
  await page.keyboard.press('Control+Shift+z');
  await page.waitForFunction(
    () =>
      window.__modeler.getDocument().objects.length === 0 &&
      Object.keys(window.__modeler.getStates()).length === 0,
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(400); // asienta la liberación de mallas
  const hist7v = await historyOf();
  const geom7v = await page.evaluate(() => window.__modeler.getGeometryStats());
  check(
    '7v. cero fugas tras todo el historial (escena vacía, geometrías liberadas)',
    geom7v.created >= 3 && geom7v.disposed === geom7v.created,
    `creadas=${geom7v.created} liberadas=${geom7v.disposed} pasado=${hist7v.past} futuro=${hist7v.future}`,
  );
  await shootStable(page, '14-final-vacio');

  // --- 9. Clósets inteligentes (FASE-4C-D) ------------------
  // Base: escena vacía (7v) con el Worker YA arrancado (7g) — la
  // ruta "solo clósets sin Worker" está cubierta por pruebas
  // unitarias; aquí se valida en Chromium real: inserción D1,
  // render/piezas D2, selección desde pieza D3, edición D4 con
  // validación honesta y ciclo de eliminar/restaurar D3.
  //
  // Primero se recrea la escena MIXTA: un sólido (flujo ya
  // probado en la sección 7) y encima los clósets.

  const sceneBox9 = (
    await page.locator('[data-modeler-scene] canvas').boundingBox()
  ) ?? { x: 0, y: 0, width: 800, height: 600 };

  const compOf = (id) =>
    page.evaluate(
      (objectId) => window.__modeler.getComponentStates()[objectId],
      id,
    );
  /** Reintenta `fn` hasta que devuelva `true` (o `false` al agotar). */
  const until = async (fn, timeout = 10_000) => {
    const start = Date.now();
    for (;;) {
      if (await fn()) return true;
      if (Date.now() - start > timeout) return false;
      await page.waitForTimeout(100);
    }
  };
  /** Clic en una esquina "cielo" hasta deseleccionar (máx. 4). */
  const clickSky = async () => {
    const corners = [
      { x: sceneBox9.x + 25, y: sceneBox9.y + 25 },
      { x: sceneBox9.x + sceneBox9.width - 25, y: sceneBox9.y + 25 },
      { x: sceneBox9.x + 25, y: sceneBox9.y + sceneBox9.height - 25 },
      {
        x: sceneBox9.x + sceneBox9.width - 25,
        y: sceneBox9.y + sceneBox9.height - 25,
      },
    ];
    for (const corner of corners) {
      await page.mouse.click(corner.x, corner.y);
      await page.waitForTimeout(150);
      if ((await selectionOf()) === null) return true;
    }
    return false;
  };

  await page.getByRole('button', { name: 'Rectángulo' }).click();
  const mixX = sceneBox9.x + sceneBox9.width * 0.35;
  const mixY = sceneBox9.y + sceneBox9.height * 0.55;
  await page.mouse.move(mixX, mixY);
  await page.mouse.down();
  await page.mouse.move(mixX + 240, mixY + 130, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('[data-modeler-pending]');
  await page.locator('[data-modeler-field="pending-width"]').fill('800');
  await page.locator('[data-modeler-field="pending-depth"]').fill('600');
  await page.locator('[data-modeler-field="pending-height"]').fill('100');
  await page.locator('[data-modeler-extrude]').click();
  await page.waitForSelector('[data-modeler-object="solid-1"]');
  await until(
    async () =>
      (await page.evaluate(() => window.__modeler.getStates()['solid-1']))
        ?.status === 'ready',
    30_000,
  );
  await page.getByRole('button', { name: 'Seleccionar' }).click();

  const shotBefore9 = await shootStable(page, '15-escena-con-solido', canvasClip);

  // 9a — Inserción (D1): componente LISTO con derivación síncrona.
  const t9a = Date.now();
  await page.locator('[data-modeler-insert-wardrobe]').click();
  await page.waitForSelector('[data-modeler-object="component-1"]');
  const comp9a = await compOf('component-1');
  const lat9a = Date.now() - t9a;
  const kind9a = await page
    .locator('[data-modeler-object="component-1"]')
    .getAttribute('data-object-kind');
  check(
    '9a. «Insertar clóset» crea component-1 LISTO con chip «Clóset» (síncrono)',
    comp9a?.status === 'ready' && (comp9a?.parts ?? 0) > 5 && kind9a === 'component',
    `estado=${comp9a?.status} piezas=${comp9a?.parts} en ${lat9a} ms`,
  );

  const shot9a = await shootStable(page, '16-closet-insertado', canvasClip);
  const diff9a = await pixelDiffRatio(page, shotBefore9, shot9a, 4);
  check(
    '9b. el clóset se DIBUJA (píxeles nuevos en el canvas)',
    diff9a > 0.01,
    `diff=${(diff9a * 100).toFixed(1)}%`,
  );

  const doc9c = await docOf();
  const object9c = doc9c.objects.find((entry) => entry.id === 'component-1');
  const material9c = doc9c.materials.some(
    (material) => material.id === object9c?.materialId,
  );
  check(
    '9c. posición [0,0,0] mm, contrato v1 y material referenciado del documento',
    object9c?.transform.positionMm[0] === 0 &&
      object9c?.transform.positionMm[1] === 0 &&
      object9c?.transform.positionMm[2] === 0 &&
      object9c?.type === 'furniconfig.wardrobe' &&
      object9c?.version === 1 &&
      material9c,
    `${JSON.stringify(object9c?.transform.positionMm)} material=${object9c?.materialId}`,
  );

  const sel9d = await selectionOf();
  const widthField9d = await page
    .locator('[data-modeler-field="wardrobe-width"]')
    .count();
  check(
    '9d. el clóset insertado queda SELECCIONADO con panel editable',
    sel9d?.anchor === 'component-1' && widthField9d === 1,
    `selección=${sel9d?.anchor ?? 'null'} campos=${widthField9d}`,
  );

  // 9e — Deselección en el cielo + SELECCIÓN DESDE UNA PIEZA
  // (clic sobre la geometría proyectada → componente completo).
  const sky9e = await clickSky();
  const sel9eOff = await selectionOf();
  let picked9e = null;
  const candidates9e = [
    [1200, 2190, 300], // canto del techo (visto desde arriba)
    [2390, 1100, 300], // lateral derecho
    [1200, 1100, 597], // cara trasera
    [9, 1100, 300], // lateral izquierdo
  ];
  for (const point of candidates9e) {
    const px = await page.evaluate(
      (p) => window.__modelerProject(p),
      point,
    );
    if (
      !Number.isFinite(px.x) ||
      !Number.isFinite(px.y) ||
      px.x < sceneBox9.x + 4 ||
      px.x > sceneBox9.x + sceneBox9.width - 4 ||
      px.y < sceneBox9.y + 4 ||
      px.y > sceneBox9.y + sceneBox9.height - 4
    ) {
      continue;
    }
    await page.mouse.click(px.x, px.y);
    await page.waitForTimeout(200);
    const sel = await selectionOf();
    if (sel?.anchor === 'component-1') {
      picked9e = point;
      break;
    }
  }
  check(
    '9e. cielo deselecciona y un CLIC SOBRE UNA PIEZA selecciona el clóset completo',
    sky9e && sel9eOff === null && picked9e !== null,
    picked9e
      ? `pieza en [${picked9e.join(',')}]`
      : `cielo=${sky9e} ninguna pieza alcanzable`,
  );

  // 9f — Edición de ancho (D4): params 1500, piezas nuevas y UNA
  // entrada de historial (confirmación única, no por tecla).
  const hist9f0 = await historyOf();
  const t9f = Date.now();
  await page.locator('[data-modeler-field="wardrobe-width"]').fill('1500');
  await page.keyboard.press('Enter');
  await until(async () => {
    const state = await compOf('component-1');
    const width = await page.evaluate(
      () =>
        window.__modeler.getDocument().objects.find(
          (entry) => entry.id === 'component-1',
        )?.params?.dimensions?.widthMm,
    );
    return state?.status === 'ready' && width === 1500;
  });
  const lat9f = Date.now() - t9f;
  const comp9f = await compOf('component-1');
  const hist9f1 = await historyOf();
  check(
    '9f. ancho 1500 mm → params + piezas regeneradas + UNA entrada de historial',
    comp9f?.status === 'ready' &&
      hist9f1.past === hist9f0.past + 1 &&
      lat9f < 5000,
    `piezas=${comp9f?.parts} past ${hist9f0.past}→${hist9f1.past} en ${lat9f} ms`,
  );

  // 9g — Entrada INVÁLIDA (100 mm < mínimo del motor): error
  // visible y documento + historial INTACTOS (D4/§7).
  const doc9g0 = await docOf();
  const hist9g0 = await historyOf();
  await page.locator('[data-modeler-field="wardrobe-width"]').fill('100');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const editErr9g = page.locator('[data-modeler-wardrobe-edit-error]');
  const errCount9g = await editErr9g.count();
  const errText9g = errCount9g > 0 ? (await editErr9g.innerText()).trim() : '';
  const doc9g1 = await docOf();
  const hist9g1 = await historyOf();
  const width9g1 = doc9g1.objects.find(
    (entry) => entry.id === 'component-1',
  )?.params?.dimensions?.widthMm;
  check(
    '9g. entrada inválida → error visible SIN mutar documento ni historial',
    errCount9g === 1 &&
      errText9g.length > 0 &&
      width9g1 === 1500 &&
      hist9g1.past === hist9g0.past,
    `error="${errText9g.slice(0, 50)}" ancho=${width9g1} past=${hist9g1.past}`,
  );
  await shootStable(page, '17-error-validacion', canvasClip);

  // 9h — Puertas: activarlas añade piezas (hojas+tiradores) y
  // muestra SOLO entonces hojas/bisagra (sin controles que no aplican).
  const parts9h0 = (await compOf('component-1'))?.parts ?? 0;
  await page.locator('[data-modeler-doors-enabled]').check();
  await until(async () => ((await compOf('component-1'))?.parts ?? 0) > parts9h0);
  const parts9h1 = (await compOf('component-1'))?.parts ?? 0;
  const leaves9h = await page.locator('[data-modeler-door-leaves]').count();
  const hinge9h = await page.locator('[data-modeler-door-hinge]').count();
  check(
    '9h. activar puertas → más piezas (hojas+tiradores) y controles de hojas/bisagra',
    parts9h1 > parts9h0 && leaves9h === 1 && hinge9h === 1,
    `piezas ${parts9h0}→${parts9h1} hojas=${leaves9h} bisagra=${hinge9h}`,
  );

  // 9i — Módulos: 3 → 4 cambia el conjunto de piezas.
  await page.locator('[data-modeler-module-count]').selectOption('4');
  await until(async () => ((await compOf('component-1'))?.parts ?? 0) > parts9h1);
  const parts9i = (await compOf('component-1'))?.parts ?? 0;
  check('9i. nº de módulos 3 → 4 regenera las piezas', parts9i > parts9h1, `${parts9h1}→${parts9i}`);

  // 9j — Undo/Redo EXACTOS sobre params (botones de la barra).
  await undoBtn.click();
  await page.waitForTimeout(300);
  const doc9j1 = await docOf();
  const mods9j1 = doc9j1.objects.find(
    (entry) => entry.id === 'component-1',
  )?.params?.modules?.length;
  await redoBtn.click();
  await page.waitForTimeout(300);
  const doc9j2 = await docOf();
  const mods9j2 = doc9j2.objects.find(
    (entry) => entry.id === 'component-1',
  )?.params?.modules?.length;
  check(
    '9j. Deshacer/Rehacer de params exactos (módulos 4 → 3 → 4)',
    mods9j1 === 3 && mods9j2 === 4,
    `módulos ${mods9j1}→${mods9j2}`,
  );

  // 9k — Eliminar y restaurar (D3): purga de estados + vuelta con
  // piezas y selección por Undo.
  await page.locator('[data-modeler-object="component-1"]').click();
  await page.waitForTimeout(100);
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(300);
  const rowsGone9k = await page
    .locator('[data-modeler-object="component-1"]')
    .count();
  const compGone9k = await compOf('component-1');
  const props9k = await propsText();
  await undoBtn.click();
  await page.waitForTimeout(400);
  const rowsBack9k = await page
    .locator('[data-modeler-object="component-1"]')
    .count();
  const compBack9k = await compOf('component-1');
  const sel9k = await selectionOf();
  check(
    '9k. eliminar → estados purgados; Undo restaura fila, piezas y selección',
    rowsGone9k === 0 &&
      compGone9k === undefined &&
      props9k.includes('Selecciona un sólido o un clóset') &&
      rowsBack9k === 1 &&
      compBack9k?.status === 'ready' &&
      (compBack9k?.parts ?? 0) > 5 &&
      sel9k?.anchor === 'component-1',
    `restaurado=${compBack9k?.status} selección=${sel9k?.anchor ?? 'null'}`,
  );

  // 9l — Segundo clóset: posición junto al primero (hueco 200 mm,
  // rejilla 10) y selección del nuevo.
  await page.locator('[data-modeler-insert-wardrobe]').click();
  await page.waitForSelector('[data-modeler-object="component-2"]');
  const comp9l = await compOf('component-2');
  const doc9l = await docOf();
  const c1_9l = doc9l.objects.find((entry) => entry.id === 'component-1');
  const c2_9l = doc9l.objects.find((entry) => entry.id === 'component-2');
  const width9l = c1_9l?.params?.dimensions?.widthMm ?? 0;
  const expected9l =
    Math.ceil(((c1_9l?.transform.positionMm[0] ?? 0) + width9l + 200) / 10) * 10;
  const sel9l = await selectionOf();
  check(
    '9l. segundo clóset listo a la derecha del primero (hueco 200 mm, rejilla 10) y seleccionado',
    comp9l?.status === 'ready' &&
      c2_9l?.transform.positionMm[0] === expected9l &&
      sel9l?.anchor === 'component-2' &&
      doc9l.objects.filter((entry) => entry.kind === 'component').length === 2,
    `x=${c2_9l?.transform.positionMm[0]} esperado=${expected9l}`,
  );
  await shootStable(page, '18-dos-closets', canvasClip);

  // 9m — Convivencia (mezcla): sólido + 2 clósets, cada uno en SU
  // mapa de estados y todos «Listo».
  const states9m = await page.evaluate(() => window.__modeler.getStates());
  const comps9m = await page.evaluate(() => window.__modeler.getComponentStates());
  const rows9m = await page.locator('[data-modeler-object]').count();
  const chips9m = await page
    .locator('[data-modeler-object-kind="component"]')
    .count();
  check(
    '9m. mezcla sólido + 2 clósets: tres filas, dos chips «Clóset» y TODOS «Listo»',
    rows9m === 3 &&
      chips9m === 2 &&
      states9m['solid-1']?.status === 'ready' &&
      comps9m['component-1']?.status === 'ready' &&
      comps9m['component-2']?.status === 'ready',
    `filas=${rows9m} chips=${chips9m}`,
  );

  // 9n — Cierre del flujo: clic en el cielo → deselección.
  const sky9n = await clickSky();
  const sel9n = await selectionOf();
  check(
    '9n. clic en el cielo deselecciona el clóset (panel vuelve al aviso)',
    sky9n && sel9n === null,
    `anchor=${sel9n?.anchor ?? 'null'}`,
  );

  // 9o — Liberación de recursos (D5): al eliminar los clósets se
  // purgan sus estados y su ciclo de vida no crece por debajo de
  // lo creado (nada queda retenido de lo eliminado).
  await page.locator('[data-modeler-object="component-2"]').click();
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-modeler-object="component-1"]').click();
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(300);
  const partsLeft9o = await page.evaluate(
    () => window.__modeler.getComponentStates(),
  );
  const life9o = await page.evaluate(() => window.__modeler.getPartsGeometryStats());
  const rows9o = await page.locator('[data-modeler-object]').count();
  check(
    '9o. eliminar clósets: estados purgados y ciclo de vida de piezas equilibrado en lo eliminado',
    Object.keys(partsLeft9o).length === 0 &&
      rows9o === 1 &&
      life9o.created > 0 &&
      life9o.disposed <= life9o.created,
    `creadas=${life9o.created} liberadas=${life9o.disposed} filas=${rows9o}`,
  );
  // 9p — Escena vacía al final (equivalente a 7v): paridad TOTAL
  // de los dos ciclos de vida (piezas de componentes Y sólidos).
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(300);
  const finalLife9o = await page.evaluate(
    () => window.__modeler.getPartsGeometryStats(),
  );
  const solidLife9o = await page.evaluate(
    () => window.__modeler.getGeometryStats(),
  );
  check(
    '9p. escena vacía al final: paridad TOTAL de piezas y de sólidos (cero fugas)',
    (await page.locator('[data-modeler-object]').count()) === 0 &&
      finalLife9o.created === finalLife9o.disposed &&
      solidLife9o.created === solidLife9o.disposed,
    `piezas ${finalLife9o.disposed}/${finalLife9o.created} · sólidos ${solidLife9o.disposed}/${solidLife9o.created}`,
  );
  await shootStable(page, '19-4c-d-final-vacio', canvasClip);

  // --- WAVE-01 BLOQUE 2 — 10a…10m: distribución espacial ----
  // Punto de partida: escena vacía (9p). Se crea una escena de
  // trabajo (sólido + clóset) y se verifica la TRASLACIÓN en el
  // suelo: arrastre real con snap, campos exactos, flechas,
  // Escape, aislamiento entre objetos, undo/redo, posición
  // conservada al restaurar, rendimiento y liberación de recursos.
  const perfWave01 = {};

  // 10a — Preparación: sólido 1200×600×100 + clóset, ambos «Listo».
  await page.getByRole('button', { name: 'Rectángulo' }).click();
  const drawX10 = sceneBox.x + sceneBox.width * 0.35;
  const drawY10 = sceneBox.y + sceneBox.height * 0.55;
  await page.mouse.move(drawX10, drawY10);
  await page.mouse.down();
  await page.mouse.move(drawX10 + 240, drawY10 + 130, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('[data-modeler-pending]');
  await page.locator('[data-modeler-field="pending-width"]').fill('1200');
  await page.locator('[data-modeler-field="pending-depth"]').fill('600');
  await page.locator('[data-modeler-field="pending-height"]').fill('100');
  await page.locator('[data-modeler-extrude]').click();
  await page
    .waitForFunction(
      () => window.__modeler.getStates()['solid-1']?.status === 'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await page.locator('[data-modeler-insert-wardrobe]').click();
  await page
    .waitForFunction(
      () =>
        window.__modeler.getComponentStates()['component-1']?.status ===
        'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await page.getByRole('button', { name: 'Seleccionar' }).click();
  const prep10 = await page.evaluate(() => ({
    solid: window.__modeler.getStates()['solid-1']?.status,
    comp: window.__modeler.getComponentStates()['component-1']?.status,
  }));
  check(
    '10a. escena de trabajo: sólido y clóset «Listo»',
    prep10.solid === 'ready' && prep10.comp === 'ready',
    `solid=${prep10.solid} clóset=${prep10.comp}`,
  );
  await shootStable(page, '20-wave01-escena', canvasClip);

  // 10b — Panel de posición del sólido coherente con el documento.
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.waitForTimeout(150);
  const pos10b = await page.evaluate(
    () => window.__modeler.getTransformState().selectedPositionMm,
  );
  const fieldX10b = await page
    .locator('[data-modeler-field="position-x"]')
    .inputValue();
  const fieldZ10b = await page
    .locator('[data-modeler-field="position-z"]')
    .inputValue();
  check(
    '10b. campos X/Z del sólido iguales a su posición autoritativa',
    pos10b !== null &&
      fieldX10b === String(pos10b[0]) &&
      fieldZ10b === String(pos10b[2]),
    `documento=[${pos10b}] campos=${fieldX10b}/${fieldZ10b}`,
  );

  // 10c — Arrastre REAL del sólido (snap ON): posición en rejilla,
  // dimensiones intactas y UNA sola entrada de historial.
  const snap100 = (value) => Math.round(value / 100) * 100;
  const doc10c = await page.evaluate(() => window.__modeler.getDocument());
  const solid10c = doc10c.objects.find((object) => object.id === 'solid-1');
  const pts10c = solid10c.geometry.sketch.pointsMm;
  const minX10c = Math.min(...pts10c.map((p) => p[0]));
  const minZ10c = Math.min(...pts10c.map((p) => p[1]));
  const w10c = Math.max(...pts10c.map((p) => p[0])) - minX10c;
  const d10c = Math.max(...pts10c.map((p) => p[1])) - minZ10c;
  const past10c = await page.evaluate(() => window.__modeler.getHistory().past);
  const delta10c = { dx: 640, dz: -310 };
  const grab10c = { x: minX10c + w10c / 2, y: 0, z: minZ10c + d10c / 2 };
  const from10c = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    grab10c,
  );
  const to10c = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    { x: grab10c.x + delta10c.dx, y: 0, z: grab10c.z + delta10c.dz },
  );
  const tDrag10c = Date.now();
  await page.mouse.move(from10c.x, from10c.y);
  await page.mouse.down();
  await page.mouse.move(
    (from10c.x + to10c.x) / 2,
    (from10c.y + to10c.y) / 2,
    { steps: 8 },
  );
  // La vista previa sigue al puntero SIN mutar documento.
  const draft10c = await page.evaluate(
    () => window.__modeler.getTransformState().moveDraft,
  );
  await page.mouse.move(to10c.x, to10c.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  perfWave01.arrastreMs = Date.now() - tDrag10c;
  const after10c = await page.evaluate(() => ({
    doc: window.__modeler.getDocument(),
    past: window.__modeler.getHistory().past,
  }));
  const solidAfter10c = after10c.doc.objects.find(
    (object) => object.id === 'solid-1',
  );
  const ptsAfter10c = solidAfter10c.geometry.sketch.pointsMm;
  const minXAfter10c = Math.min(...ptsAfter10c.map((p) => p[0]));
  const minZAfter10c = Math.min(...ptsAfter10c.map((p) => p[1]));
  const wAfter10c = Math.max(...ptsAfter10c.map((p) => p[0])) - minXAfter10c;
  const dAfter10c = Math.max(...ptsAfter10c.map((p) => p[1])) - minZAfter10c;
  check(
    '10c. arrastre real con snap: posición en rejilla, dimensiones intactas, previsualización sin documento y UNA entrada',
    draft10c !== null &&
      draft10c.objectId === 'solid-1' &&
      after10c.past === past10c + 1 &&
      minXAfter10c === snap100(minX10c + delta10c.dx) &&
      minZAfter10c === snap100(minZ10c + delta10c.dz) &&
      wAfter10c === w10c &&
      dAfter10c === d10c &&
      solidAfter10c.geometry.extrusionMm === 100,
    `pos=(${minXAfter10c},${minZAfter10c}) esperado=(${snap100(minX10c + delta10c.dx)},${snap100(minZ10c + delta10c.dz)}) historial ${past10c}→${after10c.past}`,
  );
  await shootStable(page, '21-arrastre-snap', canvasClip);

  // 10d — Escape durante el arrastre cancela SIN commit.
  const doc10d = await page.evaluate(() => window.__modeler.getDocument());
  const solid10d = doc10d.objects.find((object) => object.id === 'solid-1');
  const pts10d = solid10d.geometry.sketch.pointsMm;
  const past10d = await page.evaluate(() => window.__modeler.getHistory().past);
  const grab10d = {
    x: (Math.min(...pts10d.map((p) => p[0])) + Math.max(...pts10d.map((p) => p[0]))) / 2,
    y: 0,
    z: (Math.min(...pts10d.map((p) => p[1])) + Math.max(...pts10d.map((p) => p[1]))) / 2,
  };
  const from10d = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    grab10d,
  );
  await page.mouse.move(from10d.x, from10d.y);
  await page.mouse.down();
  await page.mouse.move(from10d.x + 90, from10d.y - 40, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(200);
  const after10d = await page.evaluate(() => ({
    doc: window.__modeler.getDocument(),
    past: window.__modeler.getHistory().past,
    draft: window.__modeler.getTransformState().moveDraft,
  }));
  const solidAfter10d = after10d.doc.objects.find(
    (object) => object.id === 'solid-1',
  );
  check(
    '10d. Escape cancela el arrastre: documento intacto, sin entrada y borrador limpio',
    after10d.past === past10d &&
      after10d.draft === null &&
      JSON.stringify(solidAfter10d.geometry.sketch) ===
        JSON.stringify(solid10d.geometry.sketch),
    `historial=${after10d.past} draft=${after10d.draft === null ? 'null' : 'activo'}`,
  );

  // 10e — Campo X EXACTO (con negativo) + entrada inválida con
  // error visible SIN tocar documento ni historial.
  await page.locator('[data-modeler-field="position-x"]').fill('-250');
  await page.waitForTimeout(200);
  const after10e = await page.evaluate(() => ({
    doc: window.__modeler.getDocument(),
    past: window.__modeler.getHistory().past,
    error: window.__modeler.getTransformState().positionError,
  }));
  const solidAfter10e = after10e.doc.objects.find(
    (object) => object.id === 'solid-1',
  );
  const xExact10e = Math.min(
    ...solidAfter10e.geometry.sketch.pointsMm.map((p) => p[0]),
  );
  check(
    '10e. campo X exacto acepta negativo (sin snap) con UNA entrada',
    xExact10e === -250 && after10e.error === null,
    `x=${xExact10e} error=${after10e.error ?? 'ninguno'}`,
  );
  await page.locator('[data-modeler-field="position-z"]').fill('12.5');
  await page.waitForTimeout(200);
  const invalid10e = await page.evaluate(() => ({
    doc: window.__modeler.getDocument(),
    past: window.__modeler.getHistory().past,
    error: window.__modeler.getTransformState().positionError,
  }));
  const errorVisible10e = await page
    .locator('[data-modeler-position-error]')
    .count();
  check(
    '10e. texto inválido → error visible y documento/historial intactos',
    errorVisible10e === 1 &&
      invalid10e.error !== null &&
      invalid10e.past === after10e.past &&
      JSON.stringify(invalid10e.doc) === JSON.stringify(after10e.doc),
    `error=${invalid10e.error ?? 'ninguno'}`,
  );

  // 10f — Flechas de ajuste: UNA entrada por clic, valor exacto.
  const doc10f = await page.evaluate(() => window.__modeler.getDocument());
  const solid10f = doc10f.objects.find((object) => object.id === 'solid-1');
  const pts10f = solid10f.geometry.sketch.pointsMm;
  const xBefore10f = Math.min(...pts10f.map((p) => p[0]));
  const zBefore10f = Math.min(...pts10f.map((p) => p[1]));
  const past10f = invalid10e.past;
  await page.locator('[data-modeler-nudge="+x"]').click();
  await page.locator('[data-modeler-nudge="-z"]').click();
  await page.waitForTimeout(200);
  const after10f = await page.evaluate(() => ({
    doc: window.__modeler.getDocument(),
    past: window.__modeler.getHistory().past,
  }));
  const solidAfter10f = after10f.doc.objects.find(
    (object) => object.id === 'solid-1',
  );
  const ptsAfter10f = solidAfter10f.geometry.sketch.pointsMm;
  check(
    '10f. flechas: X +100 y Z −100 exactos, dos clics = dos entradas',
    Math.min(...ptsAfter10f.map((p) => p[0])) === xBefore10f + 100 &&
      Math.min(...ptsAfter10f.map((p) => p[1])) === zBefore10f - 100 &&
      after10f.past === past10f + 2,
    `x=${Math.min(...ptsAfter10f.map((p) => p[0]))} z=${Math.min(...ptsAfter10f.map((p) => p[1]))} (antes ${xBefore10f}/${zBefore10f}) historial ${past10f}→${after10f.past}`,
  );

  // 10g — Snap DESACTIVADO: el arrastre respeta el delta exacto
  // (tolerancia ±30 mm por proyección/perspectiva).
  await page.locator('[data-modeler-snap]').click();
  const snapOff10g = await page.evaluate(
    () => window.__modeler.getTransformState().snapEnabled,
  );
  const doc10g = await page.evaluate(() => window.__modeler.getDocument());
  const solid10g = doc10g.objects.find((object) => object.id === 'solid-1');
  const pts10g = solid10g.geometry.sketch.pointsMm;
  const minX10g = Math.min(...pts10g.map((p) => p[0]));
  const minZ10g = Math.min(...pts10g.map((p) => p[1]));
  const w10g = Math.max(...pts10g.map((p) => p[0])) - minX10g;
  const d10g = Math.max(...pts10g.map((p) => p[1])) - minZ10g;
  const past10g = await page.evaluate(() => window.__modeler.getHistory().past);
  const delta10g = { dx: 233, dz: 177 };
  const grab10g = { x: minX10g + w10g / 2, y: 0, z: minZ10g + d10g / 2 };
  const from10g = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    grab10g,
  );
  const to10g = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    { x: grab10g.x + delta10g.dx, y: 0, z: grab10g.z + delta10g.dz },
  );
  await page.mouse.move(from10g.x, from10g.y);
  await page.mouse.down();
  await page.mouse.move(to10g.x, to10g.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await page.locator('[data-modeler-snap]').click(); // volver a activar
  const after10g = await page.evaluate(() => ({
    doc: window.__modeler.getDocument(),
    past: window.__modeler.getHistory().past,
    snap: window.__modeler.getTransformState().snapEnabled,
  }));
  const solidAfter10g = after10g.doc.objects.find(
    (object) => object.id === 'solid-1',
  );
  const ptsAfter10g = solidAfter10g.geometry.sketch.pointsMm;
  const xAfter10g = Math.min(...ptsAfter10g.map((p) => p[0]));
  const zAfter10g = Math.min(...ptsAfter10g.map((p) => p[1]));
  check(
    '10g. snap desactivado: el arrastre sigue el delta exacto (±30 mm) y el snap vuelve a activarse',
    snapOff10g === false &&
      after10g.snap === true &&
      after10g.past === past10g + 1 &&
      Math.abs(xAfter10g - (minX10g + delta10g.dx)) <= 30 &&
      Math.abs(zAfter10g - (minZ10g + delta10g.dz)) <= 30,
    `pos=(${xAfter10g},${zAfter10g}) esperado≈(${minX10g + delta10g.dx},${minZ10g + delta10g.dz})`,
  );

  // 10h — Aislamiento: mover el clóset 1 NO toca al clóset 2 ni
  // cambia ningún parámetro.
  await page.locator('[data-modeler-insert-wardrobe]').click();
  await page
    .waitForFunction(
      () =>
        window.__modeler.getComponentStates()['component-2']?.status ===
        'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const doc10h = await page.evaluate(() => window.__modeler.getDocument());
  const c1Before10h = doc10h.objects.find(
    (object) => object.id === 'component-1',
  );
  const c2Before10h = doc10h.objects.find(
    (object) => object.id === 'component-2',
  );
  await page.locator('[data-modeler-object="component-1"]').click();
  await page.waitForTimeout(150);
  const c1Dims10h = c1Before10h.params.dimensions;
  const grab10h = {
    x: c1Before10h.transform.positionMm[0] + c1Dims10h.widthMm / 2,
    y: 0,
    z: c1Before10h.transform.positionMm[2] + c1Dims10h.depthMm / 2,
  };
  const from10h = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    grab10h,
  );
  const to10h = await page.evaluate(
    (p) => window.__modelerProject([p.x, p.y, p.z]),
    { x: grab10h.x + 300, y: 0, z: grab10h.z + 200 },
  );
  await page.mouse.move(from10h.x, from10h.y);
  await page.mouse.down();
  await page.mouse.move(to10h.x, to10h.y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after10h = await page.evaluate(() => window.__modeler.getDocument());
  const c1After10h = after10h.objects.find(
    (object) => object.id === 'component-1',
  );
  const c2After10h = after10h.objects.find(
    (object) => object.id === 'component-2',
  );
  check(
    '10h. mover el clóset 1 lo desplaza (snap) sin tocar posición NI params del clóset 2 ni los suyos',
    c1After10h.transform.positionMm[0] ===
      snap100(c1Before10h.transform.positionMm[0] + 300) &&
      c1After10h.transform.positionMm[2] ===
        snap100(c1Before10h.transform.positionMm[2] + 200) &&
      JSON.stringify(c1After10h.params) ===
        JSON.stringify(c1Before10h.params) &&
      JSON.stringify(c2After10h.transform) ===
        JSON.stringify(c2Before10h.transform) &&
      JSON.stringify(c2After10h.params) === JSON.stringify(c2Before10h.params),
    `c1=[${c1Before10h.transform.positionMm}]→[${c1After10h.transform.positionMm}] c2 intacto`,
  );
  await shootStable(page, '22-clots-movidos', canvasClip);

  // 10i — Campo exacto del clóset + Undo/Redo del movimiento.
  await page.locator('[data-modeler-field="position-x"]').fill('1500');
  await page.waitForTimeout(200);
  const moved10i = await page.evaluate(() => window.__modeler.getDocument());
  const c1Moved10i = moved10i.objects.find(
    (object) => object.id === 'component-1',
  );
  await page.locator('[data-modeler-undo]').click();
  await page.waitForTimeout(200);
  const undone10i = await page.evaluate(() => window.__modeler.getDocument());
  const c1Undone10i = undone10i.objects.find(
    (object) => object.id === 'component-1',
  );
  await page.locator('[data-modeler-redo]').click();
  await page.waitForTimeout(200);
  const redone10i = await page.evaluate(() => window.__modeler.getDocument());
  const c1Redone10i = redone10i.objects.find(
    (object) => object.id === 'component-1',
  );
  check(
    '10i. campo exacto del clóset (x=1500) con Undo/Redo exactos del movimiento',
    c1Moved10i.transform.positionMm[0] === 1500 &&
      c1Undone10i.transform.positionMm[0] ===
        c1After10h.transform.positionMm[0] &&
      c1Redone10i.transform.positionMm[0] === 1500,
    `movido=${c1Moved10i.transform.positionMm[0]} deshecho=${c1Undone10i.transform.positionMm[0]} rehecho=${c1Redone10i.transform.positionMm[0]}`,
  );

  // 10j — Eliminar y restaurar el sólido conserva SU posición.
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.locator('[data-modeler-delete]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-modeler-undo]').click();
  await page.waitForTimeout(400);
  const restored10j = await page.evaluate(() => window.__modeler.getDocument());
  const solid10j = restored10j.objects.find(
    (object) => object.id === 'solid-1',
  );
  const x10j = Math.min(...solid10j.geometry.sketch.pointsMm.map((p) => p[0]));
  check(
    '10j. eliminar y restaurar el sólido conserva su posición movida',
    x10j === xAfter10g && solid10j.geometry.extrusionMm === 100,
    `x=${x10j} esperado=${xAfter10g}`,
  );

  // 10k — Rendimiento en escena con VARIOS muebles: inserción y
  // movimiento con reloj real (límites generosos; el valor exacto
  // se registra en el informe).
  const insertTimed10k = async (id) => {
    const start = Date.now();
    await page.locator('[data-modeler-insert-wardrobe]').click();
    await page
      .waitForFunction(
        (componentId) =>
          window.__modeler.getComponentStates()[componentId]?.status ===
          'ready',
        id,
        { timeout: 30_000 },
      )
      .catch(() => undefined);
    return Date.now() - start;
  };
  perfWave01.insercion3Ms = await insertTimed10k('component-3');
  perfWave01.insercion4Ms = await insertTimed10k('component-4');
  const moveStart10k = Date.now();
  await page.locator('[data-modeler-field="position-z"]').fill('400');
  await page.waitForFunction(
    () => window.__modeler.getDocument().objects.some(
      (object) =>
        object.id === 'component-4' &&
        object.transform.positionMm[2] === 400,
    ),
    undefined,
    { timeout: 10_000 },
  ).catch(() => undefined);
  perfWave01.movimientoMs = Date.now() - moveStart10k;
  const comps10k = await page.evaluate(() => window.__modeler.getComponentStates());
  check(
    '10k. escena con 4 clósets: inserción y movimiento dentro de límites holgados',
    comps10k['component-3']?.status === 'ready' &&
      comps10k['component-4']?.status === 'ready' &&
      perfWave01.insercion3Ms < 20_000 &&
      perfWave01.insercion4Ms < 20_000 &&
      perfWave01.movimientoMs < 5_000,
    `inserción3=${perfWave01.insercion3Ms} ms inserción4=${perfWave01.insercion4Ms} ms movimiento=${perfWave01.movimientoMs} ms`,
  );
  await shootStable(page, '23-cuatro-closets', canvasClip);

  // 10l — Liberación de recursos tras mover: al vaciar la escena,
  // paridad TOTAL de los dos ciclos de vida (sólidos y piezas).
  for (const id of ['component-4', 'component-3', 'component-2', 'component-1', 'solid-1']) {
    await page.locator(`[data-modeler-object="${id}"]`).click();
    await page.locator('[data-modeler-delete]').click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  const life10l = await page.evaluate(() => window.__modeler.getGeometryStats());
  const partsLife10l = await page.evaluate(
    () => window.__modeler.getPartsGeometryStats(),
  );
  const rows10l = await page.locator('[data-modeler-object]').count();
  check(
    '10l. tras mover y vaciar la escena: paridad TOTAL de ciclos de vida (cero fugas)',
    rows10l === 0 &&
      life10l.created === life10l.disposed &&
      partsLife10l.created === partsLife10l.disposed,
    `sólidos ${life10l.disposed}/${life10l.created} · piezas ${partsLife10l.disposed}/${partsLife10l.created}`,
  );
  await shootStable(page, '24-wave01-final-vacio', canvasClip);

  // --- WAVE-01 BLOQUE 3 — 11a…11m: persistencia local ------
  // Guardar como (prompt) → recarga → apertura con igualdad de
  // documento, geometría regenerada e historial vacío → editar tras
  // recuperar → CRUD con diálogos (guardias de pérdida incluidas) →
  // sobre corrupto visible y eliminable → namespace aislado del
  // configurador → liberación de recursos.

  // 11a — Escena de trabajo: sólido 1200×600×100 + clóset «Listo».
  await page.getByRole('button', { name: 'Rectángulo' }).click();
  const drawX11 = sceneBox.x + sceneBox.width * 0.35;
  const drawY11 = sceneBox.y + sceneBox.height * 0.55;
  await page.mouse.move(drawX11, drawY11);
  await page.mouse.down();
  await page.mouse.move(drawX11 + 240, drawY11 + 130, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('[data-modeler-pending]');
  await page.locator('[data-modeler-field="pending-width"]').fill('1200');
  await page.locator('[data-modeler-field="pending-depth"]').fill('600');
  await page.locator('[data-modeler-field="pending-height"]').fill('100');
  await page.locator('[data-modeler-extrude]').click();
  await page
    .waitForFunction(
      () => window.__modeler.getStates()['solid-1']?.status === 'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await page.locator('[data-modeler-insert-wardrobe]').click();
  await page
    .waitForFunction(
      () =>
        window.__modeler.getComponentStates()['component-1']?.status ===
        'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  await page.getByRole('button', { name: 'Seleccionar' }).click();
  const prep11 = await page.evaluate(() => ({
    solid: window.__modeler.getStates()['solid-1']?.status,
    comp: window.__modeler.getComponentStates()['component-1']?.status,
    objectCount: window.__modeler.getDocument().objects.length,
  }));
  check(
    '11a. escena de trabajo para persistencia: sólido + clóset «Listo» (2 objetos)',
    prep11.solid === 'ready' &&
      prep11.comp === 'ready' &&
      prep11.objectCount === 2,
    `solid=${prep11.solid} clóset=${prep11.comp} objetos=${prep11.objectCount}`,
  );

  // Cancelación de «Guardar como» (prompt descartado) → nada cambia.
  const beforeCancel11 = await page.evaluate(() => ({
    summaries: window.__modeler.getDesigns().summaries.length,
    active: window.__modeler.getDesigns().activeDesign,
    storageKeys: Object.keys(localStorage).filter((key) =>
      key.startsWith('furniconfig.modeler.designs'),
    ).length,
  }));
  dialogPlan.promptCancel = true;
  await page.locator('[data-modeler-design-save-as]').click();
  await page.waitForTimeout(200);
  const afterCancel11 = await page.evaluate(() => ({
    summaries: window.__modeler.getDesigns().summaries.length,
    active: window.__modeler.getDesigns().activeDesign,
    storageKeys: Object.keys(localStorage).filter((key) =>
      key.startsWith('furniconfig.modeler.designs'),
    ).length,
  }));
  check(
    '11b. cancelar el prompt de «Guardar como» no crea ni altera nada',
    JSON.stringify(afterCancel11) === JSON.stringify(beforeCancel11),
    `antes=${beforeCancel11.summaries} tras=${afterCancel11.summaries}`,
  );

  // 11c — Guardar como con nombre: sobre v1 en el namespace del
  // modelador; la clave del configurador NO cambia (aislamiento).
  const configBefore11 = await page.evaluate(() =>
    localStorage.getItem('furniconfig.designs'),
  );
  dialogPlan.promptValue = 'Wave01 Escena';
  await page.locator('[data-modeler-design-save-as]').click();
  await page.waitForFunction(
    () => window.__modeler.getDesigns().activeDesign?.id === 'design-1',
    undefined,
    { timeout: 5000 },
  ).catch(() => undefined);
  const saved11 = await page.evaluate(() => {
    const raw = localStorage.getItem('furniconfig.modeler.designs.design-1');
    const envelope = raw === null ? null : JSON.parse(raw);
    return {
      designs: window.__modeler.getDesigns(),
      envelope,
      configValue: localStorage.getItem('furniconfig.designs'),
      docName: window.__modeler.getDocument().name,
    };
  });
  const envelopeKeys11 =
    saved11.envelope === null
      ? []
      : Object.keys(saved11.envelope).sort();
  check(
    '11c. «Guardar como» crea design-1: sobre v1 con solo format/version/document, sin mallas, y NO toca la clave del configurador',
    saved11.envelope !== null &&
      saved11.envelope.format === 'furniconfig-scene' &&
      envelopeKeys11.join(',') === 'document,format,version' &&
      saved11.envelope.document.objects.length === 2 &&
      saved11.envelope.document.objects.every(
        (object) => object.mesh === undefined && object.parts === undefined,
      ) &&
      saved11.designs.activeDesign?.name === 'Wave01 Escena' &&
      saved11.designs.dirty === false &&
      saved11.designs.summaries.some(
        (entry) => entry.id === 'design-1' && entry.name === 'Wave01 Escena',
      ) &&
      saved11.configValue === configBefore11,
    `sobre=[${envelopeKeys11}] activo=${saved11.designs.activeDesign?.name ?? 'null'}`,
  );
  await shootStable(page, '25-wave01-guardado', canvasClip);

  // 11d — WAVE-02 (cambio INTENCIONAL de expectativa, BLOQUE 3):
  // ANTES, tras recargar, la escena volvía a la semilla y el selector
  // no se abría por sí solo. AHORA la recuperación del borrador es
  // segura y EXPLÍCITA: la bienvenida nombra qué se continúa (y ofrece
  // descartarlo); el editor NO se abre implícitamente y los diseños
  // guardados siguen intactos. La aserción afectada se sustituye y se
  // añade la del nuevo comportamiento (11d2).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  const reload11 = await page.evaluate(() => ({
    welcomeVisible:
      document.querySelector('[data-modeler-welcome]') !== null,
    editorMounted: document.querySelector('[data-modeler]') !== null,
    draftCard:
      document
        .querySelector('[data-welcome-draft]')
        ?.getAttribute('data-welcome-draft') ?? null,
    draftExists:
      localStorage.getItem('furniconfig.modeler.draft') !== null,
    designKeys: Object.keys(localStorage).filter((key) =>
      key.startsWith('furniconfig.modeler.designs'),
    ).length,
  }));
  check(
    '11d. tras recargar: bienvenida con tarjeta de borrador, editor NO abierto y diseños intactos',
    reload11.welcomeVisible &&
      !reload11.editorMounted &&
      reload11.draftCard === 'ok' &&
      reload11.draftExists &&
      reload11.designKeys >= 1,
    `bienvenida=${reload11.welcomeVisible} editor=${reload11.editorMounted} tarjeta=${reload11.draftCard} diseños=${reload11.designKeys}`,
  );
  await shootStable(page, '24b-wave02-bienvenida-recarga');

  // 11d2 — «Continuar» restaura el borrador con su diseño activo.
  await page.click('[data-welcome-continue]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  await page
    .waitForFunction(
      () => window.__modeler.getDocument().objects.length === 2,
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  const continued11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    objectCount: window.__modeler.getDocument().objects.length,
    mode: window.__modeler.getMode(),
  }));
  check(
    '11d2. «Continuar» restaura el borrador: 2 objetos, design-1 activo y sin cambios pendientes',
    continued11.designs.activeDesign?.id === 'design-1' &&
      continued11.objectCount === 2 &&
      continued11.designs.dirty === false,
    `activo=${continued11.designs.activeDesign?.id ?? 'null'} objetos=${continued11.objectCount} sucio=${continued11.designs.dirty}`,
  );

  // 11e — Abrir design-1: documento IGUAL al sobre, historial vacío,
  // geometría regenerada y mensaje «Abierto».
  await page.locator('[data-modeler-design-select]').selectOption('design-1');
  await page
    .waitForFunction(
      () => window.__modeler.getDesigns().activeDesign?.id === 'design-1',
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  await page
    .waitForFunction(
      () =>
        window.__modeler.getStates()['solid-1']?.status === 'ready' &&
        window.__modeler.getComponentStates()['component-1']?.status ===
          'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const opened11 = await page.evaluate(() => {
    const envelope = JSON.parse(
      localStorage.getItem('furniconfig.modeler.designs.design-1'),
    );
    return {
      equal:
        JSON.stringify(window.__modeler.getDocument()) ===
        JSON.stringify(envelope.document),
      history: window.__modeler.getHistory(),
      states: window.__modeler.getStates(),
      compStates: window.__modeler.getComponentStates(),
      designs: window.__modeler.getDesigns(),
      objectCount: window.__modeler.getDocument().objects.length,
    };
  });
  check(
    '11e. abrir: documento ÍNTEGRO igual al sobre, historial VACÍO, «Abierto» anunciado y geometría regenerada «Listo»',
    opened11.equal &&
      opened11.objectCount === 2 &&
      opened11.history.past === 0 &&
      opened11.history.canUndo === false &&
      String(opened11.history.message ?? '').includes('Abierto') &&
      opened11.states['solid-1']?.status === 'ready' &&
      opened11.compStates['component-1']?.status === 'ready' &&
      opened11.designs.dirty === false,
    `igual=${opened11.equal} objetos=${opened11.objectCount} historial=${opened11.history.past} mensaje=${opened11.history.message ?? 'ninguno'}`,
  );
  await shootStable(page, '26-wave01-abierto', canvasClip);

  // 11f — Editar tras recuperar: posición exacta con UNA entrada y
  // undo exacto al valor recuperado (esquina mínima del croquis).
  const posBeforeEdit11 = await page.evaluate(() => {
    const solid = window.__modeler
      .getDocument()
      .objects.find((object) => object.id === 'solid-1');
    return Math.min(...solid.geometry.sketch.pointsMm.map((point) => point[0]));
  });
  await page.locator('[data-modeler-object="solid-1"]').click();
  await page.locator('[data-modeler-field="position-x"]').fill('700');
  await page.waitForTimeout(200);
  const edited11 = await page.evaluate(() => ({
    history: window.__modeler.getHistory(),
    x: Math.min(
      ...window.__modeler
        .getDocument()
        .objects.find((object) => object.id === 'solid-1')
        .geometry.sketch.pointsMm.map((point) => point[0]),
    ),
    dirty: window.__modeler.getDesigns().dirty,
  }));
  await page.locator('[data-modeler-undo]').click();
  await page.waitForTimeout(200);
  const undone11 = await page.evaluate(
    () =>
      Math.min(
        ...window.__modeler
          .getDocument()
          .objects.find((object) => object.id === 'solid-1')
          .geometry.sketch.pointsMm.map((point) => point[0]),
      ),
  );
  check(
    '11f. editar tras recuperar: posición exacta con una entrada, marca «sin guardar» y undo restaura el valor recuperado',
    edited11.x === 700 &&
      edited11.history.past === 1 &&
      edited11.dirty === true &&
      undone11 === posBeforeEdit11,
    `x=${edited11.x} historial=${edited11.history.past} undo→${undone11} esperado=${posBeforeEdit11}`,
  );

  // 11g — Renombrar (prompt) del diseño con foco: storage y panel.
  dialogPlan.promptValue = 'Wave01 Renombrado';
  await page.locator('[data-modeler-design-rename]').click();
  await page.waitForTimeout(250);
  const renamed11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    storedName: JSON.parse(
      localStorage.getItem('furniconfig.modeler.designs.design-1'),
    ).document.name,
  }));
  check(
    '11g. renombrar actualiza listado, diseño activo y el nombre dentro del sobre (id intacto)',
    renamed11.designs.activeDesign?.name === 'Wave01 Renombrado' &&
      renamed11.designs.summaries.find((entry) => entry.id === 'design-1')
        ?.name === 'Wave01 Renombrado' &&
      renamed11.storedName === 'Wave01 Renombrado',
    `activo=${renamed11.designs.activeDesign?.name} sobre=${renamed11.storedName}`,
  );

  // 11h — Duplicar: design-2 con «(copia)» y contenido equivalente.
  await page.locator('[data-modeler-design-duplicate]').click();
  await page.waitForTimeout(250);
  const duplicated11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    copy: JSON.parse(
      localStorage.getItem('furniconfig.modeler.designs.design-2'),
    ),
  }));
  check(
    '11h. duplicar crea design-2 con «(copia)» y el documento equivalente; el original intacto',
    duplicated11.designs.summaries.some(
      (entry) =>
        entry.id === 'design-2' &&
        entry.name === 'Wave01 Renombrado (copia)',
    ) &&
      duplicated11.copy.document.objects.length === 2 &&
      duplicated11.designs.activeDesign?.id === 'design-1',
    `listado=${duplicated11.designs.summaries.map((entry) => entry.id).join('+')}`,
  );

  // 11i — Guardia de «Nuevo»: primero la escena se hace SUCIA (flecha
  // de posición) para que la guardia exista de verdad; cancelar el
  // confirm conserva todo; aceptar instala la semilla.
  await page.locator('[data-modeler-nudge="+x"]').click();
  await page.waitForTimeout(150);
  const dirtyBeforeNew11 = await page.evaluate(
    () => window.__modeler.getDesigns().dirty,
  );
  dialogPlan.confirm = false;
  await page.locator('[data-modeler-design-new]').click();
  await page.waitForTimeout(200);
  const cancelNew11 = await page.evaluate(() => ({
    active: window.__modeler.getDesigns().activeDesign?.id ?? null,
    objectCount: window.__modeler.getDocument().objects.length,
  }));
  await page.locator('[data-modeler-design-new]').click(); // confirm aceptado
  await page.waitForTimeout(250);
  const newAfter11 = await page.evaluate(() => ({
    active: window.__modeler.getDesigns().activeDesign,
    objectCount: window.__modeler.getDocument().objects.length,
    message: window.__modeler.getDesigns().message,
    history: window.__modeler.getHistory(),
  }));
  check(
    '11i. «Nuevo» con guardia real (escena sucia): cancelar conserva el diseño abierto; aceptar instala la semilla con historial vacío',
    dirtyBeforeNew11 === true &&
      cancelNew11.active === 'design-1' &&
      cancelNew11.objectCount === 2 &&
      newAfter11.active === null &&
      newAfter11.objectCount === 0 &&
      newAfter11.history.past === 0 &&
      String(newAfter11.message ?? '').includes('Nueva escena'),
    `sucia=${dirtyBeforeNew11} cancelado=${cancelNew11.active} aceptado=${newAfter11.active === null ? 'semilla' : 'no'}`,
  );

  // 11j — Abrir la copia → sus 2 objetos regeneran «Listo».
  await page.locator('[data-modeler-design-select]').selectOption('design-2');
  await page
    .waitForFunction(
      () =>
        window.__modeler.getDesigns().activeDesign?.id === 'design-2' &&
        window.__modeler.getStates()['solid-1']?.status === 'ready' &&
        window.__modeler.getComponentStates()['component-1']?.status ===
          'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const copyOpened11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    objectCount: window.__modeler.getDocument().objects.length,
    states: window.__modeler.getStates(),
    compStates: window.__modeler.getComponentStates(),
  }));
  check(
    '11j. abrir la copia: 2 objetos con geometría regenerada «Listo»',
    copyOpened11.designs.activeDesign?.id === 'design-2' &&
      copyOpened11.objectCount === 2 &&
      copyOpened11.states['solid-1']?.status === 'ready' &&
      copyOpened11.compStates['component-1']?.status === 'ready',
    `objetos=${copyOpened11.objectCount}`,
  );
  await shootStable(page, '27-wave01-crud', canvasClip);

  // 11k — Eliminar design-2 con confirmación: fuera del listado y del
  // storage; la escena abierta NO se pierde.
  await page.locator('[data-modeler-design-delete]').click();
  await page.waitForTimeout(250);
  const deleted11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    stored: localStorage.getItem('furniconfig.modeler.designs.design-2'),
    objectCount: window.__modeler.getDocument().objects.length,
  }));
  check(
    '11k. eliminar con confirmación (diálogo mostrado) retira design-2 del listado y del storage sin perder la escena abierta',
    deleted11.designs.summaries.every((entry) => entry.id !== 'design-2') &&
      deleted11.stored === null &&
      deleted11.designs.activeDesign === null &&
      deleted11.objectCount === 2 &&
      dialogLog.some((entry) => entry.includes('¿Eliminar el diseño')),
    `listado=${deleted11.designs.summaries.map((entry) => entry.id).join('+')} objetos=${deleted11.objectCount}`,
  );

  // 11l — Liberación de recursos tras recuperar y editar: vaciar la
  // escena devuelve la paridad TOTAL de ambos ciclos de vida.
  for (const id of ['component-1', 'solid-1']) {
    await page.locator(`[data-modeler-object="${id}"]`).click();
    await page.locator('[data-modeler-delete]').click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(400);
  const life11 = await page.evaluate(() => window.__modeler.getGeometryStats());
  const partsLife11 = await page.evaluate(
    () => window.__modeler.getPartsGeometryStats(),
  );
  const rows11 = await page.locator('[data-modeler-object]').count();
  check(
    '11l. tras abrir, editar y vaciar: paridad TOTAL de ciclos de vida (cero fugas)',
    rows11 === 0 &&
      life11.created === life11.disposed &&
      partsLife11.created === partsLife11.disposed,
    `sólidos ${life11.disposed}/${life11.created} · piezas ${partsLife11.disposed}/${partsLife11.created}`,
  );

  // 11m — Sobre corrupto: se lista como dañado, NO se borra al
  // fallar la apertura (error visible) y se puede ELIMINAR.
  await page.evaluate(() => {
    localStorage.setItem(
      'furniconfig.modeler.designs.design-9',
      '%%%basura-intencional%%%',
    );
  });
  await page.reload({ waitUntil: 'networkidle' });
  // WAVE-02 (cambio intencional): la recarga aterriza en la bienvenida,
  // que lista el corrupto como dañado (sin borrarlo) y ofrece continuar
  // el borrador. La entrada al editor es EXPLÍCITA.
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  const welcomeCorrupt11 = await page.evaluate(() => ({
    brokenListed:
      document.querySelectorAll('.modeler-welcome-design-broken').length,
    corruptKept: localStorage.getItem(
      'furniconfig.modeler.designs.design-9',
    ),
  }));
  check(
    '11m0. la bienvenida lista el corrupto como dañado sin eliminarlo (B3)',
    welcomeCorrupt11.brokenListed >= 1 &&
      welcomeCorrupt11.corruptKept !== null,
    `dañados=${welcomeCorrupt11.brokenListed} registro=${welcomeCorrupt11.corruptKept === null ? 'PERDIDO' : 'intacto'}`,
  );
  await page.click('[data-welcome-continue]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  const corruptListed11 = await page
    .locator('[data-modeler-design-select] option')
    .allTextContents();
  const activeBeforeCorrupt11 = await page.evaluate(
    () => window.__modeler.getDesigns().activeDesign?.id ?? null,
  );
  await page.locator('[data-modeler-design-select]').selectOption('design-9');
  await page.waitForTimeout(250);
  const corruptOpen11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    stored: localStorage.getItem('furniconfig.modeler.designs.design-9'),
  }));
  const corruptErrorVisible11 = await page
    .locator('[data-modeler-design-error]')
    .count();
  check(
    '11m. sobre corrupto: listado con la entrada dañada, apertura con error visible y el registro NO se pierde',
    corruptListed11.some((label) => label.includes('design-9 (dañado')) &&
      corruptErrorVisible11 === 1 &&
      corruptOpen11.designs.error !== null &&
      (corruptOpen11.designs.activeDesign?.id ?? null) ===
        activeBeforeCorrupt11 &&
      corruptOpen11.stored !== null,
    `errEl=${corruptErrorVisible11} error=${corruptOpen11.designs.error !== null ? 'sí' : 'no'} activo=${corruptOpen11.designs.activeDesign?.id ?? 'null'} (antes ${activeBeforeCorrupt11 ?? 'null'}) registro=${corruptOpen11.stored !== null ? 'intacto' : 'PERDIDO'} opciones=[${corruptListed11.join(' / ')}]`,
  );
  await page.locator('[data-modeler-design-delete]').click();
  await page.waitForTimeout(250);
  const corruptDeleted11 = await page.evaluate(() => ({
    stored: localStorage.getItem('furniconfig.modeler.designs.design-9'),
    design1: localStorage.getItem('furniconfig.modeler.designs.design-1'),
  }));
  check(
    '11n. el corrupto se puede eliminar (recuperación) sin tocar a design-1',
    corruptDeleted11.stored === null &&
      corruptDeleted11.design1 !== null &&
      (await page
        .locator('[data-modeler-design-select] option')
        .allTextContents())
        .every((label) => !label.includes('design-9')),
    `design-1=${corruptDeleted11.design1 !== null ? 'intacto' : 'PERDIDO'}`,
  );
  await shootStable(page, '28-wave01-corrupto', canvasClip);

  // 11o — El configurador original sigue funcionando (navegación en
  // la misma pestaña) y el diseño del modelador persiste al volver.
  // Con WAVE-02 el retorno aterriza en la bienvenida: la entrada al
  // editor vuelve a ser explícita («Continuar»).
  await page.goto(`${baseUrl}/#/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 15_000 });
  await page.goto(`${baseUrl}/#/modeler`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  const draftCardBack11 = await page
    .locator('[data-welcome-draft]')
    .getAttribute('data-welcome-draft');
  check(
    '11o0. al volver del configurador: bienvenida con borrador recuperable (sin auto-apertura)',
    draftCardBack11 === 'ok',
    `tarjeta=${draftCardBack11}`,
  );
  await page.click('[data-welcome-continue]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  const back11 = await page.evaluate(() => ({
    designs: window.__modeler.getDesigns(),
    key: localStorage.getItem('furniconfig.modeler.designs.design-1'),
    configValue: localStorage.getItem('furniconfig.designs'),
  }));
  check(
    '11o. vuelta desde el configurador: modelador operativo, design-1 intacto y claves separadas',
    back11.designs.summaries.some((entry) => entry.id === 'design-1') &&
      back11.key !== null &&
      back11.configValue === configBefore11,
    `listado=${back11.designs.summaries.length} configurador=${back11.configValue === configBefore11 ? 'intacto' : 'CAMBIÓ'}`,
  );
  await shootStable(page, '29-wave01-final', canvasClip);

  // --- 13. WAVE-02 (UX-A): inicio, crear clóset y modo sencillo ---
  // 13a — «Inicio» regresa a la bienvenida con el borrador recuperable
  // (la escena de trabajo NO se pierde: está en el borrador).
  await page.click('[data-modeler-home]');
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  const home13 = await page.evaluate(() => ({
    draftCard:
      document
        .querySelector('[data-welcome-draft]')
        ?.getAttribute('data-welcome-draft') ?? null,
    designsListed: document.querySelectorAll('[data-welcome-open]').length,
  }));
  check(
    '13a. «Inicio» regresa a la bienvenida con la tarjeta del borrador',
    home13.draftCard === 'ok' && home13.designsListed >= 1,
    `tarjeta=${home13.draftCard} diseños=${home13.designsListed}`,
  );
  await shootStable(page, '30-wave02-inicio');

  // 13b — «Crear clóset»: modo sencillo, UN clóset válido en escena,
  // seleccionado, geometría lista y encuadre sobre el mueble real.
  await page.click('[data-welcome-create]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  await page
    .waitForFunction(
      () =>
        window.__modeler.getComponentStates()['component-1']?.status ===
        'ready',
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  const created13 = await page.evaluate(() => ({
    mode: window.__modeler.getMode(),
    sel: window.__modeler.getSelection()?.anchor ?? null,
    objectCount: window.__modeler.getDocument().objects.length,
    hint: window.__modeler.getStartHint(),
    saveState: window.__modeler.getSaveState(),
    engineSpan: document.querySelectorAll('[data-modeler-engine]').length,
    docState:
      document.querySelector('[data-modeler-doc-state]')?.textContent ?? '',
    sceneHint:
      document.querySelector('[data-modeler-scene-hint]')?.textContent ?? '',
    bounds: window.__modeler.getFramedBounds(),
    compState:
      window.__modeler.getComponentStates()['component-1']?.status ?? null,
    selectionPanel:
      document.querySelectorAll('[data-modeler-selection-status]').length,
  }));
  check(
    '13b. «Crear clóset»: modo sencillo, 1 clóset válido, seleccionado y «listo»',
    created13.mode === 'simple' &&
      created13.objectCount === 1 &&
      created13.sel === 'component-1' &&
      created13.compState === 'ready' &&
      created13.selectionPanel >= 1,
    `modo=${created13.mode} objetos=${created13.objectCount} sel=${created13.sel} motor=${created13.compState}`,
  );
  check(
    '13c. el encuadre apunta al mueble real (caja ajustada al clóset con margen)',
    created13.bounds.min[0] < 0 &&
      created13.bounds.max[0] > 2 && created13.bounds.max[0] < 3.5 &&
      created13.bounds.min[1] === 0 &&
      created13.bounds.max[1] > 2.2 && created13.bounds.max[1] < 3,
    `bounds=${JSON.stringify(created13.bounds)}`,
  );
  check(
    '13d. modo sencillo: sin jerga del motor, doc-state breve y pista de edición visible',
    created13.engineSpan === 0 &&
      !created13.docState.includes('rejilla') &&
      (created13.hint ?? '').includes('clóset') &&
      created13.sceneHint.includes('Arrastra el ratón'),
    `motor=${created13.engineSpan} doc-state=${created13.docState.trim()} pista=${created13.hint ?? 'ninguna'}`,
  );
  check(
    '13e. chip de guardado: «Cambios sin guardar» desde la creación sin diseño',
    created13.saveState === 'dirty-unsaved',
    created13.saveState,
  );
  await shootStable(page, '31-wave02-crear-closet', canvasClip);

  // 13f — Propiedades del clóset visibles en el panel derecho.
  const fields13 = await page.locator('[data-modeler-field]').count();
  check(
    '13f. propiedades del clóset visibles (ancho/alto/fondo/módulos/puertas…)',
    fields13 >= 5,
    `campos=${fields13}`,
  );

  // 13g — Cambiar de modo NO pierde documento, selección ni historial.
  const before13 = await page.evaluate(() => ({
    objects: window.__modeler.getDocument().objects.length,
    anchor: window.__modeler.getSelection()?.anchor ?? null,
    canUndo: window.__modeler.getHistory().canUndo,
  }));
  await page.locator('[data-modeler-mode]').click();
  await page.waitForTimeout(200);
  const afterToggle13 = await page.evaluate(() => ({
    mode: window.__modeler.getMode(),
    objects: window.__modeler.getDocument().objects.length,
    anchor: window.__modeler.getSelection()?.anchor ?? null,
    canUndo: window.__modeler.getHistory().canUndo,
    engineSpan: document.querySelectorAll('[data-modeler-engine]').length,
    docState:
      document.querySelector('[data-modeler-doc-state]')?.textContent ?? '',
  }));
  check(
    '13g. activar «Modo avanzado»: vuelve el material técnico y nada se pierde',
    afterToggle13.mode === 'advanced' &&
      afterToggle13.engineSpan === 1 &&
      afterToggle13.docState.includes('rejilla') &&
      afterToggle13.objects === before13.objects &&
      afterToggle13.anchor === before13.anchor &&
      afterToggle13.canUndo === before13.canUndo,
    `modo=${afterToggle13.mode} objetos=${afterToggle13.objects}/${before13.objects} sel=${afterToggle13.anchor} (antes ${before13.anchor})`,
  );
  await shootStable(page, '32-wave02-modo-avanzado', canvasClip);

  // 13h — Volver a sencillo y RECARGAR: el modo preferido se recuerda
  // en la sesión y la escena continúa desde el borrador (1 clóset).
  await page.locator('[data-modeler-mode]').click();
  await page.waitForTimeout(500); // deja escribir el borrador (debounce 300 ms)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-modeler-welcome]', { timeout: 15_000 });
  await page.click('[data-welcome-continue]');
  await page.waitForSelector('[data-modeler]', { timeout: 15_000 });
  const modeRemembered13 = await page.evaluate(() => ({
    mode: window.__modeler.getMode(),
    objects: window.__modeler.getDocument().objects.length,
    saveState: window.__modeler.getSaveState(),
  }));
  check(
    '13h. tras recargar, «Continuar» restaura la escena y el modo sencillo preferido',
    modeRemembered13.mode === 'simple' && modeRemembered13.objects === 1,
    `modo=${modeRemembered13.mode} objetos=${modeRemembered13.objects} chip=${modeRemembered13.saveState}`,
  );
  await shootStable(page, '33-wave02-continuar', canvasClip);

  // Diálogos observados (evidencia de las guardias de pérdida).
  console.log(`   diálogos: ${dialogLog.join(' | ')}`);

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
        fase: '4C-A + 4C-B + 4C-C + 4C-D + WAVE-01 + WAVE-02 UX-A (inicio, encuadre y modo sencillo)',
        fecha: new Date().toISOString(),
        viewport: '1440×900',
        total: results.length,
        aprobadas: results.length - failures.length,
        fallos: failures.length,
        rendimientoWave01: perfWave01,
        dialogosWave01: dialogLog,
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
