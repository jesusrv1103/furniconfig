# MODELER_4C — Modelador libre: estado tras la FASE-4C-B

> **Estado (FASE-4C-B)**: primera implementación funcional del flujo de
> modelado libre: **dibujar rectángulo → cotas exactas → extruir →
> seleccionar → editar → eliminar**. La pantalla existe desde la
> FASE-4A (`ModelerApp`, ruta `/modeler`, enlace de vuelta al
> configurador). **NO es un CAD completo**: las limitaciones están
> enumeradas en §9. Complementa `SCENE_DOCUMENT.md` (contrato del
> documento) y `MIGRATION_STRATEGY.md` §3 (Fase 4C).

## 1. Herramientas disponibles (4C-A + 4C-B)

| Herramienta | Comportamiento | Origen |
|---|---|---|
| **Seleccionar** | Clic sobre un sólido (raycasting) o en su fila de lista; muestra propiedades con cotas editables | 4C-B |
| **Rectángulo** | Arrastre en el plano del suelo con previsualización; el rectángulo queda **pendiente** (UI) hasta pulsar Extruir | 4C-A (gesto) / 4C-B (extrusión) |
| **Cotas en vivo** | Durante el arrastre se muestran ancho × profundidad; el snap cuantiza a la rejilla (100 mm, PROVISIONAL) | 4C-A |
| **Cotas exactas** | Panel del croquis pendiente: campos ancho/profundidad/extrusión editables antes de extruir | 4C-B |
| **Extruir** | Valida y crea el sólido en el `SceneDocument`; la geometría se deriva asíncronamente | 4C-B |
| **Editar cotas** | Los campos del panel de propiedades actualizan el documento y regeneran la malla | 4C-B |
| **Eliminar** | Quita el objeto del documento; la malla y su estado desaparecen | 4C-B |
| **Escape** | Cancela el arrastre a mitad de gesto; con el croquis ya finalizado, lo descarta (vuelve a ninguna herramienta) | 4C-A/B |
| **Vistas** | Ajustar, frontal, cenital y 3/4 (mismas convenciones que el configurador) | 4C-A |

## 2. Flujo de dibujo y extrusión

1. **Gesto** (`lib/modeler/drawing.ts`): pointerdown → `beginDrawGesture`,
   movimiento → `updateDrawGesture` (normaliza los cuatro sentidos, snap
   simétrico a la rejilla), pointerup → `finishDrawGesture` (área degenerada
   = `null`; un clic sin arrastre no dibuja).
2. **Croquis pendiente** (UI): el rectángulo vive en estado de
   `ModelerApp` (`pendingSketch` + `pendingExtrusionMm`), NO en el
   documento; se cotiza exactamente antes de comprometer.
3. **Extruir** (`lib/modeler/document-actions.ts`): valida el croquis
   (`rectangleSketchFromCorners`, mm enteros) y aplica
   `applySceneAction(add-solid)` — el modelador NO muta el documento.
4. **Derivación** (`lib/modeler/scene-geometry-coordinator.ts` →
   `lib/modeler/regeneration.ts`): el servicio regenera cada objeto vía
   `GeometryKernel` (Worker) y publica estados por objeto
   (`pending`/`ready`/`error` con reintento).
5. **Render** (`lib/modeler/mesh-to-renderable.ts` → `ModelerScene`):
   la `BufferGeometry` se crea una vez por malla (§8) y la escena
   renderiza solo lo que el motor devuelve.

## 3. Sistema de coordenadas

- **Croquis en planta**: `u` (ancho) → **X** del modelo; `v`
  (profundidad) → **Z**; la **extrusión es la altura** del sólido en
  **+Y** desde `y = 0`.
- Regla 1 intacta: mm enteros, origen en la esquina
  inferior-izquierda-frontal, posiciones = esquina mínima.
- La conversión **mm → m para render** ocurre exclusivamente en
  `lib/modeler/mesh-to-renderable.ts` (repartida por `lib/units.ts`).
- La rejilla de suelo y las cotas viven en **metros de trabajo** (2,15 m
  de lado, paso 0,1 m) — es la rejilla de dibujo, no el documento.

## 4. Adaptación de orientación geométrica (`ground-sketch-kernel.ts`)

El kernel `ManifoldGeometryKernel.fromSketch` extruye en **su** plano XY
hacia +w, pero el producto exige planta XZ + altura +Y. El adaptador de
la capa de aplicación intercambia y↔z del resultado:

```
kernel (u, v, w)  →  escena (x = u, y = w, z = v)
```

El intercambio es **impropio** (determinante −1): invierte la
orientación de la malla, por lo que el adaptador **revierte el
winding** de cada triángulo (índices [1]↔[2]) para conservar normales
hacia fuera. Verificado por volumen firmado (positivo antes y después).

Ámbito honesto: **solo** los refs creados por `fromSketch` se
transforman. `box`/CSG quedan en coordenadas del kernel y esta
adaptación debe **revisarse** cuando el modelador use esas operaciones
(fases de booleanos). El resto del flujo (`dispose`, `disposeAll`,
cancelación) se delega sin cambios.

Garantías del adaptador (tests de la suite `ground-sketch-kernel`):
puro (sin mutar los buffers de entrada), sin redondeos (solo permuta
componentes), delegación completa de recursos.

## 5. Política de precisión

- **Documento**: mm enteros (`validateSceneDocument`); las cotas
  exactas de 4C-B se escriben como enteros en el `SceneDocument`.
- **Snap de dibujo**: cuantiza a la rejilla de100 mm con redondeo
  simétrico en `.5` (`snapMm`) — paso **PROVISIONAL** sujeto a
  confirmación de carpintería.
- **Frontera del kernel**: las entradas se validan en `kernel-adapter`
  (mm enteros); la cuantización de la **salida** del kernel sigue
  abierta (`SCENE_DOCUMENT.md` §8.1) — el modelador no depende de ella
  porque sus croquises son ortogonales.
- **Render**: las posiciones de las mallas viajan en `Float32Array`
  (precisión de representación de Three.js); la capa de aplicación no
  redondea nada.

## 6. Inicialización diferida del Worker

El kernel WASM (Manifold, monohilo) vive en un **Web Worker** que se
crea **bajo demanda**: `ensureKernel` solo se invoca cuando hay sólidos
que derivar; una escena vacía nunca lo toca. Mientras inicializa
(~1–2 s la primera vez), los objetos quedan en estado `pending` honesto
y las acciones del usuario se acumulan sobre el documento: al estar
listo el motor se deriva **una sola vez la última revisión** (sin
trabajo duplicado). Verificado en tests (`ensureKernel` diferido) y en
los checks visuales 7a–7g (incluye el estado de motor "Inicializando…").

## 7. Concurrencia (reglas vigentes)

- **Revisión lockstep**: cada envío incrementa la revisión del
  servicio y la local en el coordinador; un resultado se aplica solo si
  sigue siendo de la revisión vigente del objeto.
- **Supersede por clave**: regenerar un objeto cancela la petición
  anterior del mismo objeto; eliminarlo cancela la suya.
- **Cancelaciones no son fallos** (`OperationCancelledError`): no
  dejan estado `error`.
- **Sin respuestas antiguas**: los resultados obsoletos se descartan en
  el servicio (`droppedStale`) y, como defensa, en el coordinador.
- **Cero KernelRef huérfanas**: cada ref se libera en `finally` tras
  `toMesh` (o por cancelación); verificado por `liveRefs`/`disposedRefs`
  en los tests del coordinador.

## 8. Ciclo de vida de geometrías de render

`useSolidGeometry` (`components/modeler/use-solid-geometry.ts`) retiene
**UNA** `BufferGeometry` por malla (identidad estable entre renders) y
la libera al **sustituirla** o al **desmontar** (`dispose` de
Three.js). La lógica `retainSolidGeometry` (adopt/release idempotentes,
invariante `disposed === created`) está testada en node; la celosía de
React se verifica en navegador real con el check visual **7l**. Los
contadores miden la adopción del effect, no la construcción: el doble
render de `StrictMode` en dev no los infla.

## 9. Limitaciones conocidas (no es un CAD completo)

- Solo **rectángulos ortogonales** dibujados en el suelo (sin
  polígonos libres, sin ángulos arbitrarios).
- **Sin operaciones booleanas** (unión/resta/intersección) — los
  comandos `box`/CSG del kernel no están cableados a la UI y su
  orientación requiere revisión (§4).
- **Sin Undo/Redo visual** (el `CommandHistory` de `modeler-core` no
  está conectado a la pantalla).
- **Sin componentes en la UI**: no se puede insertar un clóset desde el
  modelador (4D) ni volver a editar un diseño del configurador desde el
  modelador.
- **Sin persistencia** del modelador (el `SceneDocument` no se guarda
  ni carga).
- Croquis pendiente **solo en UI**: si se recarga la página se pierde.
- La extrusión parte de `y = 0` (sólidos apoyados en el suelo): no hay
  operaciones de desplazamiento vertical.
- Sin snap a ángulos, guías ni construcción asistida.

## 10. Verificación

- **Unitaria** (`npm test`): suites de modelador — `drawing`,
  `sketch-dimension`, `mesh-to-renderable`, `document-actions`,
  `scene-geometry-coordinator` (concurrencia), `ground-sketch-kernel`
  (orientación/volumen firmado), `use-solid-geometry` (recursos),
  `modeler-shell` (chrome) — junto al resto de la batería.
- **Visuales** (`npm run test:visual:modeler`): checks de la sección
  1 (chrome 4C-A) y **7a–7l** (flujo libre completo, incluida la
  liberación de geometrías), en Chromium real. El configurador
  conserva sus200 checks intactos (`npm run test:visual`).

## 11. Qué queda (fuera de 4C-B)

- Undo/Redo conectado a la pantalla.
- Booleanos (y con ellos, revisar la adaptación de orientación de §4).
- Componentes paramétricos en la UI del modelador y la vuelta
  modelador → configurador (`MIGRATION_STRATEGY.md` §3, Fase 4D).
- Persistencia del SceneDocument.
- Definitivar el snap de dibujo (100 mm provisional) con carpintería.
