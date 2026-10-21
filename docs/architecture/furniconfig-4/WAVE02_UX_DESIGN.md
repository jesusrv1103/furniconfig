# WAVE-02 — Diseño UX del modelador

> **Principio rector**: «SketchUp con esteroides para muebles, pero sencillo de utilizar».
> La potencia (CAD completo, precisión mm, WAVE-01) permanece **disponible**, pero no es
> **obligatoria** para crear el primer proyecto.

Estado: **diseño + prototipos, NO implementado**. Prototipos navegables en
[`wave02-prototypes/`](./wave02-prototypes/) (`pantalla-inicial.html`, `editor-sencillo.html`).
Base: `main @ a557517` (WAVE-01 integrada). Auditoría de partida: Bloque B
(`/tmp/opencode/w02/audit/`: capturas `a01…a10`, `auditoria.md`, `hallazgos.json`).

## 0. De la auditoría al diseño

| Hallazgo | Solución WAVE-02 |
|---|---|
| P-01 escena técnica vacía como inicio | Pantalla de entrada con acción primaria «Crear clóset» |
| P-02 «Insertar clóset» enterrado (y=719 px) | Creación en un clic desde la entrada; el CRUD baja a «Proyectos» |
| P-03 sin auto-encuadre; 2º clóset fuera de vista | Centrado + encuadre automático al crear/abrir |
| P-04 rejilla/ejes siempre visibles | **Modo sencillo**: fondo neutro, sin rejilla/ejes; se revelan en avanzado |
| P-05 medida inválida → «Error» + fantasma + pista falsa | Validación en lenguaje humano («Con 4 módulos el mínimo es 2400 mm») |
| P-06 mover solo por texto de pista | Affordance visual de movimiento + controles direccionales con palabras |
| P-07 prompt nativo; sin dirty antes del primer guardado | Diálogo propio accesible; chip «Cambios sin guardar» GLOBAL |
| P-08 tras recargar, escena vacía = sensación de pérdida | Restauración del último diseño (+ banner de reanudación) |
| P-09 7 secciones, scroll, texto técnico al usuario | Sidebar simple (3 bloques) en modo sencillo; técnico solo en avanzado |
| P-10 ambigüedad léxica («motor geométrico», X/Z) | Lenguaje de usuario: Ancho/Alto/Fondo, Izquierda/Derecha, Frontal/Lateral |

**Invariantes respetadas** (ver «Reglas» del encargo): sin cambios en `geometry-core`;
`SceneDocument`/`Transform3` intactos (rotación sigue bloqueada); sin dependencias nuevas;
el configurador no se toca (solo navegación); sin duplicar motores: el modo sencillo es una
**capa de presentación** sobre los mismos componentes, comandos y stores de WAVE-01.

## 1. Principios de UX

1. **Un primer éxito en <60 s**: abrir → «Crear clóset» → ver un mueble centrado → cambiarle el ancho.
2. **Potencia bajo demanda**: todo lo actual sigue existiendo detrás del interruptor «Modo avanzado».
3. **Lenguaje de usuario, no de CAD**: medidas nombradas (Ancho/Alto/Fondo), movimientos en palabras,
   estados explicados («Generando…» solo si es cierto).
4. **Nunca pierdas el trabajo**: dirty visible desde el primer cambio, guardado explícito, restauración
   al volver, borrados con confirmación.
5. **Una fuente de verdad por objeto** (conservada de WAVE-01): clóset → `transform.positionMm`;
   sólido → esquina mínima del croquis. La UX nueva no crea orígenes de posición alternativos.

## 2. Experiencia de entrada

- `#/modeler` con perfil limpio muestra la **pantalla de entrada** (prototipo `pantalla-inicial.html`):
  - Acción primaria (card grande): **«Crear clóset»** → crea escena con un clóset paramétrico
    centrado y encuadrado, nombre por defecto «Clóset nuevo», **sin guardar** (chip dirty activo).
  - Opción avanzada (card secundaria): **«Diseño libre»** → la escena actual (semilla con
    rejilla/ejes, herramientas) con etiqueta «modo avanzado».
  - **Recientes**: últimos diseños locales (nombre + antigüedad + nº de objetos) con «Abrir».
    Mientras no haya ninguno: «Todavía no hay diseños; se guardan en este navegador».
- Con sesión previa: al abrir se **restaura el último diseño** y aparece un banner discreto
  «Continuando «X»» con acción «Empezar de nuevo».
- La entrada **no** enseña rejilla, ejes ni terminología; el vocabulario técnico vive en avanzado.

## 3. Espacio 3D (modo sencillo)

- **Fondo neutro** (gris claro plano); **rejilla y ejes ocultos** por defecto. En avanzado se
  muestran igual que hoy (toggle «Rejilla y ejes»).
- **Primer mueble centrado y encuadrado**: al crear/abrir/insertar, la cámara ejecuta el
  encuadre existente de «Ajustar» (generalizado en `ModelerCameraRig`) sobre el objeto recién
  creado. Un segundo clóset se inserta **junto al anterior** (offset por tamaño, no x=2600 fijo)
  y también se encuadra.
- **Cámara intuitiva**: mantener órbita actual (clic-arrastre) + rueda; en sencillo, banda de
  vistas reconocibles: **Frontal · Lateral · Isométrica** (chips con iconos, son los controles de
  «Vista» ya existentes, reubicados y rotulados en lenguaje llano).

## 4. Edición (modo sencillo)

- **Selección directa**: clic sobre el mueble (ya funciona) → contorno suave de selección
  (resaltado actual conservado) y **tarjeta contextual** flotante junto al objeto.
- **Tarjeta contextual**: medidas principales editables en línea (Ancho/Alto/Fondo con sus
  unidades), atajo «Puertas» (toggle) y botón «Mover». Los módulos/parametrización avanzada
  quedan en «Más opciones…» (abre avanzado enfocando el panel).
- **Medidas sin interpretar ejes**: solo Ancho/Alto/Fondo. La **posición** en sencillo se edita
  con movimiento visual (abajo), no con campos X/Z.
- **Movimiento visual**: arrastrar el mueble mueve el objeto (mismo pipeline de
  `transform.ts` + snap, ya probado en WAVE-01) sobre un **plano del suelo**; sobre la tarjeta,
  flechas direccionales rotuladas «Izquierda/Derecha/Adelante/Atrás» con valor en mm. El snap
  continúa; el modo avanzado conserva campos X/Z exactos y flechas ±100 tal cual.
- **Undo/Redo accesibles**: botones en la barra superior (ya existen) + `Ctrl/Cmd+Z`/`Ctrl+Shift+Z`
  (teclado, atajo universal) — una entrada por gesto, sin cambios de historial.
- **Errores comprensibles**: si la regeneración falla (p. ej. ancho < mínimo de módulos), el
  estado muestra el motivo y la acción («Con 4 módulos, el ancho mínimo es 2400 mm — corregir»);
  nunca «Generando…» cuando falló.

## 5. Proyectos

- Sección **«Proyectos»** (antes «Diseños») accesible desde la entrada y desde el editor.
- **Guardar / Guardar como** con **diálogo propio accesible** (componente React + CSS, focus
  trap, Escape, `aria-modal`) que sustituye a `window.prompt`/`window.confirm` — se implementa en
  WAVE-02-B3; hasta entonces se conservan los nativos (patrón vigente).
- **Chip de estado** en la barra superior: «Guardado ✓» / **«Cambios sin guardar»** —
  calculado respecto a la instantánea del último guardar/abrir, **incluso sin diseño activo**
  (un escena nunca guardada muestra «Sin guardar todavía»).
- **Recuperación sin conocimientos**: restauración automática del último diseño (§2), lista de
  recientes con nombres legibles, y mensajes humanos para sobres corruptos
  («Este diseño está dañado y no se puede abrir; puedes eliminarlo»).

## 6. Modo avanzado

- Interruptor **«Modo avanzado»** en la barra superior. ON = la UI actual completa: Vista,
  Herramientas (Seleccionar/Rectángulo), Añadir, Croquis pendiente, Objetos, Propiedades,
  Posición en el suelo (X/Z exactos, snap), Proyectos (CRUD completo), Documento (técnicos),
  rejilla/ejes y pista de escena.
- **Cero duplicación**: el modo es un flag de presentación (`mode: 'simple' | 'advanced'`) que
  decide qué secciones renderiza `ModelerShell` y qué fondos/gizmos pinta `ModelerScene`.
  Mismos stores, mismos comandos, mismo motor, mismos paneles.
- El **modo sencillo de WAVE-02 puede coexistir** con escenas creadas en avanzado (todo objeto
  actual sigue siendo seleccionable/editable en ambos modos).

## 7. Flujo completo (crear → editar → mover → guardar → reabrir)

1. **Crear**: entrada → «Crear clóset» → escena con «Clóset nuevo» centrado/encuadrado, chip
   «Sin guardar todavía».
2. **Editar**: clic en el mueble → tarjeta contextual → Ancho 2400→1800 (2 módulos) → regenera
   «Listo»; Undo disponible.
3. **Mover**: arrastrar el mueble (o flechas Izquierda/Derecha) → snap a 100 mm → una entrada de
   historial; «Deshacer» restaura.
4. **Guardar**: chip/Salvar → diálogo «Nombre del diseño» → «Clóset nuevo» → «Guardar» → chip
   «Guardado ✓»; el sobre v1 (`{format,version,document}`) se escribe en
   `furniconfig.modeler.designs.*` (sin mallas, sin remoto).
5. **Reabrir**: F5 → se restaura el diseño automáticamente con banner «Continuando «Clóset
   nuevo»»; o desde «Recientes» en la entrada; o en Proyectos (selector/lista) en el editor.

## 8. Inventario de componentes reutilizables (sin duplicar)

| Activo | Reutilización en WAVE-02 |
|---|---|
| `ModelerApp.tsx` (orquestador, dirty, designs, debug `__modeler`) | Orquesta modo, sesión y diálogos nuevos |
| `ModelerShell.tsx` + `modeler.css` (SSR, secciones, tokens) | Secciones condicionales por modo; CSS de tarjetas/entrada |
| `ModelerScene.tsx` (canvas, picking, drag Y=0, `__modelerProject`) | Fondo neutro, gizmos de movimiento, encuadre |
| `ModelerCameraRig.tsx` + controles «Vista» (Isométrica/Frontal/Lateral/Ajustar) | Auto-encuadre generalizado; chips de vista |
| `lib/modeler/design-store.ts` (CRUD puro, sobres v1) | + clave de sesión `furniconfig.modeler.session` (aditivo) |
| `use-modeler-history` (+`reset`) | Idéntico; atajos de teclado en la capa UI |
| `lib/modeler/transform.ts` (adapter, snap, `MoveDraft`) | Mismo motor de movimiento para tarjeta/flechas/arrastre |
| Paneles Position/Wardrobe/Objects/PendingSketch | Son el modo avanzado tal cual |
| `use-solid-geometry` / `use-component-parts` + runtime worker | Intocados (toda la regeneración actual) |
| Hooks de verificación (`window.__modeler*`) + scripts visual-check | Ampliación de checks, no reescritura |
| `DesignSection` (configurador) | Solo **patrón** de diálogos; el configurador no se toca |

## 9. Archivos que necesitan modificación (cuando se implemente)

**Nuevos**: `WelcomeScreen.tsx` (entrada), `ModalDialog.tsx` (diálogo accesible sin deps),
`modeler-dialogs.ts` (handlers puros de guardado con resultado), `design-session.ts`
(clave de sesión), tests SSR asociados.
**Modificados**: `ModelerApp.tsx` (estado `mode`, dirty global, sesión, wire de diálogos),
`ModelerShell.tsx` (secciones por modo, barra superior con chip y toggle), `ModelerScene.tsx`
(fondo, gizmos), `ModelerCameraRig.tsx` (auto-encuadre), `modeler.css` (tokens sencillo,
tarjeta contextual, entrada, modal), `AppRoot.tsx` (entrada antes del editor),
`design-store.ts` (sesión, aditivo), `modeler-visual-check.mjs` (nuevos checks + ajustes
deliberados de 11d/11b), `modeler-shell.test.tsx` (props nuevas).
**Intocados**: `packages/geometry-core/**`, `packages/modeler-core/**` (sin cambios de contrato),
`src/lib/designs/**` y vistas del configurador.

## 10. Riesgos de regresión

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambios de layout/cámara rompen los 292 checks visuales | Medio | Añadir checks; tocar solo los de layout afectado y con justificación; correr ambas suites por bloque |
| Restauración de sesión contradice el check 11d («sin apertura implícita») | Esperado | Es un **cambio de producto deliberado**: el check se actualiza en W02-B0 con el nuevo comportamiento documentado |
| `prompt`/`confirm` → modal rompe el planificador de diálogos del script visual 11 | Medio | Mantener nativos hasta B3; en B3 actualizar el planificador para el modal del DOM |
| Auto-encuadre altera escenas de pruebas (4 clósets, perf 10k) | Bajo | Encuadre tras flag/acción explícita de creación; no en cada render |
| Dirty global falso positivo (p. ej. restauración) | Bajo | Instantánea JSON en el mismo punto actual (ya probado); tests unitarios del cálculo |
| Perder el modo actual para usuarios existentes | Medio | «Diseño libre» = UI actual completa; modo recordado en sesión |
| Deriva entre modo sencillo y motor (doble lógica) | Medio | Sencillo = render condicional; prohibido duplicar comandos/validaciones (revisión en cada bloque) |

## 11. Estrategia de pruebas y criterios de aceptación

**Estrategia**: (a) tests SSR de carcasa por modo; (b) tests unitarios de los helpers nuevos
(diálogo/sesión/dirty global — puros); (c) ampliación de `modeler-visual-check.mjs` con sección
«WAVE-02 entrada/editor sencillo» (checks ejecutables de A-01…A-08); (d) conservar intactas las
suites actuales (configurador 200, modelador ≥92) como red de seguridad; (e) QA secuencial por
bloque (typecheck/test/build/ambas visuales).

**Criterios de aceptación (ejecutables)**:
- **A-01** perfil limpio en `#/modeler` → pantalla de entrada visible, sin rejilla/ejes (check visual).
- **A-02** un clic en «Crear clóset» → 1 clóset «Listo», centrado y encuadrado (check: proyección
  del centro dentro del 40% central del lienzo).
- **A-03** modo sencillo: fondo neutro sin rejilla/ejes; chips Frontal/Lateral/Isométrica cambian
  la vista (check por vista).
- **A-04** ancho inválido (900 con 4 módulos) → mensaje con el mínimo y acción de corrección;
  **sin** «Error» crudo ni pista «Generando…» falsa (check de texto).
- **A-05** mover por arrastre y por flechas rotuladas = UNA entrada de historial cada uno; undo
  exacto (checks ya existentes conservados + nuevos de flechas).
- **A-06** guardar con diálogo propio (sin `prompt`), focus inicial en el campo, Escape cancela;
  chip «Cambios sin guardar» desde el **primer** cambio, incluso sin diseño activo (checks).
- **A-07** F5 tras guardar → diseño restaurado + banner «Continuando» (check visual; sustituye al
  actual 11d de forma deliberada).
- **A-08** «Modo avanzado» ON → todas las secciones actuales presentes: la suite del modelador
  completa pasa sin cambios de aserciones (paridad 100%).
- **A-09** typecheck 0, unitarias ≥ actuales, build 🟢, configurador 200/200, modelador ≥ actuales.
- **A-10** 0 dependencias nuevas; `geometry-core` y contratos con diff vacío.

## 12. División en bloques grandes autónomos (implementación futura)

| Bloque | Alcance | Dependencias | Archivos principales |
|---|---|---|---|
| **W02-B0 · Entrada y sesión** | `WelcomeScreen`, crear clóset en 1 clic, recientes, restauración + banner, chip dirty global, teclado undo/redo | ninguna | `WelcomeScreen`, `AppRoot`, `ModelerApp`, `design-store`(+sesión), tests |
| **W02-B1 · Espacio sencillo** | fondo neutro, rejilla/ejes por modo, auto-encuadre, chips de vista, insertar junto al seleccionado | B0 | `ModelerScene`, `ModelerCameraRig`, `ModelerShell`, CSS |
| **W02-B2 · Edición contextual** | tarjeta contextual (medidas+puertas), movimiento visual rotulado, mensajes de error humanos | B1 | `ModelerShell`, `ModelerScene`, `ModelerApp`, CSS |
| **W02-B3 · Proyectos accesibles** | `ModalDialog` (guardar/renombrar/eliminar), lista de proyectos, lenguaje humano de corrupción | B0 | `ModalDialog`, `ModelerApp`, `design-store`(msgs), visual-check 11 |
| **W02-B4 · Modo avanzado** | interruptor + paridad total, reubicación de CRUD completo y paneles técnicos, recordar modo | B0–B3 | `ModelerShell`, `ModelerApp`, CSS |
| **W02-B5 · Cierre** | sección visual WAVE-02 completa, docs de usuario, ajuste fino de criterios A-01…A-10 | B0–B4 | `modeler-visual-check.mjs`, docs |

Cada bloque es mergeable por sí mismo, con QA secuencial completo y sin tocar contratos.

## 13. Recomendación

**GO** para implementar WAVE-02 empezando por **B0 + B1** (mayor valor percibido, riesgo controlado,
todo aditivo sobre la base ya verificada de WAVE-01). B3 puede adelantarse si se prioriza la
confianza del usuario (guardado accesible). B2 y B4 se cierran sobre esa base. Ningún bloque
requiere cambios de contrato, dependencias nuevas ni tocar el configurador/`geometry-core`;
la rotación Y **sigue bloqueada** hasta que el contrato la autorice.
