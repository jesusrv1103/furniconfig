/**
 * FASE-4B-0 — V4 (inicialización): mide el tiempo de arranque del WASM de
 * Manifold en **N procesos Node frescos** (metodología reproducible).
 *
 * Nota: el primer arranque de un proceso nuevo puede pagar además la lectura
 * en frío del fichero desde disco; por eso se reporta la distribución, no un
 * único valor.
 *
 * Uso: node experiments/init-bench.mjs [nº de procesos]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const runs = Number(process.argv[2] ?? 5);

const SNIPPET = `
import Module from 'manifold-3d';
const t0 = performance.now();
const toplevel = await Module();
toplevel.setup();
const t1 = performance.now();
// una operación mínima para confirmar que el kernel responde
const solid = toplevel.Manifold.cube([10, 10, 10]);
if (solid.volume() !== 1000) throw new Error('el kernel no responde correctamente');
solid.delete();
console.log(JSON.stringify({ initMs: t1 - t0 }));
`;

const samples = [];
for (let i = 0; i < runs; i += 1) {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', SNIPPET], {
    encoding: 'utf8',
    cwd: join(here, '..'),
  });
  samples.push(JSON.parse(out.trim()).initMs);
}

const sorted = [...samples].sort((a, b) => a - b);
const stats = {
  n: samples.length,
  samplesMs: samples.map((v) => +v.toFixed(2)),
  minMs: +(sorted[0] ?? 0).toFixed(2),
  medianMs: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2),
  maxMs: +(sorted[sorted.length - 1] ?? 0).toFixed(2),
  meanMs: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(2),
  node: process.version,
  measuredAt: new Date().toISOString(),
};

const resultsDir = join(here, 'results');
mkdirSync(resultsDir, { recursive: true });
const outFile = join(resultsDir, '4b0-init-bench.json');
writeFileSync(outFile, `${JSON.stringify(stats, null, 2)}\n`);
console.log(JSON.stringify({ ...stats, written: outFile }, null, 2));
