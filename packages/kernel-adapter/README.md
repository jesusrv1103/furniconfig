# @furniconfig/kernel-adapter — EXPERIMENTAL (FASE-4B-0 + 4B-C)

Adaptador mínimo `GeometryKernel` sobre [`manifold-3d`](https://github.com/elalish/manifold)
para la **prueba de viabilidad** del kernel geométrico del futuro modelador 3D
libre. Desde la **FASE-4B-C** incluye el **Kernel Worker**: la ejecución
asíncrona de Manifold en un Web Worker dedicado (`src/worker/`), que es la ruta
única para el editor.

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
>
> **Resultado de la FASE-4B-C (16/10/2026)**: la condición 3 del GO (operaciones
> largas en worker) queda **implementada como infraestructura** y **medida en
> Chromium real**: el escenario que congeló el navegador (gap rAF ≈ 1 699,9 ms
> en el hilo principal) baja a **16,8 ms** con worker, con salida geométrica
> idéntica (8 480 triángulos). El editor aún no se integra; el primer
> consumidor sin UI llegó en 4B-D (`SceneGeometryService`, en la capa de
> composición de `apps/web`), el cableado en pantalla queda para D4b/4C.

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

### Contrato asíncrono (FASE-4B-C)

Un proxy sobre un worker **no puede** respetar las firmas síncronas de
`GeometryKernel` (los resultados aún no existen al hacer la llamada). El
protocolo define `AsyncGeometryKernel` (`src/worker/protocol.ts`): el mismo
conjunto y la misma semántica de operaciones —mismos argumentos, mismos
códigos de error estables, mismas unidades en mm— con `Promise` y una opción
adicional por llamada (`cancelKey`, cancelación lógica). La interfaz síncrona
se conserva **solo** para experimentos directos de benchmarking; no es una
ruta funcional del editor.

Códigos de error (los 4 originales intactos + 2 añadidos en 4B-C, autorizados
expresamente):

- `worker-timeout` — pérdida de disponibilidad **no deliberada**: el watchdog
  no recibió señales de vida dentro del presupuesto, o el puerto del worker
  falló (crash). El proxy puede reiniciar el worker de forma controlada, pero
  **nunca reintenta** la operación fallida.
- `worker-terminated` — indisponibilidad **deliberada**: `terminate()` /
  `terminateAndRestart()`, cierre del proxy, o fin del presupuesto de
  reinicios. No vuelve solo: hay que crear un proxy nuevo o llamar a
  `terminateAndRestart()`.

Las excepciones no tipadas del worker **no se ocultan**: viajan con su mensaje
original bajo `kernel-status` (`createKernelErrorPayload`).

### Nota sobre la validación O(n²)

`assertSimplePolygon` compara cada par de aristas (coste cuadrático). Incluye
un **prefiltrado por caja envolvente (AABB)** que, en polígonos dispersos
(p. ej. un peine de cientos de dientes), descarta casi todos los pares y deja
el coste prácticamente en O(n). Con ~2 000 vértices la validación total
(extrusión incluida) midió ~127 ms; si el modelador acepta croquis muy densos
habrá que pasar a un sweep-line O(n log n) (RISKS R-18).

## Experimentos (V1–V5 + robustez + bloqueo + worker + cuantización)

```bash
# Pruebas automatizadas del kernel (V2, V3, V4 Node, V5, robustez) —43 tests
# + FASE-4B-C: protocolo, proxy con FakePort e integración real —87 tests
npm test --workspace @furniconfig/kernel-adapter

# Experimentos completos de 4B-0: init WASM en N procesos + sonda de bloqueo
# Node + build Vite + Chromium real + dev server real
npm run experiment --workspace @furniconfig/kernel-adapter

# Solo el experimento de navegador (usa el build existente)
node experiments/vite-check.mjs --skip-build

# Solo la sonda de bloqueo del hilo principal en Node
node experiments/blocking-probe.mjs

# FASE-4B-C — worker en Chromium real (build + medición; ~1 min)
node experiments/worker-check.mjs

# FASE-4B-C — sonda de las 4 alternativas de cuantización (Node, WASM real)
node experiments/quantization-probe.mjs
```

Salidas: `experiments/results/4b0-init-bench.json`,
`experiments/results/4b0-memory-probe.json`,
`experiments/results/4b0-blocking.json`,
`experiments/results/4b0-vite-results.json`,
`experiments/results/4b0-vite-dev-results.json`,
`experiments/results/4b0-results.json` (consolidado),
`experiments/results/4b1-worker-perf.json` (worker en Chromium) y
`experiments/results/4b1-quantization.json` (cuantización).

| Experimento | Dónde |
|-------------|-------|
| V1 — carga bajo Vite + inicialización WASM en navegador | `experiments/vite/` + `experiments/vite-check.mjs` |
| V2 — operaciones geométricas | `tests/manifold-kernel.test.ts` |
| V3 — precisión y cuantización | `tests/manifold-kernel.test.ts` |
| V4 — rendimiento | `tests/manifold-kernel.test.ts` + `experiments/init-bench.mjs` |
| V5 — integración, determinismo y limpieza | `tests/manifold-kernel.test.ts` + navegador + `experiments/memory-probe.mjs` |
| **Robustez** — rotaciones no rectas, escalos fraccionarios, cóncavos, polígonos inválidos, caras coplanares, dimensiones extremas, capas cuantización/cálculo/representación | `tests/robustness.test.ts` |
| **Bloqueo del hilo principal** — gap de `requestAnimationFrame` + stall de event loop | `experiments/blocking-probe.mjs` (Node) + `experiments/vite/main.ts` (navegador) |
| **Worker: bloqueo, latencia, concurrencia, reinicio** — hilo principal vs worker con la misma carga densa en Chromium real | `experiments/worker-perf/` + `experiments/worker-check.mjs` |
| **Cuantización: 4 alternativas** — mm enteros, 1/10 mm, redondeo de salidas, floats | `experiments/quantization-probe.mjs` |
| **Worker: handshake, cola, epoch, cancelación, watchdog, transfer** — determinista (`FakePort`/`FakeClock`) y real (WASM + `MessageChannel`) | `tests/protocol.test.ts`, `tests/worker-kernel.test.ts`, `tests/worker-integration.test.ts` |

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

**Estrategia implementada (FASE-4B-C)** — el punto 4 de la estrategia original
(las operaciones pequeñas se quedaban en el hilo principal) queda
**superado**: la regla de la fase es que **todas las operaciones geométricas
del editor pasan por el worker**, sin ruta alternativa en el hilo principal.
El coste de mensajes es despreciable frente al riesgo de congelación:

1. El WASM se instancia **una sola vez por worker** (`startKernelWorker`), con
   handshake `ready` (init ~195 ms con spawn en Chromium; ~14 ms Node / ~23,5 ms
   navegador ya medidos en 4B-0).
2. `WorkerGeometryKernel` (`src/worker/worker-kernel.ts`) expone
   `AsyncGeometryKernel` en el hilo principal: cada llamada es un mensaje
   tipado (`src/worker/protocol.ts`) hacia el worker, emparejado por
   `epoch + requestId`.
3. `toMesh` devuelve `MeshData` con sus `ArrayBuffer` **transferibles**
   (zero-copy): el hilo principal solo los envuelve en `BufferGeometry`.
4. Como el WASM es monohilo, **no** hace falta COOP/COEP: el worker no depende
   de `SharedArrayBuffer`.

Medido en **Chromium real** (`experiments/worker-check.mjs`, mismo escenario
denso que congeló el navegador: peine de 500 dientes + 40 booleanas, 8 480
triángulos):

| Métrica | Hilo principal (directo) | Worker |
|---|---|---|
| Gap rAF máximo | **1 699,9 ms** | **16,8 ms** |
| Gap rAF medio | 437,5 ms | 16,7 ms |
| Retraso de temporizador 0 ms | 1 505,8 ms | 0,5 ms |
| Frames observados durante la carga | 5 | 52 |
| Triángulos resultantes | 8 480 | 8 480 (idénticos) |
| Latencia típica (croquis+hueco+medida) p50/p95 | — | 0,5 / 1,2 ms |
| 10 solicitudes concurrentes | — | 0,6 ms wall, medidas exactas |
| Reinicio (`terminateAndRestart`) | — | 29,3 ms de reanudación |

**Presupuesto de respuesta visual propuesto y verificado**: gap rAF < 50 ms
(umbral de "tarea larga" de las guías de la web) durante operación densa vía
worker — **cumplido** (16,8 ms). La memoria JS heap no creció de forma
medible en el escenario.

### Kernel Worker (FASE-4B-C)

Archivos: `src/worker/protocol.ts` (protocolo puro y validadores runtime),
`src/worker/kernel-worker.ts` (lado worker), `src/worker/worker-kernel.ts`
(proxy del hilo principal). Contrato y semántica:

- **Validación runtime de mensajes**: los mensajes entrantes son datos
  externos; forma e ids se validan siempre (los tipos de TypeScript no
  cuentan, regla 3). Un mensaje malformado se ignora y se cuenta
  (`stats.invalidMessages`); un resultado emparejado pero con valor
  inesperado rechaza con `kernel-status` (no cuelga).
- **Handles locales, referencias por epoch**: las `KernelRef` que ve el
  consumidor son handles del proxy; el mapa handle → ref del worker se vacía
  en cada reinicio. Un handle de un epoch anterior produce `unknown-ref`
  estable y el consumidor sabe que debe reconstruir los sólidos desde
  `SceneDocument`. Nunca se reutilizan referencias de un epoch anterior.
- **Cancelación lógica por clave** (`cancelKey` + `cancel()`): con tres
  niveles diferenciados — (1) retira de la cola lo aún no enviado, (2) suelta
  del llamante lo que está en vuelo (`OperationCancelledError`, error de
  cancelación, no del kernel), (3) si el worker devuelve una `KernelRef` de
  una solicitud ya descartada, el proxy la **desecha con `dispose`** (sin
  fugas de sólidos). Terminar físicamente el worker queda como escape hatch
  explícito (`terminateAndRestart`), **nunca** automático por ediciones.
- **Watchdog** (valores iniciales **aprobados** como PROVISIONALES y
  configurables): 10 s en reposo con `ping` de keep-alive; presupuesto amplio
  de 60 s con operaciones en vuelo — un worker ocupado no responde pings y eso
  **no** se interpreta como muerte. Tras declarar la pérdida se reinicia el
  worker de forma controlada (máx. 3 reinicios), se rechazan las pendientes
  con `worker-timeout` y se avisa por `onRestart`; **cero reintento
  automático** de operaciones.
- **Transfer**: `toMesh` transfiere sus dos `ArrayBuffer` (verificado con
  detach real del buffer emisor en pruebas de integración). Sin umbrales de
  transferencia: no se agregan sin mediciones que los justifiquen.

Pruebas (87 en total: 43 de 4B-0 + 44 nuevas): `tests/protocol.test.ts`
(13, validadores con mensajes hostiles), `tests/worker-kernel.test.ts` (23 con
`FakePort`/`FakeClock` deterministas: handshake, cola, fuera de orden, epoch
antiguo, simultáneas, errores tipados, cancelación, terminación, watchdog en
reposo y ocupado, reinicio, handles huérfanos) y
`tests/worker-integration.test.ts` (8 con WASM real + `MessageChannel`:
medidas exactas, transfer con detach, cancelación sin fugas `liveCount`,
concurrentes, reinicio, determinismo byte a byte).

**Cuantización (§10)**: política **aprobada** junto a la publicación de 4B-C —
se mantiene la **alternativa A** (entradas en mm enteros, sin redondeos
ocultos de resultados); **B** y **D** quedan documentadas para evaluación
futura; **C** queda descartada. La medición completa está en
`experiments/results/4b1-quantization.json` y
`docs/architecture/furniconfig-4/QUANTIZATION.md`.

Nada de esto se integra todavía en el editor principal (D4b/Fase 4C).

## Fuera de alcance (no hacer en esta fase)

- Integrar el kernel en el visor de clósets.
- Implementar herramientas de dibujo o `modeler-core`.
- Implementar `geometryCache` ni persistencia en `localStorage` (quedan
  fuera de 4B-C por decisión de alcance).
- Iniciar Fase 3F.3 o Fase 4B completa.
- **Fusionar (merge)** el PR sin autorización expresa.
- Modificar la configuración administrativa de GitHub.
