# RISKS — Riesgos técnicos del modelador 3D libre (FASE-4A)

> Matriz de riesgos con probabilidad/impacto **estimados** (no medidos),
> mitigación y disparador de revisión. Actualizada: 15/10/2026.
>
> **Actualización FASE-4B-0 (15/10/2026)**: la etapa 0 del PoC se ejecutó y
> **cerró o atenuó varios de estos riesgos con mediciones reales** (columna
> "Disparador"): R-01, R-02, R-03, R-04 y R-10. Se añaden tres riesgos nuevos
> que la experimentación dejó al descubierto: **R-16** (copyleft transitivo
> LGPL), **R-17** (bloqueo del hilo principal) y **R-18** (validador de croquis
> O(n²)). Las probabilidades/impactos siguen siendo estimados salvo donde la
> celda lo indica como medido.

Leyenda: Probabilidad **B/M/A** (baja/media/alta) · Impacto **B/M/A**.

| ID | Riesgo | Prob. | Impacto | Mitigación | Disparador |
|----|--------|-------|---------|------------|------------|
| **R-01** | El kernel elegido (Manifold) no cubre las operaciones del MVP y hay que reescribir la capa de adaptador | M | A | Interfaz `GeometryKernel` pequeña y probada con stub antes de instalar nada; plan B `three-bvh-csg` (ADR-001) | Etapa 0 (V1–V4) del `POC_PLAN.md` — **✅ ejecutado (4B-0): el kernel cubre box/extrude/booleanas con salidas cerradas y deterministas; riesgo bajado a B** |
| **R-02** | `manifold-3d` (WASM) no integra limpio con Vite 8 / init async en build de producción | M | A | Prueba V1 obligatoria **antes** de escribir código de producto; si falla → plan B sin WASM | PoC etapa 0 — **✅ ejecutado (4B-0): init 23,5 ms (build) / 27,0 ms (dev) en Chromium, 0 errores de consola, sin COOP/COEP. Riesgo cerrado** |
| **R-03** | Tamaño de descarga del WASM penaliza a los usuarios del configurador actual | M | M | Carga **diferida** solo al entrar al modelador; medir en V2; objetivo hipotético < 1 MB comprimido | V2 / métricas de carga — **✅ medido (4B-0): wasm 541 470 B (gzip 205 699 / brotli 158 724); total brotli 175 146 B < objetivo. Riesgo cerrado** |
| **R-04** | Pérdida de precisión al convertir mm enteros ↔ unidades del kernel (doubles), aristas que "no cierran" | M | A | Invariante I8: cuantizar **solo en la frontera**; redondeo determinista tipo `quantizeDelta`; tests de ida y vuelta en `POC_PLAN` pasos 4 y 7 | Pruebas de round-trip — **✅ medido (4B-0): error absoluto 0 mm³ en V3; cálculo interno `double` exacto más allá de 2²⁴ mm; `Float32` de representación exacto a escala mueble. Riesgo bajado a B** |
| **R-05** | Se exige edición de caras/aristas/vértices y ninguna opción la da "barata": exige estructura topológica propia | A | A | MVP **selecciona y modifica por objeto** (decisión aprobada en Fase 4A); la edición topológica queda como **capacidad futura** de fase posterior; evaluar después capa B-rep (referencia: BREP.io) | Decisión de producto sobre alcance |
| **R-06** | Duplicación/conflicto entre el historial del configurador (`EditorHistory`) y el del modelador (`CommandHistory`) | M | M | Modos separados y UI explícita; dos historiales independientes (`MIGRATION_STRATEGY.md` §2) | Diseño de UX en 4C |
| **R-07** | Deriva accidental de `geometry-core` o de `WardrobeConfig` v1 durante el desarrollo del modelador | M | A | Regla: **diff prohibido** en `packages/geometry-core/src/**` y en el contrato; 179 tests como red; revisión en PR | Cualquier PR que toque el motor |
| **R-08** | Expectativa de usuario de importar/exportar formatos CAD (STEP/OBJ/glTF) y no estar disponible | A | M | Comunicar alcance en README/roadmap; `GeometryKernel` deja la puerta; no prometer en la Fase 4A | Feedback de comunidad |
| **R-09** | Rendimiento con muchos objetos: regeneración completa del kernel en cada edición | M | M | Caché de `MeshData` por clave + regeneración **selectiva** por objeto; medir en PoC (V3) | PoC pasos 4–6 — **parcialmente medido (4B-0): operaciones típicas < 0,5 ms (mediana), pero las densas bloquean el hilo (ver R-17)** |
| **R-10** | Fugas de memoria WebGL (geometrías/materiales no liberados) al crear y borrar sólidos | M | M | Política de `dispose()` ya existente en `WardrobeScene.tsx`; exigir disposal en `RendererAdapter`; test visual de creación/borrado repetido | PoC paso 4 y 8 — **✅ medido (4B-0): sin fuga en el kernel (20 000 `getMesh` → crecimiento 0 MB); `dispose` idempotente, `disposeAll → liveCount 0`** |
| **R-11** | Fragmentación del foco de producto: modelador general vs. diferenciador de muebles inteligentes | A | A | Prioridad declarada: modelado general con primeras herramientas inteligentes para muebles; decisiones de alcance contra este documento | Revisiones de roadmap |
| **R-12** | Licencia: introducir una dependencia incompatible con MIT sin notarlo | B | A | Revisión de licencia obligatoria por dependencia nueva (plantilla de `docs/community/LICENSE_EVALUATION.md`); Manifold = Apache-2.0 compatible con **obligaciones de atribución documentadas en `ADR-001-GEOMETRY-ENGINE.md`**; **LGPL-2.1 descartada** | Cualquier `npm install` nuevo — **auditado (4B-0): Apache-2.0 de Manifold confirmada; ver R-16 para el copyleft transitivo** |
| **R-13** | Las pruebas visuales existentes (200) se rompen por cambios de render compartidos | M | A | No tocar el configurador en 4A–4C; escenarios **nuevos** en ficheros nuevos; `npm run test:visual` obligatorio por PR | Cualquier cambio en `WardrobeScene`/`WardrobeViewer` |
| **R-14** | Accesibilidad del editor (WCAG AA pendiente, Issue #117) se postergue indefinidamente con el modelador | M | M | Exigir teclado para las herramientas nuevas (molde `SeparatorKeyboardControls`); mantener Issue #117 en el roadmap | Al abrir 4C |
| **R-15** | Sobredimensionamiento de la arquitectura (módulos que nadie usa) | M | M | `PROPOSED_ARCHITECTURE.md` §6 lista lo que **no** se diseña; revisar cada módulo contra el `POC_PLAN.md` | Revisión de diseño por fase |
| **R-16** | **Copyleft transitivo (LGPL) de `sharp`/`libvips`** arrastrado por `manifold-3d`, relevante si se empaqueta escritorio/CLI con `node_modules` | B (web) / M (escritorio) | A | El build web **no** distribuye esas rutas (auditado en 4B-0: el *entry* solo usa built-ins de Node). Antes de cualquier empaquetado de escritorio/CLI, revisar el árbol (`THIRD_PARTY_NOTICES.md` §3–4) y decidir: excluir `sharp` con `overrides`, aislar en CLI aparte, o revisión legal | Cualquier empaquetado de escritorio/CLI |
| **R-17** | **Bloqueo del hilo principal**: el WASM de Manifold es monohilo y síncrono; operaciones densas congelan render y entrada (medido: gap rAF hasta 883 ms) | A (modelador) | M | Delegar geometría en **Web Worker** con WASM pre-cargado; interfaz `GeometryKernel` como proxy con `ArrayBuffer` transferible; operaciones pequeñas pueden quedarse en el hilo principal. **No implementado aún**: solo documentada la estrategia (4B-0) | Al integrar el kernel en el editor (Fase 4B) |
| **R-18** | **Validador de croquis O(n²)**: `assertSimplePolygon` es cuadrático; con croquis muy densos el coste de validación puede dominar (medido: ~127 ms con ~2 000 vértices) | M | M | Prefiltrado por AABB ya aplicado (4B-0) reduce el caso disperso a ~O(n); si se necesita, pasar a sweep-line O(n log n). El modelador no debe aceptar croquis de miles de vértices sin revisar | Al medir latencia de edición con croquis densos |

## Riesgos ordenados por severidad (impacto × probabilidad)

1. **R-07** — Deriva del motor existente (mitigación dura: diff prohibido).
2. **R-17** — Bloqueo del hilo principal en operaciones densas (nuevo, 4B-0;
   mitigación: Web Worker, pendiente de implementar en Fase 4B).
3. **R-16** — Copyleft transitivo LGPL al empaquetar escritorio/CLI (nuevo,
   4B-0; irrelevante para el build web).
4. **R-05** — Expectativas de edición avanzada (alcance explícito).
5. **R-13** — Regresión visual (suites existentes intocables).
6. **R-18** — Validador de croquis O(n²) con geometrías muy densas (nuevo, 4B-0).

> **R-01, R-02, R-03, R-04 y R-10 quedan cerrados o atenuados** tras las
> mediciones de FASE-4B-0 (ver columna "Disparador").

## Riesgos NO aceptados (bloqueantes)

- Instalar dependencias **sin** justificación y revisión de licencia (regla 5
  de `AGENTS.md`).
- Modificar contratos de `geometry-core` para "encajar" el modelador.
- Presentar como verificado cualquier resultado de `POC_PLAN.md` **antes**
  de ejecutarlo.

## Registro de evidencias (actualizado tras FASE-4B-0)

| Evidencia | Estado |
|-----------|--------|
| V1–V5 (etapa 0 del kernel) | **✅ Ejecutadas (15/10/2026)** — `manifold-3d@3.5.4`; ver `packages/kernel-adapter/experiments/results/4b0-results.json` |
| Pruebas de los 10 pasos | **✅ Ejecutadas** — `npm test`: 565/565 en verde (179 `geometry-core` + 43 `kernel-adapter` + 343 web); `npm run test:visual`: **200/200** |
| Medición de tamaño/tiempos reales | **✅ Medida** — wasm 541 470 B (gzip 205 699 / brotli 158 724); init 23,5 ms navegador (mediana 14,1 ms Node); operaciones típicas mediana 0,074–0,478 ms |
| Robustez (rotación/escala/cóncavos/coplanares/extremos) | **✅ Ejecutada (4B-0)** — 31 tests nuevos en `tests/robustness.test.ts`; tolerancias justificadas, sin redondeo ocultador |
| Bloqueo del hilo principal | **✅ Medido (4B-0)** — gap rAF hasta 883 ms en navegador con booleanas densas → estrategia Web Worker documentada (R-17) |
| Auditoría de dependencias y licencias | **✅ Hecha (4B-0)** — `THIRD_PARTY_NOTICES.md`; hallazgo LGPL transitivo registrado (R-16) |

> Los resultados anteriores ya **no** son hipótesis: son mediciones con fecha y
> origen reproducible (`experiments/run-all.mjs`). Las hipótesis restantes se
> encuentran en `RESEARCH.md` §1.
