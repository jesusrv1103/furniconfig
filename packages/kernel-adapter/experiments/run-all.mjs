/**
 * FASE-4B-0 — orquestador de experimentos (V1 + V4 + V5 en navegador/Node).
 *
 * Ejecuta:
 *   1. experiments/init-bench.mjs   → inicialización WASM en N procesos frescos (V4)
 *   2. experiments/memory-probe.mjs → sonda de memoria y limpieza (V5)
 *   3. experiments/blocking-probe.mjs → bloqueo del hilo principal en Node (sección 3)
 *   4. experiments/vite-check.mjs      → build con Vite + Chromium real (V1/V5 + bloqueo navegador)
 *   5. experiments/vite-check.mjs --dev → dev server real de Vite + Chromium (V1 dev)
 *
 * Y consolida las salidas en experiments/results/4b0-results.json.
 *
 * Uso: node experiments/run-all.mjs [--skip-build]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const resultsDir = join(here, 'results');

function run(script, args = []) {
  process.stderr.write(`[4B-0] → ${script}\n`);
  execFileSync(process.execPath, [join(here, script), ...args], {
    cwd: join(here, '..'),
    stdio: ['ignore', 'inherit', 'inherit'],
  });
}

run('init-bench.mjs', ['5']);
run('memory-probe.mjs');
run('blocking-probe.mjs');
run('vite-check.mjs', process.argv.slice(2));
run('vite-check.mjs', ['--dev']);

const init = JSON.parse(readFileSync(join(resultsDir, '4b0-init-bench.json'), 'utf8'));
const memory = JSON.parse(readFileSync(join(resultsDir, '4b0-memory-probe.json'), 'utf8'));
const blockingNode = JSON.parse(readFileSync(join(resultsDir, '4b0-blocking.json'), 'utf8'));
const vite = JSON.parse(readFileSync(join(resultsDir, '4b0-vite-results.json'), 'utf8'));
const viteDev = JSON.parse(readFileSync(join(resultsDir, '4b0-vite-dev-results.json'), 'utf8'));

const consolidated = {
  fase: '4B-0',
  script: 'experiments/run-all.mjs',
  executedAt: new Date().toISOString(),
  node: init.node,
  browser: vite.result?.env?.userAgent ?? null,
  v1_carga_bajo_vite: {
    buildOk: vite.buildMs > 0 ? `${vite.buildMs.toFixed(0)} ms` : 'omitido (--skip-build)',
    navegadorOk: vite.result?.ok ?? false,
    initMsNavegador: vite.result?.initMs ?? null,
    erroresConsola: vite.consoleErrors ?? [],
    recursos: vite.allResponses ?? [],
    crossOriginIsolated: vite.result?.env?.crossOriginIsolated ?? null,
  },
  v1_carga_bajo_vite_dev: {
    navegadorOk: viteDev.result?.ok ?? false,
    initMsNavegador: viteDev.result?.initMs ?? null,
    erroresConsola: viteDev.consoleErrors ?? [],
    recursos: viteDev.allResponses ?? [],
    crossOriginIsolated: viteDev.result?.env?.crossOriginIsolated ?? null,
    pageSettleMs: viteDev.pageSettleMs ?? null,
  },
  v4_rendimiento: {
    initNode: init,
    navegador: vite.result?.timings ?? null,
    assets: vite.sizes ?? [],
    totalBytes: vite.total ?? null,
  },
  v5_memoria_y_limpieza: memory,
  bloqueo_hilo_principal: {
    nodo: blockingNode,
    navegador: vite.result?.blocking ?? null,
  },
  mediciones: vite.result?.measures ?? null,
  malla: vite.result?.mesh ?? null,
};

mkdirSync(resultsDir, { recursive: true });
const outFile = join(resultsDir, '4b0-results.json');
writeFileSync(outFile, `${JSON.stringify(consolidated, null, 2)}\n`);
process.stdout.write(`\n[4B-0] resultados consolidados en ${outFile}\n`);
