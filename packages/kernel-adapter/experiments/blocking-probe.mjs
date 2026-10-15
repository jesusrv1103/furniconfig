/**
 * FASE-4B-0 — Experimento de **bloqueo del hilo principal** (sección 3 del
 * cierre). Sonda en Node: demuestra que las operaciones del kernel son
 * síncronas y CPU-bound (el WASM no cede el hilo), midiendo:
 *
 *   1. Duración de operaciones grandes en una curva de tamaños:
 *      construcción de esferas densas y **resta booleana con evaluación
 *      forzada**.
 *   2. **Stall del event loop**: se programa un temporizador de 0 ms justo
 *      antes de la operación; si esta bloquea el hilo, el temporizador solo
 *      podrá dispararse al terminar (≈ duración de la operación).
 *
 * Nota metodológica: `subtract()` es **perezoso** en manifold-3d (las
 * transformaciones y booleanas se combinan y evalúan después); medirlo tal
 * cual da ~0 ms y oculta el coste real. Por eso la operación cronometrada
 * incluye `getMesh()`, que fuerza la evaluación — que es además lo que el
 * editor tendría que hacer para renderizar.
 *
 * El equivalente en navegador (gap de `requestAnimationFrame`) vive en
 * `experiments/vite/main.ts` y se ejecuta bajo build y dev.
 *
 * Uso: node experiments/blocking-probe.mjs [segmentos...]
 * Salida: experiments/results/4b0-blocking.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Module from 'manifold-3d';

const here = fileURLToPath(new URL('.', import.meta.url));
const resultsDir = join(here, 'results');

/** Umbral de "tarea larga" de las guías de rendimiento de la web (50 ms). */
const LONG_TASK_MS = 50;

const segments = process.argv.slice(2).map(Number).filter((v) => Number.isFinite(v) && v > 0);
const sizes = segments.length > 0 ? segments : [256, 512, 1024, 2048];

const topo = await Module();
topo.setup();
const { Manifold } = topo;

/** Ejecuta `fn` síncronamente y mide cuánto se retrasa un temporizador 0 ms. */
async function measureStall(fn) {
  let firedAt = 0;
  setTimeout(() => {
    firedAt = performance.now();
  }, 0);
  const startedAt = performance.now();
  const value = fn();
  const syncMs = performance.now() - startedAt;
  // deja que el event loop se desperece y recoge el temporizador
  await new Promise((resolve) => {
    setTimeout(resolve, 10);
  });
  const stallMs = firedAt - startedAt;
  return { syncMs, stallMs, value };
}

const ops = [];
for (const seg of sizes) {
  const cube = Manifold.cube([400, 400, 400]);

  // 1) construcción de la esfera (síntoma del coste de tesselación)
  const sphereStart = performance.now();
  const ball = Manifold.sphere(300, seg);
  const sphereMs = performance.now() - sphereStart;

  // 2) resta booleana con evaluación forzada (getMesh dispara la evaluación
  //    perezosa de la booleana; sin él mediríamos ~0 ms y ocultaríamos el coste)
  const { syncMs, stallMs, value: diff } = await measureStall(() => {
    const solid = cube.subtract(ball);
    const mesh = solid.getMesh();
    const tris = mesh.numTri;
    solid.delete();
    return tris;
  });

  ops.push({
    segmentosEsfera: seg,
    triangulos: diff,
    esferaMs: +sphereMs.toFixed(2),
    booleanaForzadaMs: +syncMs.toFixed(2),
    stallEventLoopMs: +stallMs.toFixed(2),
    bloqueaHiloPrincipal: syncMs > LONG_TASK_MS,
  });
  cube.delete();
  ball.delete();
}

const report = {
  fase: '4B-0',
  script: 'experiments/blocking-probe.mjs',
  executedAt: new Date().toISOString(),
  node: process.version,
  umbralTareaLargaMs: LONG_TASK_MS,
  metodologia:
    'Para cada N: (a) construcción de una esfera de radio 300 mm con N segmentos, y (b) ' +
    'resta booleana contra una caja de 400 mm cronometrada con getMesh() incluido, ya que ' +
    'subtract() es perezoso y medirlo sin forzar la evaluación daría ~0 ms. Se programa ' +
    'setTimeout(0) antes de la operación: su retraso real (= stallEventLoopMs) mide el ' +
    'bloqueo efectivo del hilo, no solo el tiempo de CPU percibido.',
  operaciones: ops,
  conclusion: ops.some((op) => op.bloqueaHiloPrincipal)
    ? `Operaciones > ${LONG_TASK_MS} ms: el kernel bloquea el hilo principal durante la ejecución (WASM síncrono, sin cesión). En el editor esto congelaría el bucle de render y la entrada del usuario; la estrategia documentada es delegar en un Web Worker.`
    : `Ninguna operación supera ${LONG_TASK_MS} ms en este entorno.`,
};

mkdirSync(resultsDir, { recursive: true });
const outFile = join(resultsDir, '4b0-blocking.json');
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log(`\n[BLOCKING] resultados en ${outFile}`);
