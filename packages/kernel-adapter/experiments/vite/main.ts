import { ManifoldKernel, type MeasureResult } from '../../src/index.js';

/**
 * FASE-4B-0 — EXPERIMENTO V1/V4/V5 (navegador).
 *
 * Comprueba: inicialización del WASM bajo Vite, operaciones geométricas,
 * tiempos en navegador y ausencia de requisitos de hosting especiales
 * (sin cabeceras COOP/COEP). Resultado expuesto en
 * `window.__FURNICONFIG_KERNEL_RESULT__` para ser leído por Playwright.
 *
 * Incluye además la medición de **bloqueo del hilo principal** (sección 3
 * del cierre): gap de `requestAnimationFrame` y retraso de un temporizador
 * 0 ms durante operaciones densas. El equivalente en Node está en
 * `experiments/blocking-probe.mjs`.
 */

/** Umbral de "tarea larga" de las guías de rendimiento de la web. */
const LONG_TASK_MS = 50;

export interface BlockingOpResult {
  segmentos: number;
  triangulos: number;
  validacionExtrusionMs: number;
  booleanaForzadaMs: number;
  perOpMs: number[];
  booleanasEncadenadas: number;
  bloqueaHiloPrincipal: boolean;
}

export interface BlockingResult {
  umbralTareaLargaMs: number;
  gapRafMaxMs: number;
  gapRafMedioMs: number;
  temporizadorRetrasoMs: number;
  framesObservados: number;
  operaciones: BlockingOpResult[];
  bloqueaHiloPrincipal: boolean;
  estrategiaWorker: string;
}

/** Estrategia documentada (no implementada) para no bloquear el editor. */
const ESTRATEGIA_WORKER =
  'Delegar la geometría en un Web Worker con el WASM ya cargado (una única ' +
  'instantánea por worker, cacheada). La interfaz GeometryKernel se expone en el ' +
  'hilo principal como proxy que envía mensajes y recibe mallas como ArrayBuffer ' +
  'transferible. El editor no integra todavía el worker: solo se documenta.';

export interface KernelRunResult {
  ok: boolean;
  errors: string[];
  initMs: number;
  timings: { boxMs: number; extrudeMs: number; differenceMs: number };
  measures: { box: MeasureResult | null; extruded: MeasureResult | null; holed: MeasureResult | null };
  mesh: { boxTris: number; holedTris: number; holedPositions: number };
  blocking: BlockingResult | null;
  env: {
    userAgent: string;
    crossOriginIsolated: boolean;
    webAssembly: boolean;
    hardwareConcurrency: number | null;
  };
}

declare global {
  interface Window {
    __FURNICONFIG_KERNEL_RESULT__?: KernelRunResult;
  }
}

function now(): number {
  return performance.now();
}

/**
 * Polígono "peine" enteramente en **mm enteros** (sin redondeo, I8): una base
 * de 20 mm de alto con `teeth` dientes de 50 × 80 mm apoyados sobre ella
 * (separados 20 mm). Se usa para componer una geometría densa sin salir de
 * la cuantización de parámetros.
 *
 * El perfil se recorre en sentido antihorario desde el extremo inferior
 * izquierdo, y los dientes se emiten de derecha a izquierda para que las
 * aristas no se crucen (un diente que arrancara desde y=0 atravesaría el
 * canto de la base y el validador lo rechazaría con razón).
 */
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
  return points; // el cierre implícito [0,20] → [0,0] es el canto izquierdo
}

/**
 * Operación densa síncrona para medir bloqueo del hilo principal (sección 3).
 * Incluye la validación del croquis (O(n²)) y una cadena de booleanas con
 * evaluación forzada — `subtract` es perezoso, sin `toMesh`/`measure` el coste
 * real quedaría oculto.
 */
function heavyOperation(kernel: ManifoldKernel): BlockingOpResult {
  const teeth = 500;
  const points = combPolygon(teeth);

  const t0 = now();
  const comb = kernel.fromSketch(points, 400);
  const t1 = now();

  const box = kernel.box([30, 30, 600]);
  let current = comb;
  const iterations = 40;
  const perOpMs: number[] = [];
  for (let k = 0; k < iterations; k += 1) {
    const cutter = kernel.translate(box, [k * 70, -5, 0]);
    const started = now();
    const next = kernel.difference(current, cutter);
    const mesh = kernel.toMesh(next); // fuerza la evaluación
    perOpMs.push(now() - started);
    current = next;
  }
  const t2 = now();

  const triangles = kernel.toMesh(current).indices.length / 3;
  const totalMs = t2 - t0;
  return {
    segmentos: teeth,
    triangulos: triangles,
    validacionExtrusionMs: t1 - t0,
    booleanaForzadaMs: t2 - t1,
    perOpMs,
    booleanasEncadenadas: iterations,
    bloqueaHiloPrincipal: totalMs > LONG_TASK_MS,
  };
}

/**
 * Ejecuta `workload` en el hilo principal midiendo el **gap real** de
 * `requestAnimationFrame` (cuánto se congela el bucle de render) y el retraso
 * de un temporizador de 0 ms programado antes de la operación.
 */
async function measureBlocking(kernel: ManifoldKernel): Promise<BlockingResult> {
  const frameTimestamps: number[] = [];
  let rafId = 0;
  let tickerOn = true;
  const ticker = (timestamp: number): void => {
    frameTimestamps.push(timestamp);
    if (tickerOn) rafId = requestAnimationFrame(ticker);
  };
  rafId = requestAnimationFrame(ticker);

  // temporizador 0 ms: solo podrá dispararse cuando el hilo quede libre
  let timerFiredAt = 0;
  const timerStartedAt = now();
  setTimeout(() => {
    timerFiredAt = now();
  }, 0);

  const op = heavyOperation(kernel);

  const temporizadorRetrasoMs = timerFiredAt === 0 ? now() - timerStartedAt : timerFiredAt - timerStartedAt;

  // deja que el bucle se desperece y coge unos frames más para el gap
  await new Promise((resolve) => setTimeout(resolve, 50));
  tickerOn = false;
  cancelAnimationFrame(rafId);

  const gaps: number[] = [];
  for (let i = 1; i < frameTimestamps.length; i += 1) {
    const prev = frameTimestamps[i - 1] ?? 0;
    const curr = frameTimestamps[i] ?? 0;
    gaps.push(curr - prev);
  }
  const gapRafMaxMs = gaps.length > 0 ? Math.max(...gaps) : 0;
  const gapRafMedioMs = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;

  return {
    umbralTareaLargaMs: LONG_TASK_MS,
    gapRafMaxMs: +gapRafMaxMs.toFixed(2),
    gapRafMedioMs: +gapRafMedioMs.toFixed(2),
    temporizadorRetrasoMs: +temporizadorRetrasoMs.toFixed(2),
    framesObservados: frameTimestamps.length,
    operaciones: [op],
    bloqueaHiloPrincipal: gapRafMaxMs > LONG_TASK_MS,
    estrategiaWorker: ESTRATEGIA_WORKER,
  };
}

async function run(): Promise<KernelRunResult> {
  const result: KernelRunResult = {
    ok: false,
    errors: [],
    initMs: 0,
    timings: { boxMs: 0, extrudeMs: 0, differenceMs: 0 },
    measures: { box: null, extruded: null, holed: null },
    mesh: { boxTris: 0, holedTris: 0, holedPositions: 0 },
    blocking: null,
    env: {
      userAgent: navigator.userAgent,
      crossOriginIsolated: typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false,
      webAssembly: typeof WebAssembly !== 'undefined',
      hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    },
  };

  try {
    const kernel = new ManifoldKernel();
    await kernel.ready;
    result.initMs = kernel.initMs ?? 0;

    const t0 = now();
    const box = kernel.box([800, 600, 18]);
    const t1 = now();
    const plate = kernel.fromSketch(
      [
        [0, 0],
        [1200, 0],
        [1200, 600],
        [0, 600],
      ],
      18,
    );
    const t2 = now();
    const hole = kernel.box([200, 200, 100]);
    const holed = kernel.difference(plate, hole);
    const t3 = now();

    result.timings = {
      boxMs: t1 - t0,
      extrudeMs: t2 - t1,
      differenceMs: t3 - t2,
    };

    result.measures = {
      box: kernel.measure(box),
      extruded: kernel.measure(plate),
      holed: kernel.measure(holed),
    };

    const boxMesh = kernel.toMesh(box);
    const holedMesh = kernel.toMesh(holed);
    result.mesh = {
      boxTris: boxMesh.indices.length / 3,
      holedTris: holedMesh.indices.length / 3,
      holedPositions: holedMesh.positions.length / 3,
    };

    // sección 3: bloqueo del hilo principal con operación densa
    result.blocking = await measureBlocking(kernel);

    kernel.disposeAll();
    result.ok = true;
  } catch (error) {
    result.errors.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  }

  return result;
}

run().then((result) => {
  window.__FURNICONFIG_KERNEL_RESULT__ = result;
  const output = document.getElementById('output');
  if (output) {
    output.textContent = JSON.stringify(result, null, 2);
  }
});
