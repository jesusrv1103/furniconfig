/**
 * FASE-4B-C — experimento del Kernel Worker en Chromium real.
 *
 * Construye `experiments/worker-perf` con Vite, lo sirve por HTTP estático
 * (sin COOP/COEP) y ejecuta la medición en Chromium (Playwright), igual que
 * el experimento V1 de 4B-0. Compara el escenario denso (el que congeló el
 * navegador ~883 ms) en hilo principal frente a worker, y verifica el
 * presupuesto de respuesta visual propuesto (gap rAF < 50 ms con worker).
 *
 * Modos:
 *   node experiments/worker-check.mjs             → `vite build` + servidor
 *   node experiments/worker-check.mjs --skip-build → reutiliza el build
 *
 * Salida: experiments/results/4b1-worker-perf.json
 */
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(here, 'worker-perf', 'dist');
const resultsDir = join(here, 'results');

function step(message) {
  writeSync(2, `[4B-C] ${message}\n`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
};

function build() {
  if (process.argv.includes('--skip-build')) return { buildMs: 0, skipped: true };
  const viteBin = join(here, '..', '..', '..', 'node_modules', '.bin', 'vite');
  const startedAt = performance.now();
  execFileSync(viteBin, ['build', '-c', join(here, 'worker-perf', 'vite.config.ts')], {
    cwd: join(here, '..'),
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return { buildMs: performance.now() - startedAt, skipped: false };
}

function assetSizes() {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  return walk(distDir)
    .map((file) => ({ file: file.slice(distDir.length + 1), raw: readFileSync(file).length }))
    .sort((a, b) => b.raw - a.raw);
}

function startServer() {
  const server = createServer((req, res) => {
    const urlPath = (req.url ?? '/').split('?')[0];
    if (urlPath === '/favicon.ico') {
      res.writeHead(204).end();
      return;
    }
    const target = urlPath === '/' ? '/index.html' : urlPath;
    const file = join(distDir, target);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}

async function runInBrowser(port) {
  const { chromium } = await import('playwright');
  let browser;
  try {
    browser = await chromium.launch();
  } catch (cacheError) {
    step(`chromium del cache no disponible; usando channel=chrome (${cacheError.message.split('\n')[0]})`);
    browser = await chromium.launch({ channel: 'chrome' });
  }
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${msg.text()} @ ${msg.location().url}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

  const startedAt = performance.now();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.__FURNICONFIG_WORKER_RESULT__), null, {
    timeout: 120_000,
  });
  const pageSettleMs = performance.now() - startedAt;
  const result = await page.evaluate(() => window.__FURNICONFIG_WORKER_RESULT__);
  await browser.close();
  return { result, pageSettleMs, consoleErrors };
}

async function main() {
  step('construyendo el experimento worker-perf…');
  const { buildMs, skipped } = build();
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error(`no hay build en ${distDir}; ejecute sin --skip-build`);
  }
  const sizes = assetSizes();
  step('sirviendo dist y lanzando Chromium…');
  const { server, port } = await startServer();
  let browserRun;
  try {
    browserRun = await runInBrowser(port);
  } finally {
    server.close();
  }
  const report = {
    fase: '4B-C',
    script: 'experiments/worker-check.mjs',
    executedAt: new Date().toISOString(),
    buildMs: buildMs > 0 ? +buildMs.toFixed(0) : null,
    skipped,
    assets: sizes,
    pageSettleMs: +browserRun.pageSettleMs.toFixed(0),
    consoleErrors: browserRun.consoleErrors,
    result: browserRun.result,
  };
  writeFileSync(join(resultsDir, '4b1-worker-perf.json'), `${JSON.stringify(report, null, 2)}\n`);
  step(`resultado escrito en experiments/results/4b1-worker-perf.json (ok=${report.result?.ok})`);
  if (!report.result?.ok) {
    step(`ERRORES: ${JSON.stringify(report.result?.errors ?? [])}`);
    process.exitCode = 1;
  }
}

await main();
