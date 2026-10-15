# ENGINE_COMPARISON — Comparación de motores geométricos (FASE-4A)

> Investigación, 15/10/2026. Fuentes en `RESEARCH.md` §7.
> Etiquetas: **HECHO** (fuente oficial o repo), **HIPÓTESIS** (razonado, no
> probado), **RIESGO**. Ninguna fila es resultado de pruebas nuestras: las
> pruebas están definidas en `POC_PLAN.md`.

## 0. Criterios de comparación

| Criterio | Descripción |
|----------|-------------|
| C1 Representación geométrica | Modelo de datos (malla, B-rep, cajas) |
| C2 Edición vértice/arista/cara | Capacidad de edición estructurada |
| C3 Extrusión | Perfil 2D → sólido |
| C4 Booleanas | Unión/resta/intersección de sólidos |
| C5 Robustez numérica | Comportamiento en casos límite |
| C6 Snapping | Imán a rejilla/puntos/planos |
| C7 Precisión de unidades | Encaje con la regla "mm enteros" |
| C8 Rendimiento | Coste en navegador |
| C9 WebAssembly | Necesidad de WASM / requisitos de hosting |
| C10 Tamaño de descarga | Peso de la primera carga |
| C11 Compatibilidad con Vite 8 | Integración real con el toolchain actual |
| C12 Mantenimiento | Actividad del proyecto |
| C13 Licencia vs MIT | Compatibilidad con repo MIT |
| C14 Complejidad de integración | Esfuerzo estimado en el código actual |

---

## Opción A — Three.js `BufferGeometry` (sin kernel)

**Qué es**: la estructura nativa del renderizador ya presente
(`three@0.186.1`). Atributos (`position`, `normal`, `uv`) + `index`; sin
semántica de sólido.

| Criterio | Evaluación | Evidencia |
|----------|-----------|-----------|
| C1 | Malla de triángulos indexada, **sin topología de sólido** (no existe "cara" poligonal, solo triángulos) | HECHO (docs three.js) |
| C2 | **No incluida**. Requiere estructura half-edge/VEF propia mapeada a los buffers | HECHO (fuente: discourse.threejs.org, 15/10/2026: "you might want to implement a half-edge structure (three.js does not provide part)") |
| C3 | `ExtrudeGeometry`/`Shape` extruyen **perfiles hacia geometría de render**, sin modelo de sólido ni cierre garantizado | HECHO (docs three.js) |
| C4 | **No hay booleanas** nativas | HECHO (docs three.js) |
| C5 | Depende enteramente de nuestra implementación; es el punto donde los proyectos externos reportan problemas | HIPÓTESIS (alto riesgo) |
| C6 | Totalmente a cargo nuestro | — |
| C7 | Control total (podemos trabajar en mm) | HECHO |
| C8 | Excelente (es el propio render) | HECHO |
| C9 | No requiere WASM | HECHO |
| C10 | 0 KB adicionales | HECHO |
| C11 | N/A (ya instalado) | HECHO (repo) |
| C12 | three.js: muy mantenido (0.186.1 instalado) | HECHO (repo) |
| C13 | MIT — perfecta | HECHO |
| C14 | **Complejidad muy alta**: hay que construir topología, recorte, triangulación, robustez | HIPÓTESIS con base sólida (los proyectos observados lo confirman) |

**Conclusión A**: sirve como **renderer** (ya lo es), no como kernel.

---

## Opción B — OpenCascade.js (kernel B-rep vía WASM)

**Qué es**: port de OpenCASCADE Technology (el kernel CAD de FreeCAD/Catia
clase) a WASM con bindings TypeScript.

| Criterio | Evaluación | Evidencia |
|----------|-----------|-----------|
| C1 | **B-rep completo**: `Solid`, `Face`, `Edge`, `Vertex`, geometría exacta (cilindros, planos, NURBS) | HECHO (fuente: ocjs.org) |
| C2 | Nativa (B-rep con topología explícita) | HECHO (fuente) |
| C3 | Nativa (`BRepPrimAPI`, perfiles y sweeps) | HECHO (fuente) |
| C4 | Nativas y robustas (`BRepAlgoAPI_Fuse/Cut/Common`) | HECHO (fuente) |
| C5 | Muy alta (kernel industrial con tolerancias explícitas) | HECHO (fuente) |
| C6 | A cargo nuestro, sobre raycasting de B-rep | HIPÓTESIS |
| C7 | Trabaja en doubles con tolerancias; la conversión a mm enteros sería nuestra | HIPÓTESIS |
| C8 | Medio-bajo en navegador: init ~488 ms publicados por el fork; operaciones costosas en tareas largas | HECHO (fuente: benchmark taucad, no medido por nosotros) |
| C9 | Obligatorio WASM; el build multihilo exige cabeceras **COOP/COEP** (rompe iframes de terceros) | HECHO (fuente: benchmark publica "Browser deployment cost") |
| C10 | **Full: 48,9 MB WASM / ~9,1 MB brotli; custom build de ejemplo 2,4 MB comprimido** | HECHO (fuente: ocjs.org file-size) |
| C11 | Integrable con `async` init + `?url` de Vite, pero exige carga diferida y probablemente un worker | HIPÓTESIS (no probado) |
| C12 | **Débil en upstream**: última release `v1.1.1` (2020), último commit de `master` 15/08/2023; existe fork activo `taucad/opencascade.js` (OCCT V8) | HECHO (fuente: GitHub) |
| C13 | **LGPL-2.1**: obligaciones de licenciamiento sobre el binario WASM en un repo MIT | HECHO (fuente: LICENSE del repo) |
| C14 | **Alta**: shim de tipos enorme, worker, manejo de memoria, sin encaje con mm enteros | HIPÓTESIS |

**Conclusión B**: potencia máxima, pero **peso, licencia LGPL y mantenimiento
inestable** la descartan como primera opción (ver ADR-001).

---

## Opción C — Motores de geometría sólida ligeros

### C.1 Manifold (`manifold-3d`)

| Criterio | Evaluación | Evidencia |
|----------|-----------|-----------|
| C1 | Malla **2-manifold orientada** (B-rep de triángulos) con propiedades por vértice | HECHO (fuente: manifoldcad.org) |
| C2 | **No incluye editor**: la entrada son mallas construidas por código (primitivas, `Extrude`, SDF) o nuestras; la edición se expresa como operaciones | HECHO (fuente: API `Manifold`) |
| C3 | **Nativa**: `Manifold.Extrude(crossSection, height, nDivisions, twistDegrees, scaleTop)` y `Revolve` | HECHO (fuente: `manifold.h` / docs JS) |
| C4 | **Nativas con garantía**: `union`/`subtract`/`intersect`/`BatchBoolean`; "guaranteed manifold output without caveats or edge cases" | HECHO (fuente: README) |
| C5 | Alta para mallas: garantía declarada de salida 2-manifold; manejo de coincidencias coplanares con perturbación simbólica documentada | HECHO (fuente: wiki/README) |
| C6 | A cargo nuestro (rejilla, puntos, planos) — independiente del kernel | HIPÓTESIS |
| C7 | Internamente doubles en unidades del usuario; **nosotros** mantenemos mm enteros en el documento y cuantizamos en la frontera | HIPÓTESIS (mitigable; ver `SCENE_DOCUMENT.md`) |
| C8 | Alta: operaciones paralelas en nativo; **el WASM es monohilo** (sin `TBB`) | HECHO (fuente: README) |
| C9 | WASM sí, pero **sin COOP/COEP** (al no ser multihilo) | HECHO (fuente: README build WASM serial-only) + HIPÓTESIS de compatibilidad de hosting |
| C10 | **`manifold.wasm` 528,78 KB + `manifold.js` 80,44 KB** | HECHO (fuente: jsDelivr, 3.5.4) |
| C11 | Init `async` (`await Module(); wasm.setup()`), 0 dependencias declaradas; previsible con `?url` + dynamic import | HIPÓTESIS (no probado; PoC etapa 0) |
| C12 | **Activo**: `manifold-3d` 3.5.x con publicaciones en 2026, ~52 k descargas/semana, bindings internos mantenidos; usado por BREP.io | HECHO (fuente: registry.npmjs, GitHub) |
| C13 | **Apache-2.0**: compatible con distribución en repo MIT conservando atribución/NOTICE | HECHO (fuente: LICENSE) |
| C14 | **Media-baja**: interfaz pequeña (`Manifold` + `MeshGL`), salida convertible a `BufferGeometry` | HIPÓTESIS |

### C.2 `three-bvh-csg` (CSG puro JS)

| Criterio | Evaluación | Evidencia |
|----------|-----------|-----------|
| C1 | `Brush` = `THREE.Mesh` con geometría indexada | HECHO (fuente: repo) |
| C2 | No incluye editor de topología | HECHO (fuente) |
| C3 | No incluye extrusión de croquis (habría que crear `Shape`→ geometría y validar cierre) | HECHO (fuente: API) |
| C4 | Sí: `ADDITION`, `SUBTRACTION`, `INTERSECTION`, `HOLLOW_*` | HECHO (fuente) |
| C5 | **Débil declaradamente**: "experimental, in progress"; "Due to numerical precision and corner cases resulting geometry may not be correctly completely two-manifold"; resultados usan `drawRange` (rompe exportadores) | HECHO (fuente: README/docs) |
| C6 | A cargo nuestro | HIPÓTESIS |
| C7 | Nuestro | HIPÓTESIS |
| C8 | Muy alto en JS puro (BVH, "+100× más rápido que BSP") | HECHO (fuente: README) |
| C9 | No requiere WASM | HECHO |
| C10 | ~1,3 MB unpacked, módulo ~160 KB | HECHO (fuente: npm) |
| C11 | Excelente (JS puro, peer de `three`) | HECHO (fuente) |
| C12 | Mantenido (0.0.18, feb 2026) pero **versión 0.0.x** y se autodeclara experimental | HECHO (fuente) |
| C13 | **MIT** — perfecta | HECHO (fuente) |
| C14 | Baja | HIPÓTESIS |

**Conclusión C**: Manifold ofrece el mejor equilibrio (robustez + peso +
mantenimiento + licencia); `three-bvh-csg` es el plan B de licencia puramente
MIT pero con garantías menores.

---

## Opción D — Arquitectura híbrida (kernel desacoplado + Three.js como renderer)

**Qué es**: mantener Three.js/R3F **solo como renderer** y hablar con un
kernel a través de una interfaz propia (`GeometryKernel`), de modo que el
motor de la aplicación no dependa de ningún proveedor concreto.

| Criterio | Evaluación | Evidencia |
|----------|-----------|-----------|
| C1 | El documento define su propio modelo; el kernel se sustituye tras la interfaz | Diseño (esta fase) |
| C2 | La edición por objeto vive en nuestra capa; la edición por cara/vértice se delega al kernel o se difiere | Diseño |
| C3–C4 | Delegadas al kernel elegido (Manifold en la recomendación provisional) | ADR-001 |
| C5 | La robustez es la del kernel elegido; la cuantización a mm es nuestra (frontera) | HIPÓTESIS verificable en PoC |
| C6 | Snapping en **nuestra** capa (independiente del kernel): reutiliza `raycasting`/`pointer capture` ya existentes en el repo | HIPÓTESIS con base (ver `CURRENT_ARCHITECTURE.md` §3.7) |
| C7 | Regla 1 preservada: el documento guarda **mm enteros**; el kernel recibe/convierte en su frontera | Diseño (`SCENE_DOCUMENT.md`) |
| C8 | Coste de conversión documentado↔malla, medible | HIPÓTESIS (PoC) |
| C9 | WASM opcional y **carga diferida** (fuera de la ruta crítica del configurador actual) | Diseño |
| C10 | Solo paga el peso quien usa el modelador | Diseño |
| C11 | Requiere PoC de init bajo Vite 8 | RIESGO R-02 |
| C12 | Depende del kernel elegido; al estar tras interfaz, un kernel en decadencia se sustituye sin tocar la UI | Diseño |
| C13 | MIT (nuestro código) + Apache-2.0 (Manifold) compatible | HECHO |
| C14 | Complejidad **media**: una interfaz nueva + adaptadores, sin tocar `geometry-core` | HIPÓTESIS |

**Conclusión D**: es la **única opción que mantiene reversibilidad** y que
permite empezar el modelador sin bloquear el configurador existente.

---

## Tabla resumen

| | A: BufferGeometry | B: OpenCascade.js | C1: Manifold | C2: three-bvh-csg | D: Híbrida |
|---|---|---|---|---|---|
| Booleanas | ❌ no | ✅ nativas | ✅ garantizadas | ⚠️ con avisos | ✅ según kernel |
| Extrusión | ⚠️ render-only | ✅ nativa | ✅ nativa | ❌ no incluida | ✅ según kernel |
| Edición v/a/c | ❌ propia | ✅ B-rep | ⚠️ por operaciones | ❌ propia | ⚠️ por objeto primero |
| Robustez | ❌ riesgo alto | ✅ industrial | ✅ declarada | ⚠️ experimental | según kernel |
| Tamaño | 0 | 2,4–9,1 MB | **~0,6 MB** | ~1,3 MB | según kernel |
| WASM/COOP-COEP | no/WASM no | sí/COEP en MT | sí/sin COEP | no/no | opcional |
| Licencia | MIT | **LGPL-2.1** | Apache-2.0 | MIT | MIT + kernel |
| Mantenimiento | ✅ | ⚠️ upstream parado | ✅ activo | ✅ (0.0.x) | — |
| Integración Vite | ✅ ya está | ⚠️ compleja | ⚠️ a validar | ✅ simple | ⚠️ PoC |
| Complejidad | 🔴 muy alta | 🟠 alta | 🟡 media | 🟠 media-alta | 🟡 media |

## Recomendación (aprobada como dirección; ver ADR-001)

**Opción D (híbrida) con `GeometryKernel` tras interfaz propia**, con
**Manifold aprobado como candidato principal para el PoC** y
`three-bvh-csg` (MIT) como alternativa de evaluación, manteniendo
`geometry-core` intacto como capa paramétrica de muebles.

Condiciones de la recomendación:

1. **Manifold es un candidato, no el motor definitivo**: se evalúa primero y
   se decide con los resultados de la etapa 0 del `POC_PLAN.md` (V1–V5).
2. **No se instala ninguna dependencia en esta fase** (REGLA de FASE-4A);
   `manifold-3d` sigue sin instalar.
3. Si la evaluación falla, la alternativa es `three-bvh-csg` (MIT, sin WASM)
   aceptando reducir ambición de booleanas en la primera versión.
4. Obligaciones de licencia Apache-2.0 documentadas en
   `ADR-001-GEOMETRY-ENGINE.md` ("Obligaciones de licencia").
