# RISKS — Riesgos técnicos del modelador 3D libre (FASE-4A)

> Matriz de riesgos con probabilidad/impacto **estimados** (no medidos),
> mitigación y disparador de revisión. Actualizada: 15/10/2026.

Leyenda: Probabilidad **B/M/A** (baja/media/alta) · Impacto **B/M/A**.

| ID | Riesgo | Prob. | Impacto | Mitigación | Disparador |
|----|--------|-------|---------|------------|------------|
| **R-01** | El kernel elegido (Manifold) no cubre las operaciones del MVP y hay que reescribir la capa de adaptador | M | A | Interfaz `GeometryKernel` pequeña y probada con stub antes de instalar nada; plan B `three-bvh-csg` (ADR-001) | Etapa 0 (V1–V4) del `POC_PLAN.md` |
| **R-02** | `manifold-3d` (WASM) no integra limpio con Vite 8 / init async en build de producción | M | A | Prueba V1 obligatoria **antes** de escribir código de producto; si falla → plan B sin WASM | PoC etapa 0 |
| **R-03** | Tamaño de descarga del WASM penaliza a los usuarios del configurador actual | M | M | Carga **diferida** solo al entrar al modelador; medir en V2; objetivo hipotético < 1 MB comprimido | V2 / métricas de carga |
| **R-04** | Pérdida de precisión al convertir mm enteros ↔ unidades del kernel (doubles), aristas que "no cierran" | M | A | Invariante I8: cuantizar **solo en la frontera**; redondeo determinista tipo `quantizeDelta`; tests de ida y vuelta en `POC_PLAN` pasos 4 y 7 | Pruebas de round-trip |
| **R-05** | Se exige edición de caras/aristas/vértices y ninguna opción la da "barata": exige estructura topológica propia | A | A | MVP **selecciona y modifica por objeto** (decisión aprobada en Fase 4A); la edición topológica queda como **capacidad futura** de fase posterior; evaluar después capa B-rep (referencia: BREP.io) | Decisión de producto sobre alcance |
| **R-06** | Duplicación/conflicto entre el historial del configurador (`EditorHistory`) y el del modelador (`CommandHistory`) | M | M | Modos separados y UI explícita; dos historiales independientes (`MIGRATION_STRATEGY.md` §2) | Diseño de UX en 4C |
| **R-07** | Deriva accidental de `geometry-core` o de `WardrobeConfig` v1 durante el desarrollo del modelador | M | A | Regla: **diff prohibido** en `packages/geometry-core/src/**` y en el contrato; 179 tests como red; revisión en PR | Cualquier PR que toque el motor |
| **R-08** | Expectativa de usuario de importar/exportar formatos CAD (STEP/OBJ/glTF) y no estar disponible | A | M | Comunicar alcance en README/roadmap; `GeometryKernel` deja la puerta; no prometer en la Fase 4A | Feedback de comunidad |
| **R-09** | Rendimiento con muchos objetos: regeneración completa del kernel en cada edición | M | M | Caché de `MeshData` por clave + regeneración **selectiva** por objeto; medir en PoC (V3) | PoC pasos 4–6 |
| **R-10** | Fugas de memoria WebGL (geometrías/materiales no liberados) al crear y borrar sólidos | M | M | Política de `dispose()` ya existente en `WardrobeScene.tsx`; exigir disposal en `RendererAdapter`; test visual de creación/borrado repetido | PoC paso 4 y 8 |
| **R-11** | Fragmentación del foco de producto: modelador general vs. diferenciador de muebles inteligentes | A | A | Prioridad declarada: modelado general con primeras herramientas inteligentes para muebles; decisiones de alcance contra este documento | Revisiones de roadmap |
| **R-12** | Licencia: introducir una dependencia incompatible con MIT sin notarlo | B | A | Revisión de licencia obligatoria por dependencia nueva (plantilla de `docs/community/LICENSE_EVALUATION.md`); Manifold = Apache-2.0 compatible con **obligaciones de atribución documentadas en `ADR-001-GEOMETRY-ENGINE.md`**; **LGPL-2.1 descartada** | Cualquier `npm install` nuevo |
| **R-13** | Las pruebas visuales existentes (200) se rompen por cambios de render compartidos | M | A | No tocar el configurador en 4A–4C; escenarios **nuevos** en ficheros nuevos; `npm run test:visual` obligatorio por PR | Cualquier cambio en `WardrobeScene`/`WardrobeViewer` |
| **R-14** | Accesibilidad del editor (WCAG AA pendiente, Issue #117) se postergue indefinidamente con el modelador | M | M | Exigir teclado para las herramientas nuevas (molde `SeparatorKeyboardControls`); mantener Issue #117 en el roadmap | Al abrir 4C |
| **R-15** | Sobredimensionamiento de la arquitectura (módulos que nadie usa) | M | M | `PROPOSED_ARCHITECTURE.md` §6 lista lo que **no** se diseña; revisar cada módulo contra el `POC_PLAN.md` | Revisión de diseño por fase |

## Riesgos ordenados por severidad (impacto × probabilidad)

1. **R-07** — Deriva del motor existente (mitigación dura: diff prohibido).
2. **R-01 / R-02** — Incertidumbre del kernel (etapa 0 obligatoria).
3. **R-04** — Precisión mm (invariante I8 + tests de round-trip).
4. **R-13** — Regresión visual (suites existentes intocables).
5. **R-05** — Expectativas de edición avanzada (alcance explícito).

## Riesgos NO aceptados (bloqueantes)

- Instalar dependencias **sin** justificación y revisión de licencia (regla 5
  de `AGENTS.md`).
- Modificar contratos de `geometry-core` para "encajar" el modelador.
- Presentar como verificado cualquier resultado de `POC_PLAN.md` **antes**
  de ejecutarlo.

## Registro de evidencias (pendiente)

| Evidencia | Estado |
|-----------|--------|
| V1–V5 (etapa 0 del kernel) | **Pendiente** — no ejecutado |
| Pruebas de los 10 pasos | **Pendientes** — no ejecutadas |
| Medición de tamaño/tiempos reales | **Pendiente** |

> Cuando se ejecuten, los resultados se registran aquí con valores reales y
> fecha; hasta entonces son hipótesis (`RESEARCH.md` §1).
