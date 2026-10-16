import type { MeasureResult } from '../../src/index.js';
import { ManifoldKernel } from '../../src/index.js';
import type { WorkerPort } from '../../src/index.js';
import { WorkerGeometryKernel } from '../../src/index.js';

/**
 * FASE-4B-C — experimento de rendimiento del Kernel Worker (Chromium real).
 *
 * Reproduce el escenario que en 4B-0 congeló el navegador (~883 ms de gap
 * rAF) y lo compara:
 *
 *   1. **Directo** (hilo principal, `ManifoldKernel` crudo — solo benchmark).
 *   2. **Worker** (`WorkerGeometryKernel` sobre un `Worker` de módulo): la
 *      ruta que usará el editor.
 *
 * Mide: gap rAF máximo/medio, retraso de un temporizador 0 ms, latencia
 * p50/p95 de operaciones típicas, operaciones concurrentes, init del worker,
 * reinicio y memoria (Chromium). Resultado en
 * `window.__FURNICONFIG_WORKER_RESULT__`.
 */

const LONG_TASK_MS = 50;
/** Presupuesto de respuesta visual propuesto (§9): gap rAF < tarea larga. */
const VISUAL_BUDGET_MS = 50;

/** Mismo polígono "peine" de 4B-0: denso y en mm enteros (I8). */
function combPolygon(teeth: number): Array<[number, number]> {
  const width = teeth * 70;
  const points: Array<[number, number]> = [
    [0, 0],
    [width, 0],
    [width, 20],
  ];
  for (let i = teeth - 1; i >= 0; i -= 1) {
    const toothLeft = i * 70;
    const toothRight = toothLeft + 50;
    points.push([toothRight, 20], [toothRight, 100], [toothLeft, 100], [toothLeft, 20]);
  }
  return points;
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

interface RafMeasurement {
  gapRafMaxMs: number;
  gapRafMedioMs: number;
  framesObservados: number;
  temporizadorRetrasoMs: number;
}

async function measureRaf(work: () => Promise<void>): Promise<RafMeasurement> {
  const timestamps: number[] = [];
  let on = true;
  const tick = (timestamp: number): void => {
    timestamps.push(timestamp);
    if (on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  let timerFiredAt = 0;
  const timerStartedAt = performance.now();
  setTimeout(() => {
    timerFiredAt = performance.now();
  }, 0);

  await work();
  await new Promise((resolve) => setTimeout(resolve, 50)); // frames de remanso
  on = false;

  const temporizadorRetrasoMs =
    timerFiredAt === 0 ? performance.now() - timerStartedAt : timerFiredAt - timerStartedAt;

  const gaps: number[] = [];
  for (let i = 1; i < timestamps.length; i += 1) {
    gaps.push((timestamps[i] ?? 0) - (timestamps[i - 1] ?? 0));
  }
  return {
    gapRafMaxMs: gaps.length > 0 ? Math.max(...gaps) : 0,
    gapRafMedioMs: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
    framesObservados: timestamps.length,
    temporizadorRetrasoMs,
  };
}

/** Carga densa idéntica a la de 4B-0 (peine 500 dientes + 40 booleanas). */
function heavyOperationDirect(kernel: ManifoldKernel): number {
  const comb = kernel.fromSketch(combPolygon(500), 400);
  const box = kernel.box([30, 30, 600]);
  let current = comb;
  for (let k = 0; k < 40; k += 1) {
    const cutter = kernel.translate(box, [k * 70, -5, 0]);
    current = kernel.difference(current, cutter);
    kernel.toMesh(current); // fuerza la evaluación (subtract es perezoso)
  }
  return kernel.toMesh(current).indices.length / 3;
}

async function heavyOperationWorker(kernel: WorkerGeometryKernel): Promise<{ triangulos: number; pasos: number[] }> {
  const pasos: number[] = [];
  let current = await kernel.fromSketch(combPolygon(500), 400);
  const box = await kernel.box([30, 30, 600]);
  for (let k = 0; k < 40; k += 1) {
    const t0 = performance.now();
    const cutter = await kernel.translate(box, [k * 70, -5, 0]);
    const next = await kernel.difference(current, cutter);
    await kernel.toMesh(next);
    pasos.push(performance.now() - t0);
    current = next;
  }
  const mesh = await kernel.toMesh(current);
  return { triangulos: mesh.indices.length / 3, pasos };
}

/** Operación típica de edición: croquis + hueco + medida. */
async function typicalViaWorker(kernel: WorkerGeometryKernel): Promise<number> {
  const t0 = performance.now();
  const plate = await kernel.fromSketch(
    [
      [0, 0],
      [1200, 0],
      [1200, 600],
      [0, 600],
    ],
    18,
  );
  const hole = await kernel.box([200, 200, 100]);
  const holed = await kernel.difference(plate, hole);
  await kernel.measure(holed);
  return performance.now() - t0;
}

interface WorkerPerfResult {
  ok: boolean;
  errors: string[];
  env: { userAgent: string; hardwareConcurrency: number | null };
  initWorkerMs: number;
  directo: RafMeasurement & { totalMs: number; triangulos: number };
  worker: RafMeasurement & { totalMs: number; triangulos: number; pasosMs: p50p95 };
  latenciaTipicaMs: p50p95 & { muestras: number };
  concurrentes: { solicitudes: number; wallMs: number; medidasOk: boolean };
  reinicio: { downtimeMs: number; operacionPostReinicioOk: boolean };
  memoria: { usedJSHeapSizeAntes: number | null; usedJSHeapSizeDespues: number | null };
  presupuestoVisualMs: number;
  presupuestoVisualCumplido: boolean;
}

interface p50p95 {
  p50: number;
  p95: number;
  max: number;
}

declare global {
  interface Window {
    __FURNICONFIG_WORKER_RESULT__?: WorkerPerfResult;
  }
}

function round(value: number): number {
  return +value.toFixed(2);
}

function stats(values: readonly number[]): p50p95 {
  return {
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    max: round(values.length > 0 ? Math.max(...values) : 0),
  };
}

function heapUsed(): number | null {
  const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize : null;
}

async function run(): Promise<WorkerPerfResult> {
  const result: WorkerPerfResult = {
    ok: false,
    errors: [],
    env: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency ?? null },
    initWorkerMs: 0,
    directo: { gapRafMaxMs: 0, gapRafMedioMs: 0, framesObservados: 0, temporizadorRetrasoMs: 0, totalMs: 0, triangulos: 0 },
    worker: { gapRafMaxMs: 0, gapRafMedioMs: 0, framesObservados: 0, temporizadorRetrasoMs: 0, totalMs: 0, triangulos: 0, pasosMs: stats([]) },
    latenciaTipicaMs: { p50: 0, p95: 0, max: 0, muestras: 0 },
    concurrentes: { solicitudes: 0, wallMs: 0, medidasOk: false },
    reinicio: { downtimeMs: 0, operacionPostReinicioOk: false },
    memoria: { usedJSHeapSizeAntes: null, usedJSHeapSizeDespues: null },
    presupuestoVisualMs: VISUAL_BUDGET_MS,
    presupuestoVisualCumplido: false,
  };

  try {
    result.memoria.usedJSHeapSizeAntes = heapUsed();

    // --- 1. Camino directo (solo benchmark; el editor NO usa esta ruta) ---
    const direct = new ManifoldKernel();
    await direct.ready;
    const directStart = performance.now();
    const directMeasurement = await measureRaf(async () => {
      result.directo.triangulos = heavyOperationDirect(direct);
    });
    result.directo = {
      ...directMeasurement,
      totalMs: round(performance.now() - directStart),
      triangulos: result.directo.triangulos,
    };
    direct.disposeAll();

    // --- 2. Camino worker (ruta del editor) ---
    const initStart = performance.now();
    const worker = new WorkerGeometryKernel({
      createPort: () =>
        new Worker(new URL('./kernel-worker-entry.ts', import.meta.url), {
          type: 'module',
        }) as unknown as WorkerPort,
    });
    await worker.ready;
    result.initWorkerMs = round(performance.now() - initStart);

    const workerStart = performance.now();
    let triangles = 0;
    const workerMeasurement = await measureRaf(async () => {
      const dense = await heavyOperationWorker(worker);
      triangles = dense.triangulos;
      result.worker.pasosMs = stats(dense.pasos);
    });
    result.worker = {
      ...workerMeasurement,
      totalMs: round(performance.now() - workerStart),
      triangulos: triangles,
      pasosMs: result.worker.pasosMs,
    };

    // --- 3. Latencia de operación típica (20 muestras) ---
    const latencies: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      latencies.push(await typicalViaWorker(worker));
    }
    result.latenciaTipicaMs = { ...stats(latencies), muestras: latencies.length };

    // --- 4. Solicitudes concurrentes ---
    const concurrentStart = performance.now();
    const handles = await Promise.all(
      Array.from({ length: 10 }, (_, index) => worker.box([10 + index, 20 + index, 30 + index])),
    );
    const measures: Array<MeasureResult | null> = await Promise.all(
      handles.map((handle) => worker.measure(handle)),
    );
    result.concurrentes = {
      solicitudes: handles.length,
      wallMs: round(performance.now() - concurrentStart),
      medidasOk: measures.every(
        (measure, index) =>
          measure !== null &&
          measure.boundsMm.max[0] === 10 + index &&
          measure.volumeMm3 === (10 + index) * (20 + index) * (30 + index),
      ),
    };
    await worker.disposeAll();

    // --- 5. Reinicio: el downtime efectivo de una operación en cola ---
    worker.terminateAndRestart();
    const restartStart = performance.now();
    const postRestart = await worker.box([5, 5, 5]);
    const postMeasure = await worker.measure(postRestart);
    result.reinicio = {
      downtimeMs: round(performance.now() - restartStart),
      operacionPostReinicioOk: postMeasure.volumeMm3 === 125,
    };
    worker.terminate();

    result.memoria.usedJSHeapSizeDespues = heapUsed();
    result.presupuestoVisualCumplido = result.worker.gapRafMaxMs < VISUAL_BUDGET_MS;
    result.ok = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }

  return result;
}

run().then((result) => {
  window.__FURNICONFIG_WORKER_RESULT__ = result;
  const output = document.getElementById('output');
  if (output) output.textContent = JSON.stringify(result, null, 2);
});
