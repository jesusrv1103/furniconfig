# WAVE-01 — Distribución espacial y persistencia local del modelador

> **Estado**: traslación IMPLEMENTADA (PR B); rotación PENDIENTE DE
> AUTORIZACIÓN (§3); persistencia local en PR C apilado.
> Fuente de verdad de las decisiones de contrato de esta wave.

## 1. Alcance

- **Bloque 2 (este documento)**: mover sólidos libres y clósets por
  el suelo X/Z con mm enteros: campos exactos, flechas por paso,
  arrastre con snap configurable, vista previa estable, UNA entrada
  de historial por gesto, Escape cancela y Undo/Redo exactos.
- **Bloque 3**: persistencia local de escenas (`SceneEnvelope`)
  sobre un namespace propio, sin mezclar con el configurador.

## 2. Inspección de contratos (hallazgos verificados en código)

| Contrato | Hallazgo | Consecuencia |
| --- | --- | --- |
| `Transform3` (`modeler-core/types/document.ts`) | Solo `positionMm: MmPoint3`; el propio contrato reserva la rotación a un cambio de versión («campos opcionales en el futuro») | Rotación NO representable sin tocar `SceneDocument v1` → bloqueada |
| Comandos (`modeler-core/command.ts`) | `set-transform` YA existe (mueve esquina mínima, puro, no-op detectado, undo/redo) con tests | Traslación de componentes: sin cambios de núcleo |
| Render (`ModelerScene`) | Los componentes aplican `transform.positionMm`; los sólidos NO (la malla deriva del croquis ABSOLUTO; `transform` del sólido es identidad) | Mover sólidos = trasladar el croquis con `set-sketch` |
| Validador (`validate.ts`) | `transform` solo exige enteros finitos; NO hay invariante que ate `transform` al croquis | Trasladar croquis sin tocar `transform` no rompe nada |
| Conversión a componente (`convert-to-component`) | Compara prisma ABSOLUTO del croquis vs caja LOCAL del componente (solo demostrable si el croquis está en el origen) | Limitación PREEXISTENTE, no introducida por esta wave |

## 3. Decisiones

### 3.1 Rotación vertical (Y): PENDIENTE (bloqueada por contrato)

`Transform3` no tiene rotación; añadirla exige cambiar `SceneDocument
v1` (tipo + validador + lectores). Regla del wave: **no se modifica
el contrato automáticamente y NO se simula soporte de rotación**.

**Propuesta pendiente de autorización** (para una fase futura):

1. `Transform3.rotationYDeg?: number` (entero 0–359, opcional:
   ausente = 0, documentos v1 existentes válidos sin cambios).
2. Validación `ERR_SCENE_TRANSFORM_INVALID` para no enteros/rango.
3. Render: rotación de grupo para componentes Y sólidos (el sólido
   rota su malla ya colocada por `transform` cuando se implemente
   también su uso del `transform`), picking/resaltado heredados.
4. Kernel: los sólidos conservan croquis en el suelo; la rotación
   es un atributo de colocación (no de forma).
5. Persistencia: el campo viaja en `SceneEnvelope` sin cambios de
   versión (campo opcional).

### 3.2 Traslación: representación por tipo de objeto (SIN cambios de contrato)

- **Clóset (componente)**: posición = `transform.positionMm` →
  comando `set-transform`.
- **Sólido libre**: posición autoritativa = **esquina mínima del
  croquis** (`[minX, 0, minZ]`) → comando `set-sketch` con TODOS los
  vértices (y el origen del plano) trasladados por el delta. Una
  única fuente de verdad por objeto: malla, picking, kernel,
  persistencia y deshacer quedan coherentes automáticamente.
- Adaptador único en la web: `lib/modeler/transform.ts`
  (`getObjectPositionMm`, `buildObjectMoveCommand`, `snapPositionMm`,
  `parsePositionMm`, `translateSketch`, `offsetPositionMm`).
  El panel de posición oculta el objeto si su posición no es
  representable (p. ej. croquis no `ground`), en lugar de mostrar
  valores engañosos.

### 3.3 Interacción

- **Arrastre**: pulsar un objeto YA SELECCIONADO (herramienta
  Seleccionar) lo desplaza sobre el plano Y=0; la órbita se
  deshabilita mientras dura; la vista previa es SOLO de render
  (offset de grupo, documento intacto); el soltar confirma UNA
  entrada; `Escape`/`pointercancel` cancelan sin commit.
- **Snap** (checkbox, activo por defecto): redondea la posición
  resultante del ARRASTRE a la rejilla del documento. Los campos
  numéricos NUNCA se redondean (lo que se teclea es lo que se
  aplica); las flechas se desplazan exactamente un paso de rejilla.
- **Campos X/Z**: enteros con signo (7 dígitos); inválido → error
  visible sin tocar documento ni historial.

## 4. Pruebas

- Unitarias: `tests/modeler/transform.test.ts` (19) y panel SSR en
  `modeler-shell.test.tsx` (+6) → total web 586, suite 1069/1069.
- Visual (Chromium, sección 10 del `modeler-visual-check.mjs`):
  10a–11l (arrastre real con snap, Escape, campos exactos +
  inválidos, flechas, snap off con tolerancia ±30 mm, aislamiento
  entre clósets, undo/redo, restaurar con posición, rendimiento con
  4 clósets y paridad de recursos) → **77/77**.

## 5. Notas y balance

- El feedback de «Movido: <nombre>» se muestra en el aria-live del
  historial; el `label` del comando `set-sketch` del núcleo sigue
  siendo «Editar croquis de …» (sin tocar contratos).
- `nextWardrobePosition` coloca el nuevo clóset tras el borde
  derecho máx. entre clósets; mover clósets no altera ese cálculo
  (los sólidos no condicionan la inserción, comportamiento previo).
- La conversión sólido→componente sigue exigiendo croquis en el
  origen (limitación preexistente de `convert-to-component`,
  documentada en su fábrica).
