/**
 * FASE-4B-0 — V5 (limpieza): sonda de memoria del kernel.
 *
 * Comprueba empíricamente:
 *  1. Si el objeto `Mesh` devuelto por `getMesh()` expone `delete()` y si sus
 *     buffers son copias JS (GC) o vistas sobre la memoria WASM.
 *  2. Si repetir `getMesh()` hace crecer la memoria del proceso (fuga).
 *  3. El RSS tras `disposeAll()` en un kernel con muchos sólidos vivos.
 *
 * Se auto-relanza con `--expose-gc` para poder forzar recolección.
 * Uso: node experiments/memory-probe.mjs [nº de iteraciones]
 */
if (typeof globalThis.gc !== 'function') {
  const { spawnSync } = await import('node:child_process');
  const fileURLToPath = (await import('node:url')).fileURLToPath;
  const self = fileURLToPath(import.meta.url);
  const result = spawnSync(process.execPath, ['--expose-gc', self, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

const Module = (await import('manifold-3d')).default;
const toplevel = await Module();
toplevel.setup();
const { Manifold } = toplevel;

const N = Number(process.argv[2] ?? 20_000);
const mb = (bytes) => +(bytes / 1024 / 1024).toFixed(2);

const box = Manifold.cube([800, 600, 18]);
const mesh = box.getMesh();

const probe = {
  meshTieneDelete: typeof mesh.delete === 'function',
  propsMesh: Object.getOwnPropertyNames(Object.getPrototypeOf(mesh)).join(', '),
  heapExpuesto: 'HEAPF32' in toplevel,
  vertPropertiesEsVistaDeHeap:
    'HEAPF32' in toplevel ? mesh.vertProperties.buffer === toplevel.HEAPF32.buffer : false,
  iteraciones: N,
};

globalThis.gc();
const rssBase = process.memoryUsage().rss;

// Bucle 1: N extracciones de malla
for (let i = 0; i < N; i += 1) {
  const m = box.getMesh();
  // se consumen los buffers para que no haya "dead code elimination"
  if (m.numVert < 0) throw new Error('inalcanzable');
}
globalThis.gc();
const rssTrasBucle1 = process.memoryUsage().rss - rssBase;
probe.rssTrasBucle1 = mb(rssTrasBucle1);

// Bucle 2 (idéntico): si hubiera fuga por llamada, crecería de nuevo
for (let i = 0; i < N; i += 1) {
  const m = box.getMesh();
  if (m.numVert < 0) throw new Error('inalcanzable');
}
globalThis.gc();
const rssTrasBucle2 = process.memoryUsage().rss - rssBase;
probe.rssTrasBucle2 = mb(rssTrasBucle2);
probe.crecimientoSegundoBucle = mb(rssTrasBucle2 - rssTrasBucle1);
probe.estableSinFuga = rssTrasBucle2 - rssTrasBucle1 < 1024 * 1024; // < 1 MB por20k llamadas

// muchos sólidos vivos + disposeAll
const refs = [];
for (let i = 0; i < 500; i += 1) {
  const base = Manifold.cube([10 + i, 10, 10]);
  const moved = base.translate([i, 0, 0]);
  base.delete(); // el sólido intermedio no debe colgar en la sonda
  refs.push(moved);
}
globalThis.gc();
const rssConVivos = process.memoryUsage().rss - rssBase;
for (const solid of refs) solid.delete();
globalThis.gc();
probe.rssSólidos500 = mb(rssConVivos);
probe.rssTrasDisposeAll = mb(process.memoryUsage().rss - rssBase);

box.delete();

const { mkdirSync, writeFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const here = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(here, 'results'), { recursive: true });
const outFile = join(here, 'results', '4b0-memory-probe.json');
writeFileSync(outFile, `${JSON.stringify({ ...probe, node: process.version, at: new Date().toISOString() }, null, 2)}\n`);
console.log(JSON.stringify({ ...probe, written: outFile }, null, 2));
