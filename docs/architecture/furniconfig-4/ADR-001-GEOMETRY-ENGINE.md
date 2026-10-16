# ADR-001 — Motor de geometría para el modelador 3D libre (FurniConfig 4.0)

- **Estado**: **Aprobada (decisión de dirección)** — **etapa 0 del PoC
  EJECUTADA (15/10/2026)**; Manifold promovido a **motor del PoC** con
  **GO condicionado** (ver "Actualización tras la etapa 0" más abajo)
- **Fecha**: 15 de octubre de 2026
- **Contexto**: Fase 4A — investigación y arquitectura; sin implementación
- **Serie**: nueva (`FC-4/ADR-001`); no confundir con el ADR-001
  ("Monorepo con npm workspaces") de `docs/architecture.md`

> **Nota de historial (15/10/2026)**: el texto de Fase 4A se conserva
> íntegro a continuación. La ejecución de la etapa 0 (FASE-4B-0) se registra
> en la sección "Actualización tras la etapa 0", sin borrar la redacción
> original, para mantener la trazabilidad de la decisión.

### Alcance de la aprobación (importante)

| Elemento | Estado |
|----------|--------|
| Arquitectura **híbrida (D)** con `GeometryKernel` tras interfaz propia | ✅ **Aprobada** |
| **Manifold** (`manifold-3d`) | ✅ **Aprobado como candidato principal para el PoC** — **NO es el motor definitivo** |
| `three-bvh-csg` | ✅ Aprobado como alternativa a evaluar (plan B) |
| Selección y modificación **por objeto** durante el MVP | ✅ Aprobado |
| Edición directa de **vértices, aristas y caras** | ❌ Fuera del MVP; **capacidad futura** |
| Conservar `WardrobeConfig` v1 y los diseños existentes | ✅ Aprobado |

El motor definitivo se decide **solo después** de ejecutar la etapa 0 del
`POC_PLAN.md` (V1–V5) con resultados reales registrados. Hasta entonces,
"Manifold" significa *candidato a evaluar*, no *decisión cerrada*.

---

## Actualización tras la etapa 0 (FASE-4B-0, 15/10/2026)

La etapa 0 se ejecutó con **`manifold-3d@3.5.4`** (Apache-2.0), instalado de
forma **aislada** en `packages/kernel-adapter`. Resultado: **GO condicionado**
para promover Manifold de *candidato* a **motor del PoC** (no de producción).

### Versiones y evidencias

| Elemento | Valor medido | Origen |
|----------|-------------|--------|
| Versión del kernel | `manifold-3d@3.5.4` (fijada, `--save-exact`) | `packages/kernel-adapter/package.json` |
| V1 — carga bajo Vite | init 23,5 ms (build) / 27,0 ms (dev); **0 errores de consola**; sin COOP/COEP | `4b0-results.json` |
| V2 — operaciones | box/extrude/union/intersect/difference: volúmenes exactos, mallas cerradas (0 aristas abiertas) | `4b0-results.json` |
| V3 — precisión | **error absoluto 0 mm³**; bounds en rejilla mm entero | `4b0-results.json` |
| V4 — rendimiento | init Node mediana 14,1 ms (n=5); ops mediana de 20: box 0,074 / extrusión 0,186 / booleana 0,478 ms (Node); navegador 4,2–7,7 ms. Todas muy por debajo del objetivo PoC (< 100 ms) | `4b0-results.json` |
| V5 — memoria | determinismo byte a byte; 20 000 `getMesh` → crecimiento **0 MB**; `disposeAll → liveCount 0` | `4b0-results.json` |
| Tamaño | `manifold.wasm` 541 470 B (gzip 205 699 / brotli 158 724) | `4b0-results.json` |
| Robustez | 31 tests nuevos: rotaciones no rectas, escalos fraccionarios, cóncavos, bowties rechazados, caras coplanares exactas, extremos 0,001–1e15 mm³ | `tests/robustness.test.ts` |

### Las 5 condiciones del GO condicionado

1. **Registrar el hallazgo LGPL transitivo** (`sharp` → `libvips`) en
   `THIRD_PARTY_NOTICES.md` y definir política de empaquetado antes de
   escritorio/CLI. → **Hecho** (`THIRD_PARTY_NOTICES.md` §3–4; RISKS R-16).
2. **Ampliar V3** con rotaciones/escalos fraccionarios y cóncavos (si fallaba
   → plan B `three-bvh-csg`). → **Hecho**: pasaron todos; el plan B no se
   activa.
3. **Validar operaciones largas en _worker_** → **implementada como
   infraestructura (4B-C)**: `kernel-adapter/src/worker/` (protocolo tipado,
   proxy `WorkerGeometryKernel`, watchdog con reinicio controlado, transfer
   zero-copy) y medida en Chromium real — gap rAF 1 699,9 ms (hilo principal)
   → **16,8 ms** (worker) con salida idéntica. **Pendiente**: integración en
   el editor (Fase 4B-D).
4. **Corregir `ENGINE_COMPARISON.md` C11** ("0 dependencias declaradas" es
   incorrecto: declara 11 directas) y volcar mediciones a docs. → **Hecho**.
5. **`THIRD_PARTY_NOTICES.md` debe ir en el PR** que introduzca la
   dependencia. → **Cumplido** en este PR.

### Qué NO decide esta actualización

- **No** se declara Manifold motor definitivo de producción: es motor del
  **PoC**, sujeto a revisión al cierre de la Fase 4B completa.
- **No** se integra Manifold en el visor de clósets actual.
- **No** se implementa el Web Worker (solo se documenta la estrategia).
  *(Actualizado 4B-C: la infraestructura del worker está implementada y medida
  en `kernel-adapter`; sigue **sin integrarse** en el editor — Fase 4B-D.)*
- **No** se abre la Fase 4B completa ni la 3F.3.

---

## Contexto

FurniConfig quiere evolucionar de configurador paramétrico de clósets a
**modelador 3D general** (capacidades fundamentales tipo SketchUp) con
diferenciador de *modelado libre + componentes inteligentes + reglas
paramétricas*.

Restricciones del proyecto:

1. Repositorio **MIT** (desde `c48f1e9`); cualquier dependencia nueva debe
   ser compatible.
2. `packages/geometry-core` es **puro y no extensible para este fin**: no
   trabaja con vértices/caras, ni extrusión, ni booleanas
   (`CURRENT_ARCHITECTURE.md` §2.3).
3. Three.js es el renderer (R3F 9 + three 0.186.1) pero **no es un kernel**.
4. Reglas de `AGENTS.md`: sin dependencias nuevas sin justificación; unidad
   interna mm enteros; motor puro; no inventar reglas de fabricación.

Pregunta: **¿con qué motor geométrico se construye el modelador, y de qué
forma, para no atarse a una solución irreversible?**

## Alternativas consideradas

### A. Three.js `BufferGeometry` sin kernel externo

- ✅ Cero dependencias, cero descarga, licencia MIT, ya instalado.
- ❌ Sin topología de sólido: hay que construir half-edge, recorte de
  polígonos, triangulación y robustez numérica desde cero (confirmado por
  la comunidad three.js: "three.js does not provide part").
- ❌ Sin booleanas; `ExtrudeGeometry` no garantiza sólidos cerrados.
- **Complejidad de implementación: muy alta. Riesgo numérico: alto.**

### B. OpenCascade.js (kernel B-rep completo, LGPL-2.1)

- ✅ CAD industrial: caras exactas, fillet, booleanas robustas, historial.
- ❌ Licencia **LGPL-2.1** → obligaciones de licenciamiento en un repo MIT.
- ❌ Peso: 48,9 MB WASM sin comprimir / ~9,1 MB brotli (build completo);
  builds personalizados de ~2,4 MB comprimidos pero con pipeline propio.
- ❌ Mantenimiento upstream parado (último commit de `master`: 15/08/2023);
  existe un fork activo, con lo que quedaríamos dependientes de él.
- ❌ El modo multihilo exige cabeceras COOP/COEP (rompe iframes).
- **Complejidad: alta. Requiere decisión de licenciamiento explícita.**

### C1. Manifold (`manifold-3d`, Apache-2.0)

- ✅ Booleanas con **garantía declarada** de salida 2-manifold.
- ✅ `Extrude` y `Revolve` nativos; primitivas; consultas de volumen/bounds.
- ✅ Ligero: `manifold.wasm` ≈ **528,78 KB** + `manifold.js` 80,44 KB.
- ✅ WASM **monohilo** (sin TBB) → sin COOP/COEP.
- ✅ Mantenido: 3.5.x con publicaciones en 2026, ~52 k descargas/semana,
  usado por otros modeladores web (BREP.io).
- ✅ Licencia **Apache-2.0**: compatible con distribución en repo MIT
  conservando atribución/NOTICE.
- ❌ No incluye editor de topología ni snapping: la edición se expresa como
  operaciones (arquitectura por comandos, ya propuesta).
- ❌ Dependencia nueva con WASM: integración con Vite 8 **sin probar**
  (hipótesis).

### C2. `three-bvh-csg` (CSG puro JS, MIT)

- ✅ MIT, sin WASM, integración trivial con three.js, ~160 KB.
- ❌ Se autodeclara **experimental** y advierte resultados que "may not be
  correctly completely two-manifold" por precisión numérica.
- ❌ No trae extrusión de croquis; versión 0.0.x.
- **Útil como plan B**, no como primera elección.

### D. Arquitectura híbrida con kernel tras interfaz propia

- ✅ Three.js queda como renderer puro (ya lo es).
- ✅ La interfaz `GeometryKernel` pequeña permite **sustituir** el motor sin
  tocar UI ni documento (reversibilidad).
- ✅ Permite empezar el MVP con el kernel más equilibrado y migrar después.
- ❌ Coste añadido: una capa de adaptación y conversión de tipos.

## Criterios de decisión

| # | Criterio | Peso |
|---|----------|------|
| K1 | Compatibilidad de licencia con MIT | bloqueante |
| K2 | Robustez numérica / garantías de cierre | alto |
| K3 | Peso y carga diferida | alto |
| K4 | Mantenimiento activo del proyecto | alto |
| K5 | Extrusión + booleanas | alto |
| K6 | Compatibilidad con Vite 8 / toolchain actual | medio |
| K7 | Rendimiento en navegador | medio |
| K8 | Edición vértice/arista/cara (hoy y futuro) | medio (MVP bajo) |
| K9 | Reversibilidad / coste de cambio posterior | alto |
| K10 | Complejidad de integración | medio |

## Evaluación

| Criterio | A Buffer | B OCCT.js | C1 Manifold | C2 bvh-csg | D Híbrida |
|----------|----------|-----------|-------------|------------|-----------|
| K1 Licencia MIT | ✅ MIT | ❌ LGPL-2.1 | ✅ Apache-2.0 | ✅ MIT | ✅ según kernel |
| K2 Robustez | ❌ | ✅ | ✅ (garantía) | ⚠️ experimental | ✅ (C1) |
| K3 Peso | ✅ 0 | ❌ 2,4–9,1 MB | ✅ ~0,6 MB | ✅ ~1,3 MB | ✅ |
| K4 Mantenimiento | ✅ | ⚠️ upstream parado | ✅ activo | ⚠️ 0.0.x | ✅ |
| K5 Extrusión+booleanas | ❌ | ✅ | ✅ | ⚠️/❌ | ✅ |
| K6 Vite | ✅ | ⚠️ a probar | ⚠️ a probar (PoC) | ✅ | ⚠️ PoC |
| K7 Rendimiento | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| K8 Edición v/a/c | ❌ (todo propio) | ✅ | ⚠️ por operaciones | ❌ | ⚠️ diferible |
| K9 Reversibilidad | ✅ | ❌ | ⚠️ media | ✅ | ✅ **alta** |
| K10 Integración | 🔴 | 🟠 | 🟡 | 🟢 | 🟡 |

## Decisión

> **Se adopta la opción D (arquitectura híbrida con `GeometryKernel` tras
> interfaz propia), con Manifold (`manifold-3d`, Apache-2.0) como candidato
> principal para el PoC y `three-bvh-csg` (MIT) como alternativa de
> evaluación (plan B). `geometry-core` se mantiene intacto como capa
> paramétrica de muebles.**
>
> **Manifold no es el motor definitivo**: es el candidato aprobado para
> evaluar. La elección definitiva exige los resultados de la etapa 0 del
> `POC_PLAN.md` y una confirmación explícita tras revisarlos.

Condiciones de la decisión:

1. **Candidato, no motor definitivo**: Manifold se evalúa primero (etapa 0,
   V1–V5 del `POC_PLAN.md`). Hasta que esos resultados reales se registren y
   se revisen, no se declara motor oficial. Hasta entonces es una
   recomendación fundamentada, no un resultado probado.
2. **Sin instalación en Fase 4A**: esta fase no añade dependencias. El
   `npm install manifold-3d` requiere autorización expresa y revisión de
   licencia (regla 5 de `AGENTS.md`, RISKS R-12). **Manifold aún no está
   instalado.**
3. **Carga diferida**: el WASM solo se carga al entrar al modelador; el
   configurador actual no paga su coste (RISKS R-03).
4. **Alternativa de evaluación explícita**: si V1/V2/V3 fallan, se evalúa
   `three-bvh-csg` aceptando una primera versión sin booleanas garantizadas,
   o se difiere el modelador hasta una solución válida. **No se elige
   OpenCascade.js** sin una decisión de licencia y de tamaño explícita del
   propietario.

## Obligaciones de licencia Apache-2.0 (si se llega a instalar Manifold)

> **Estado (15/10/2026)**: `manifold-3d@3.5.4` **ya está instalado** (aislado
> en `packages/kernel-adapter`, FASE-4B-0). El `THIRD_PARTY_NOTICES.md`
> exigido más abajo **se creó en el mismo PR** que introduce la dependencia,
> conforme a la condición "Responsable". Se confirma además que el paquete
> **no** incluye un `NOTICE` upstream (solo `LICENSE`), por lo que la
> atribución se consigna en nuestro `THIRD_PARTY_NOTICES.md`. Se añade el
> hallazgo de **copyleft transitivo (LGPL)** no alcanzable desde el bundle web
> (ver `THIRD_PARTY_NOTICES.md` §3 y RISKS R-16).

Manifold se distribuye bajo **Apache License 2.0**. Es compatible con la
distribución de FurniConfig bajo MIT, **con condiciones**. Si en una fase
futura se instala `manifold-3d`, deberán cumplirse estas obligaciones:

| # | Obligación | Aplicación en FurniConfig |
|---|------------|---------------------------|
| A1 | **Conservar el texto íntegro de la licencia Apache-2.0** del componente | Incluir `LICENSE` (Apache-2.0) o referencia íntegra junto al código/binario distribuido de Manifold |
| A2 | **Conservar los avisos de copyright y de licencia** del material original | No eliminar cabeceras de copyright al copiar/adaptar código |
| A3 | **Indicar si se modificó el código** | Si se parchea `manifold-3d` o su build, declararlo en un archivo de atribución |
| A4 | **Atribución en la distribución (NOTICE)** | Si el paquete incluye un archivo `NOTICE`, reproducir sus atribuciones en la atribución del producto (p. ej. `THIRD_PARTY_NOTICES.md` o sección del README) |
| A5 | **No usar marcas comerciales** de Apache ni de los autores | Sin uso de marcas en branding |
| A6 | El código Apache **no hereda copyleft** a nuestro código | Nuestro código sigue siendo MIT; la obligación es de **atribución**, no de relicenciar FurniConfig |
| A7 | La responsabilidad sobre el componente recae en su licenciantes | Declarar dependencias de terceros en documentación de créditos |

**Responsable**: crear `THIRD_PARTY_NOTICES.md` (o sección equivalente en el
README) **en el mismo PR que instale la dependencia** — no antes, para no
declarar obligaciones sobre algo aún no presente.

**Comparativa de licencias ya evaluada**: LGPL-2.1 (OpenCascade.js) exigiría
obligaciones sobre el binario WASM mismo (no solo atribución), incompatible
con la simplicidad buscada; por eso quedó descartada
(`ENGINE_COMPARISON.md` C13, `RESEARCH.md` §5).

## Consecuencias

**Positivas**

- El modelador arranca con un kernel robusto, ligero y mantenido.
- `geometry-core`, `WardrobeConfig` v1 y las pruebas + 200 visuales quedan
  intactos (`MIGRATION_STRATEGY.md`). En Fase 4A eran 522 pruebas; tras la
  FASE-4B-0 son **565** (179 `geometry-core` + 43 `kernel-adapter` + 343 web),
  más las **200 visuales** que siguen en verde — el crecimiento es solo
  aditivo (paquete nuevo), sin tocar el motor existente.
- La reversibilidad reduce el riesgo de dependencia (RISKS R-01).

**Negativas / costes**

- Dependencia nueva con WASM: proceso de init async y medida de peso
  pendientes (RISKS R-02/R-03).
- Apache-2.0 exige conservar NOTICE/atribución en la distribución.
- La edición de caras/aristas/vértices **queda fuera del MVP** (RISKS R-05);
  se declara como **capacidad futura** de una fase posterior y se comunicará
  como alcance. El MVP selecciona y modifica **por objeto**.
- Una capa de adaptación más que probar.

**Neutrales**

- Dos historiales (configurador y modelador) conviven (RISKS R-06).

## Revisión

Reevaluar este ADR cuando:

1. La etapa 0 del `POC_PLAN.md` tenga resultados registrados → decidir si
   Manifold pasa de **candidato a motor definitivo** (o si se activa la
   alternativa `three-bvh-csg`).
   > **Disparado (15/10/2026)**: la etapa 0 se ejecutó (FASE-4B-0) con
   > resultado **GO condicionado** → Manifold es ahora **motor del PoC**. La
   > decisión de *motor definitivo de producción* se diffiere al cierre de la
   > Fase 4B completa, cuando se integre en el editor con Web Worker.
2. Se alcance el Paso 10 (componentes paramétricos) del MVP.
3. Aparezca una necesidad de edición de subelementos (caras/vértices) —
   **capacidad futura** — no cubierta por la capa de comandos (disparador
   R-05).

## Fuentes

Ver `RESEARCH.md` §7 (consultas del 15/10/2026) y
`ENGINE_COMPARISON.md` para el análisis completo.
