# @furniconfig/kernel-adapter — EXPERIMENTAL (FASE-4B-0)

Adaptador mínimo `GeometryKernel` sobre [`manifold-3d`](https://github.com/elalish/manifold)
para la **prueba de viabilidad** del kernel geométrico del futuro modelador 3D
libre.

> **No aprobado como dependencia de producción.** `manifold-3d` es un
> **candidato** (no el motor definitivo): la elección se toma con los resultados
> de esta etapa, según `docs/architecture/furniconfig-4/ADR-001-GEOMETRY-ENGINE.md`.
> **No está integrado en el visor principal de clósets** (`apps/web` no lo
> importa en ningún punto).
>
> **Resultado de la etapa 0 (15/10/2026)**: **GO condicionado** — Manifold pasa
> a *motor del PoC*, con las 5 condiciones registradas en
> `docs/architecture/furniconfig-4/ADR-001-GEOMETRY-ENGINE.md` §"Actualización
> tras la etapa 0".

## Aislamiento

- `manifold-3d` está declarado **solo** en este workspace, con versión exacta:
  **`3.5.4`** (Apache-2.0).
- `packages/geometry-core` y `WardrobeConfig` v1 **no se han tocado**.
- Atribución y dependencias transitivas: [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

## Interfaz

`src/kernel.ts` define el contrato `GeometryKernel` (tipos puros, sin
dependencias). `src/manifold-kernel.ts` es la implementación sobre WASM con
**carga diferida** (`ready`). El modelador siempre hablará con la interfaz,
nunca con Manifold directamente.

Tres deltas documentados frente al boceto de `PROPOSED_ARCHITECTURE.md` §3.2:

1. `box`/`fromSketch` devuelven un `KernelRef` (manejador) en lugar de
   `MeshData`, para poder encadenar booleanas; la malla se extrae con `toMesh`.
2. `MeshData` se expresa en **milímetros** (regla 1 de `AGENTS.md`); la
   conversión mm → m queda reservada a `apps/web/src/lib/units.ts` (regla 10).
3. Se añaden `rotateZ` y `scale` (el modelador necesita rotar y escalar
   objetos). Sus parámetros **no** son mm: ángulos en grados y factores
   adimensionales, ambos validados como finitos (> 0 para la escala) pero **no**
   cuantizados a enteros. `fromSketch` valida el polígono **antes** de llamar al
   kernel (regla 3): rechaza auto-intersecciones y áreas nulas con
   `KernelError('invalid-input')` — ver `src/polygon.ts`.

### Nota sobre la validación O(n²)

`assertSimplePolygon` compara cada par de aristas (coste cuadrático). Incluye
un **prefiltrado por caja envolvente (AABB)** que, en polígonos dispersos
(p. ej. un peine de cientos de dientes), descarta casi todos los pares y deja
el coste prácticamente en O(n). Con ~2 000 vértices la validación total
(extrusión incluida) midió ~127 ms; si el modelador acepta croquis muy densos
habrá que pasar a un sweep-line O(n log n) (RISKS R-18).

## Experimentos (V1–V5 + robustez + bloqueo)

```bash
# Pruebas automatizadas del kernel (V2, V3, V4 Node, V5, robustez) —43 tests
npm test --workspace @furniconfig/kernel-adapter

# Experimentos completos: init WASM en N procesos + sonda de bloqueo Node +
# build Vite + Chromium real + dev server real
npm run experiment --workspace @furniconfig/kernel-adapter

# Solo el experimento de navegador (usa el build existente)
node experiments/vite-check.mjs --skip-build

# Solo la sonda de bloqueo del hilo principal en Node
node experiments/blocking-probe.mjs
```

Salidas: `experiments/results/4b0-init-bench.json`,
`experiments/results/4b0-memory-probe.json`,
`experiments/results/4b0-blocking.json`,
`experiments/results/4b0-vite-results.json`,
`experiments/results/4b0-vite-dev-results.json` y
`experiments/results/4b0-results.json` (consolidado).

| Experimento | Dónde |
|-------------|-------|
| V1 — carga bajo Vite + inicialización WASM en navegador | `experiments/vite/` + `experiments/vite-check.mjs` |
| V2 — operaciones geométricas | `tests/manifold-kernel.test.ts` |
| V3 — precisión y cuantización | `tests/manifold-kernel.test.ts` |
| V4 — rendimiento | `tests/manifold-kernel.test.ts` + `experiments/init-bench.mjs` |
| V5 — integración, determinismo y limpieza | `tests/manifold-kernel.test.ts` + navegador + `experiments/memory-probe.mjs` |
| **Robustez** — rotaciones no rectas, escalos fraccionarios, cóncavos, polígonos inválidos, caras coplanares, dimensiones extremas, capas cuantización/cálculo/representación | `tests/robustness.test.ts` |
| **Bloqueo del hilo principal** — gap de `requestAnimationFrame` + stall de event loop | `experiments/blocking-probe.mjs` (Node) + `experiments/vite/main.ts` (navegador) |

El experimento V1 se sirve **sin cabeceras COOP/COEP** para comprobar que el
kernel no exige hosting especial (verificable en
`crossOriginIsolated` del resultado consolidado).

## Bloqueo del hilo principal y estrategia de Web Worker

El WASM de Manifold es **monohilo y síncrono**: una operación densa bloquea el
hilo principal. Medido en la etapa 0:

- **Navegador** (Chromium real, 40 booleanas encadenadas sobre ~8 500
  triángulos): el bucle de render se congela — **gap rAF máximo ≈ 883 ms** y un
  temporizador de 0 ms se retrasa ≈ 904 ms; solo se observan ~5 frames.
- **Node** (resta contra esferas densas): stall del event loop que escala con
  el tamaño — 54 ms (256 segmentos) → 872 ms (2048 segmentos).

Operaciones típicas de mueble (cajas, extrusiones simples, una booleana) están
muy por debajo del umbral de "tarea larga" (50 ms): mediana 0,074–0,478 ms en
Node y 4,2–7,7 ms en navegador. El bloqueo solo aparece con geometrías densas.

**Estrategia documentada (NO implementada en esta fase)** — para la Fase 4B:

1. Instanciar el WASM **una sola vez por worker** y cachearlo (el `init` ya es
   idempotente y mide ~14 ms en Node / ~23,5 ms en navegador).
2. Exponer `GeometryKernel` en el hilo principal como **proxy** que traduce
   cada llamada a un mensaje (`postMessage`) hacia el worker.
3. Devolver `MeshData` como **`ArrayBuffer` transferible** (zero-copy) en vez
   de copiar el array; el hilo principal solo lo envuelve en `BufferGeometry`.
4. Mantener las **operaciones pequeñas** (una caja, una extrusión simple) en el
   hilo principal para evitar el coste de mensajes; delegar solo las densas o
   las que superen un presupuesto de tiempo.
5. Como el WASM es monohilo, **no** hace falta COOP/COEP: el worker no depende
   de `SharedArrayBuffer`.

Nada de esto se integra todavía en el editor principal (RISKS R-17).

## Fuera de alcance (no hacer en esta fase)

- Integrar el kernel en el visor de clósets.
- Implementar herramientas de dibujo o `modeler-core`.
- Iniciar Fase 3F.3 o Fase 4B completa.
- **Fusionar (merge)** el PR sin autorización expresa.
- Modificar la configuración administrativa de GitHub.
