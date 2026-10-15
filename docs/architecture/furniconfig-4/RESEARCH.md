# RESEARCH — FurniConfig 4.0: investigación de modelado 3D libre (FASE-4A)

> **Fase**: 4A (investigación y arquitectura; sin implementación).
> **Fecha de consultas**: 15 de octubre de 2026.
> **Estado**: documento de investigación. Las hipótesis están marcadas como
> `HIPÓTESIS` y los hechos verificados con fuentes como `HECHO (fuente)`.

## 1. Objetivo de la investigación

Evolucionar FurniConfig de **configurador paramétrico de clósets** a
**modelador 3D general** con este diferenciador:

> Modelado libre + componentes inteligentes + reglas paramétricas.

Prioridad de producto: modelado general, pero las primeras herramientas
inteligentes orientadas a muebles e interiores.

Esta investigación responde cuatro preguntas:

1. ¿Qué capacidades fundamentales tiene un modelador tipo SketchUp?
2. ¿Qué ofrece hoy el repositorio y qué le falta? (ver también
   `CURRENT_ARCHITECTURE.md`)
3. ¿Qué motores geométricos existen y cuál conviene? (ver
   `ENGINE_COMPARISON.md` y `ADR-001-GEOMETRY-ENGINE.md`)
4. ¿Cómo se integra sin romper lo existente? (ver `MIGRATION_STRATEGY.md`)

## 2. Metodología y niveles de evidencia

| Nivel | Significado |
|-------|-------------|
| **HECHO (fuente)** | Información publicada por el proyecto oficial, consultada el 15/10/2026. |
| **HECHO (repo)** | Verificado leyendo el código real de este repositorio. |
| **HIPÓTESIS** | Razonamiento técnico no ejecutado aún. Requiere PoC para confirmar. |
| **RIESGO** | Hipótesis con consecuencia negativa posible y mitigación propuesta. |

Ninguna hipótesis de este documento se presenta como resultado de pruebas
realizadas. Las pruebas de laboratorio están definidas en `POC_PLAN.md`.

## 3. Capacidades fundamentales de un modelador tipo SketchUp

A partir de la literatura consultada y de los proyectos observados, el
conjunto mínimo de capacidades de un modelador libre de sólidos es:

| # | Capacidad | Descripción |
|---|-----------|-------------|
| 1 | **Documento de escena** | Estructura persistible con objetos, materiales y parámetros. |
| 2 | **Croquis 2D sobre un plano** | Dibujar polígonos (rectángulo mínimo) sobre un plano de trabajo. |
| 3 | **Entrada numérica** | Introducir dimensiones exactas mientras se dibuja o después. |
| 4 | **Extrusión** | Convertir un perfil 2D en sólido (push/pull como mínimo). |
| 5 | **Selección** | Seleccionar objetos, y en fases posteriores caras/aristas/vértices. |
| 6 | **Transformación** | Mover/escalar; en el MVP, modificar dimensiones del sólido. |
| 7 | **Snapping** | Imán a rejilla, vértices, aristas, caras y ejes. |
| 8 | **Historial** | Deshacer/rehacer de cualquier operación. |
| 9 | **Persistencia** | Guardar/cargar en formato propio versionado. |
| 10 | **Componentes paramétricos** | Objetos con parámetros que regeneran su geometría. |

Capacidades **fuera** del alcance del MVP (pero contempladas por la
arquitectura): operaciones booleanas, curvas/superficies NURBS, texturas UV,
materiales por cara, importación STEP/OBJ/glTF, colaboración multiusuario.

## 4. Estado del arte observado (fuentes consultadas)

### 4.1 Modeladores web y kernels disponibles

| Proyecto | Tipo | Licencia | Fuente |
|----------|------|----------|--------|
| **Manifold** (`manifold-3d`) | Kernel de mallas 2-manifold con booleanas garantizadas; WASM | Apache-2.0 | https://github.com/elalish/manifold · https://manifoldcad.org |
| **OpenCascade.js** | Port a WASM del kernel B-rep OCCT (CAD clásico: caras exactas, fillet, historial) | LGPL-2.1 | https://ocjs.org · https://github.com/donalffons/opencascade.js |
| **three-bvh-csg** | CSG experimental sobre `three-mesh-bvh`, puro JS | MIT | https://github.com/gkjohnson/three-bvh-csg |
| **three.js** (`BufferGeometry`) | Renderizador + estructura de malla indexada; sin kernel CAD | MIT | https://threejs.org · dependencia `three@0.186.1` instalada |
| **BREP.io** | Modelador B-rep de código abierto en navegador; usa `manifold-3d` para booleanas | proyecto externo (referencia) | https://github.com/mmiscool/BREP.io |

### 4.2 Hechos verificados por fuentes oficiales

- **Manifold** (`HECHO (fuente)`, consultado 15/10/2026):
  - Paquete npm `manifold-3d` **3.5.x** (3.5.4 en CDN jsDelivr; última
    publicación del registro 04/06/2026), licencia **Apache-2.0**, 0
    dependencias runtime declaradas, ~52 226 descargas semanales.
  - Tamaño del artefacto WASM: **`manifold.wasm` 528,78 KB**, `manifold.js`
    80,44 KB (fuente: listado de archivos jsDelivr del paquete).
  - API disponible: primitivas (`Cube`, `Cylinder`, `Sphere`), **`Extrude`**,
    `Revolve`, booleanas (`union`, `subtract`, `intersect`, `BatchBoolean`),
    `Split`, `TrimByPlane`, `Hull`, `LevelSet` (SDF), consultas (`Volume`,
    `BoundingBox`, `RayCast`, `MinGap`).
  - Garantía central: *"guaranteed manifold output without caveats or edge
    cases"*; el algoritmo de booleanas está descrito como el primero con esta
    garantía. El build WASM es **monohilo** (sin `TBB`), por lo que **no
    requiere cabeceras COOP/COEP** (HIPÓTESIS razonado de la documentación de
    build; confirmar en PoC).
  - Existe binding oficial para JS/TS mantenido en el propio repositorio.
- **OpenCascade.js** (`HECHO (fuente)`):
  - Licencia **LGPL-2.1**; port oficial upstream con última publicación
    `v1.1.1` (2020) y último commit de `master` en **15/08/2023**
    (`HECHO (fuente)` GitHub). Existe un fork activo (`taucad/opencascade.js`)
    con releases recientes (OCCT V8).
  - Tamaño: WASM completo **48,9 MB sin comprimir / ~9,1 MB con brotli**;
    build personalizado de ejemplo 2,4 MB comprimido (fuente:
    ocjs.org/docs/getting-started/file-size).
  - Inicialización del módulo ~488 ms en el benchmark publicado del fork
    (medición propia del proyecto, no nuestra).
- **three-bvh-csg** (`HECHO (fuente)`):
  - Licencia **MIT**, versión **0.0.18** (17/02/2026), ~149 000 descargas
    semanales, 0 dependencias runtime declaradas (peer: `three`,
    `three-mesh-bvh`).
  - Se declara **"experimental, in progress"** y advierte: *"Due to numerical
    precision and corner cases resulting geometry may not be correctly
    completely two-manifold"*. Requiere mallas estancas (two-manifold) de
    entrada y usa `Geometry.drawRange` en resultados (afecta a exportadores).
- **three.js BufferGeometry** (`HECHO (fuente)` + `HECHO (repo)`):
  - Es una representación de render (atributos + índice) **sin estructura de
    topología editable**: no hay semántica de arista/cara ni operaciones
    booleanas o de extrusión de sólidos. La comunidad lo confirma: editar
    caras exige construir una estructura half-edge propia y mapearla a los
    buffers (fuente: discourse.threejs.org, "How to implement editable faces
    with push/pull behavior", consultado 15/10/2026).
  - `ExtrudeGeometry`/`Shape` de three.js extruyen **perfiles 2D hacia
    geometría de render**, sin modelo de sólido ni garantía de cierre.

### 4.3 Proyectos de referencia observados

- **ManifoldCAD.org**: modelador por scripting JS/TS sobre `manifold-3d`
  (mismo kernel propuesto). Demuestra que el kernel soporta croquis→extrusión
  →booleanas en navegador (`HECHO (fuente)`).
- **BREP.io**: modelador B-rep abierto con historial de características,
  solver de croquis 2D y booleanas basadas en `manifold-3d`; evidencia de que
  la combinación "kernel de mallas + capa B-rep propia" es viable en la web
  (`HECHO (fuente)`).
- Foros de three.js: múltiples intentos de push/pull sobre `BufferGeometry`
  concluyen en la necesidad de una estructura de datos propia (half-edge/VEF)
  separada del renderer (`HECHO (fuente)`).

## 5. Síntesis de hallazgos

1. **Three.js no es un kernel** (`HECHO (repo)`): en FurniConfig, Three.js
   solo se usa como renderer a través de R3F; toda la geometría procede del
   motor paramétrico y se convierte a `BoxGeometry`/`CylinderGeometry` en
   `apps/web/src/lib/panels-to-mesh.ts`.
2. **`geometry-core` no es un kernel** (`HECHO (repo)`): devuelve AABBs y
   cilindros descritos paramétricamente; no existen vértices, caras,
   triangulación, extrusión ni booleanas (ver `CURRENT_ARCHITECTURE.md`).
3. **Construir un kernel propio es el camino más caro** (`HIPÓTESIS` con
   base sólida): half-edge + robustez numérica + recorte de polígonos +
   triangulación equivalen a meses de trabajo con alto riesgo de errores de
   precisión (los propios proyectos existentes advierten de ello).
4. **Los kernels disponibles cubren el espectro** (ver
   `ENGINE_COMPARISON.md`): desde CSG ligero JS (MIT) hasta CAD B-rep
   completo (LGPL, pesado). Existe un punto intermedio razonable:
   **Manifold (Apache-2.0, ~0,5 MB WASM)**.
5. **La licencia importa**: el repositorio es MIT (LICENSE en `main` desde
   `c48f1e9`). Apache-2.0 (Manifold) es compatible para distribución agregada
   con atribución; LGPL-2.1 (OpenCascade.js) añadiría obligaciones de
   licenciamiento sobre el binario WASM.

## 6. Preguntas abiertas (requieren PoC o decisión)

| # | Pregunta | Dónde se resuelve |
|---|----------|-------------------|
| 1 | ¿Carga `manifold-3d` correctamente bajo Vite 8 con init `async`? | `POC_PLAN.md` (etapa 0), `RISKS.md` R-02 |
| 2 | ¿Cuánto pesa en la práctica la descarga diferida del WASM en la ruta crítica? | `POC_PLAN.md` |
| 3 | ¿Es suficiente Manifold para "modificar dimensiones" sin topología propia? | `POC_PLAN.md` pasos 5–6 |
| 4 | ¿Cómo se cuantiza a mm enteros la salida del kernel (regla 1)? | `SCENE_DOCUMENT.md`, `MIGRATION_STRATEGY.md` |
| 5 | ¿Qué capacidad de caras/aristas/vértices se necesita en la primera versión? | `PROPOSED_ARCHITECTURE.md` (selección por objeto primero) |

## 7. Fuentes consultadas

Todas las URLs se consultaron el **15/10/2026**:

1. https://github.com/elalish/manifold — README y licencia Apache-2.0.
2. https://manifoldcad.org/docs/jsapi/ — API WASM de Manifold (clase
   `Manifold`: `Extrude`, booleanas, `Cube`, etc.).
3. https://manifoldcad.org/docs/jsuser/ — guía de uso (`npm install
   manifold-3d`, init `async`).
4. https://cdn.jsdelivr.net/npm/manifold-3d/ — tamaño de artefactos
   (3.5.4, `manifold.wasm` 528,78 KB).
5. https://registry.npmjs.org/manifold-3d — versiones, licencia, descargas.
6. https://ocjs.org/docs/getting-started/file-size — tamaño de OpenCascade.js.
7. https://github.com/donalffons/opencascade.js — licencia LGPL-2.1, última
   actividad.
8. https://github.com/taucad/opencascade.js — fork activo, benchmarks.
9. https://github.com/gkjohnson/three-bvh-csg — licencia MIT, advertencias de
   precisión.
10. https://registry.npmjs.org/three-bvh-csg — versión 0.0.18 y descargas.
11. https://discourse.threejs.org/t/how-to-implement-editable-faces-with-push-pull-behavior-like-sketchup-or-coohom-in-three-js/85460
    — edición de caras en three.js y necesidad de half-edge.
12. https://github.com/mmiscool/BREP.io — modelador B-rep web con
    `manifold-3d`.
13. Código de este repositorio (rutas reales en `CURRENT_ARCHITECTURE.md`).

## 8. Trabajo relacionado dentro del repo

- `docs/architecture.md` — ADR-001 a ADR-028 del sistema actual.
- `docs/architecture/furniconfig-4/CURRENT_ARCHITECTURE.md` — diagnóstico.
- `docs/architecture/furniconfig-4/ENGINE_COMPARISON.md` — comparativa.
- `docs/architecture/furniconfig-4/ADR-001-GEOMETRY-ENGINE.md` — decisión.
