/**
 * FASE-4B-0 — Experimento V1 (+ V4 navegador): construcción con Vite,
 * servido por HTTP y ejecución en Chromium real (Playwright).
 *
 * Mide: éxito del build, tamaño real de los assets (raw/gzip/brotli),
 * inicialización WASM en navegador, operaciones geométricas y tiempos.
 *
 * Modos:
 *   node experiments/vite-check.mjs            → `vite build` + servidor estático
 *   node experiments/vite-check.mjs --dev      → `vite dev` (dev server real)
 *   node experiments/vite-check.mjs --skip-build → reutiliza el build existente
 */
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync, writeSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');
const devMode = process.argv.includes('--dev');

/** Log síncrono: el proceso puede ser matado por timeout, así nada se pierde. */
function step(message) {
  writeSync(2, `[V1] ${message}\n`);
}
const distDir = join(here, 'vite', 'dist');
const resultsDir = join(here, 'results');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function build() {
  if (devMode || process.argv.includes('--skip-build')) {
    return { buildMs: 0, skipped: true, mode: devMode ? 'dev' : 'build-reutilizado' };
  }
  // binario local (node_modules/.bin/vite); evitamos `npx`, que puede quedar
  // esperando entrada en entornos sin TTY.
  const viteBin = join(here, '..', '..', '..', 'node_modules', '.bin', 'vite');
  const startedAt = performance.now();
  execFileSync(viteBin, ['build', '-c', join(here, 'vite', 'vite.config.ts')], {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return { buildMs: performance.now() - startedAt, skipped: false, mode: 'build' };
}

function assetSizes() {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  return walk(distDir)
    .map((file) => {
      const raw = readFileSync(file);
      const rel = file.slice(distDir.length + 1);
      return {
        file: rel,
        raw: raw.length,
        gzip: gzipSync(raw, { level: 9 }).length,
        brotli: brotliCompressSync(raw, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      };
    })
    .sort((a, b) => b.raw - a.raw);
}

function startServer() {
  const server = createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    if (urlPath === '/favicon.ico') {
      // el HTML experimental no define favicon; evitamos ruido en consola
      res.writeHead(204).end();
      return;
    }
    const target = urlPath === '/' ? '/index.html' : urlPath;
    const file = join(distDir, target);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      // sin cabeceras COOP/COEP: se comprueba que el kernel no las exige
    });
    res.end(readFileSync(file));
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}

/** Dev server real de Vite (`vite dev`) — criterio V1 "en dev y en build". */
async function freePort() {
  return new Promise((portPromise) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => portPromise(port));
    });
  });
}

async function startDevServer() {
  const viteBin = join(here, '..', '..', '..', 'node_modules', '.bin', 'vite');
  const port = await freePort();
  const child = spawn(
    viteBin,
    ['--port', String(port), '--strictPort', '--host', '127.0.0.1', '-c', join(here, 'vite', 'vite.config.ts')],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));

  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && !ready) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) ready = true;
    } catch {
      // aún arrancando
    }
    if (!ready) await new Promise((r) => setTimeout(r, 250));
  }
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`el dev server de Vite no respondió en :${port}. Log:\n${logs.join('').slice(0, 800)}`);
  }
  return { stop: () => child.kill('SIGTERM'), port, logs };
}

async function runInBrowser(port) {
  const { chromium } = await import('playwright');
  // Mismo criterio que apps/web/tests/visual/visual-check.mjs: Chromium del
  // cache de Playwright y, si no coincide, Chrome del sistema.
  let browser;
  try {
    browser = await chromium.launch();
  } catch (cacheError) {
    step(`chromium del cache no disponible (${cacheError.message.split('\n')[0]}); usando channel=chrome`);
    browser = await chromium.launch({ channel: 'chrome' });
  }
  const page = await browser.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const allResponses = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()}: ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    allResponses.push(`${res.status()} ${res.url()}`);
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });

  const wallStart = performance.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__FURNICONFIG_KERNEL_RESULT__), null, { timeout: 30_000 });
  const pageSettleMs = performance.now() - wallStart;
  const result = await page.evaluate(() => window.__FURNICONFIG_KERNEL_RESULT__);
  await browser.close();
  return { result, pageSettleMs, consoleErrors, failedRequests, allResponses };
}

function main() {
  if (devMode) {
    step('modo dev: arrancando `vite dev`…');
    return startDevServer()
      .then(async ({ stop, port, logs }) => {
        step(`dev server en 127.0.0.1:${port}; lanzando Chromium…`);
        const browserRun = await runInBrowser(port);
        step('ejecución en navegador terminada (dev)');
        stop();
        return {
          mode: 'dev',
          buildMs: 0,
          skipped: true,
          sizes: [],
          total: null,
          port,
          devServerLog: logs.join('').slice(0, 2000),
          ...browserRun,
        };
      })
      .then((report) => writeReport(report));
  }

  step('build con Vite…');
  const { buildMs, skipped, mode } = build();
  step(`build listo (${buildMs.toFixed(0)} ms); midiendo assets…`);
  const sizes = assetSizes();
  const total = sizes.reduce(
    (acc, s) => ({ raw: acc.raw + s.raw, gzip: acc.gzip + s.gzip, brotli: acc.brotli + s.brotli }),
    { raw: 0, gzip: 0, brotli: 0 },
  );
  step(`assets listos (${sizes.length} ficheros)`);

  return startServer()
    .then(async ({ server, port }) => {
      step(`servidor estático en 127.0.0.1:${port}; lanzando Chromium…`);
      const browserRun = await runInBrowser(port);
      step('ejecución en navegador terminada (build)');
      server.close();
      return { mode, buildMs, skipped, sizes, total, port, ...browserRun };
    })
    .then((report) => writeReport(report));
}

function writeReport(report) {
  mkdirSync(resultsDir, { recursive: true });
  const outFile = join(resultsDir, report.mode === 'dev' ? '4b0-vite-dev-results.json' : '4b0-vite-results.json');
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        build: report.mode === 'dev' ? 'dev server (vite dev)' : `${report.buildMs.toFixed(0)} ms`,
        assets: report.sizes,
        totalBytes: report.total,
        browser: report.result,
        pageSettleMs: +report.pageSettleMs.toFixed(0),
        consoleErrors: report.consoleErrors,
        failedRequests: report.failedRequests,
        allResponses: report.allResponses,
        written: outFile,
      },
      null,
      2,
    ),
  );
  if (!report.result?.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error('FALLO en el experimento V1:', error);
  process.exitCode = 1;
});
