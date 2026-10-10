# Arquitectura — FurniConfig (Fase 0)

## 1. Visión general

FurniConfig se construye como un **monorepo npm workspaces**. En esta fase el único
paquete es `packages/geometry-core`: un motor paramétrico **puro** que transforma
una configuración de mueble (contrato versionado) en resultados geométricos
(paneles con dimensiones y posiciones, en milímetros).

```
WardrobeConfig (contrato v1, JSON-serializable)
       │
       ▼
validateWardrobeConfig()        ──▶  { ok: false, errors: ConfigIssue[] }
       │ ok
       ▼
resolveWardrobe()
  ├─ distributeModules()        → anchos útiles por módulo (determinista)
  └─ materiales resueltos       → ids deterministas
       │
       ▼
buildPanels()                   → Panel[] (dimensiones y posiciones en mm)
  + buildRods()                 → HangingRod[] (barras de colgado)
  + buildDrawers()              → paneles "drawer-*" + DrawerAssembly[]
  + buildDoors()                → Door[] + DoorHandle[] (posición cerrada)
       │
       ▼
GeometryResult { wardrobe, panels, rods, drawers, doors, handles, totals }
```

El motor **no conoce Three.js ni React**: la capa de visualización (Fase 1)
consumirá `GeometryResult` y construirá la escena 3D a partir de `Panel[]`.

## 2. Estructura

```
furniconfig/
├── docs/                            # documentación viva
├── packages/
│   └── geometry-core/
│       ├── src/
│       │   ├── types/               # modelos de dominio tipados
│       │   │   ├── material.ts      # Material, MaterialSpec, espesores 15|18
│       │   │   ├── module.ts        # Module, ModuleConfig, ModuleKind
│       │   │   ├── panel.ts         # Panel, PanelRole
│       │   │   ├── rod.ts           # HangingRod, RodMaterial
│       │   │   ├── drawer.ts        # DrawerAssembly
│       │   │   ├── door.ts          # Door, DoorHandle, DoorOpeningTransform
│       │   │   ├── wardrobe.ts      # Wardrobe (resuelta)
│       │   │   └── geometry-result.ts
│       │   ├── contract/            # frontera de entrada
│       │   │   ├── wardrobe-config.ts   # contrato versionado (schemaVersion)
│       │   │   ├── limits.ts            # límites provisionales (¡validar!)
│       │   │   └── validate.ts          # validación runtime de unknown
│       │   └── engine/              # funciones puras
│       │       ├── distribute.ts    # anchos útiles y distribución de módulos
│       │       ├── panels.ts        # generación de paneles (+ panel trasero)
│       │       ├── rods.ts          # barras de colgado
│       │       ├── drawers.ts       # cajoneras (5 piezas por cajón)
│       │       ├── doors.ts         # puertas abatibles y tiradores
│       │       └── geometry.ts      # calculateGeometry() (orquestador puro)
│       └── tests/
```

## 3. Decisiones de arquitectura (ADR)

### ADR-001 — Monorepo con npm workspaces
**Contexto:** varios paquetes futuros (engine, frontend, backend).
**Decisión:** workspaces nativos de npm 10. **Consecuencias:** cero dependencia de
pnpm/yarn; instalación y scripts consistentes (`npm test --workspaces`).

### ADR-001b — Tipos y runtime desde la fuente (`geometry-core`)
**Contexto:** en un monorepo privado, apuntar `exports` a `dist/` obliga a
construir el motor antes de `dev`/`typecheck`/`test` de la web.
**Decisión:** `@furniconfig/geometry-core` exporta `./src/index.ts`
(tipos y runtime). Vite y Vitest transforman el TS del motor
directamente; `tsc` toma los tipos de la fuente.
**Consecuencias:** `npm install && npm run dev` funciona sin build
previo; la compilación a `dist/` se mantiene para usos futuros
(inspección o consumo externo). Si el paquete se publicara, se
volvería a un esquema dual `development`/`default`.

### ADR-002 — Motor geométrico puro y desacoplado
**Contexto:** el cálculo debe servir al frontend (R3F) y, en el futuro, al
backend (Laravel) sin duplicar lógica.
**Decisión:** TypeScript puro, sin dependencias runtime, sin I/O, sin estado.
**Consecuencias:** testeable en Node, portable (puede portarse a PHP o exponerse
por API), independiente de la evolución de Three.js.

### ADR-003 — Milímetros enteros como unidad interna
**Contexto:** la carpintería trabaja en mm; los floats generan errores de
redondeo acumulados.
**Decisión:** todas las dimensiones son `number` enteros positivos (mm); se
rechazan decimales en validación. Los únicos redondeos permitidos son puntuales
y deterministas (ver ADR-006).

### ADR-004 — Sistema de coordenadas
**Decisión:** origen en la esquina **inferior-izquierda-frontal** del mueble;
**X = ancho** (creciente a la derecha), **Y = alto** (creciente hacia arriba),
**Z = profundidad** (creciente hacia el fondo). Las posiciones de panel son su
**esquina mínima**. Coincide con el handedness típico de Three.js (Y-up).

### ADR-005 — Manejo explícito de errores
**Decisión:** dos mecanismos complementarios:
- **Validación de entrada** (`validateWardrobeConfig`): devuelve un resultado
  `{ ok, config } | { ok: false, errors: ConfigIssue[] }` — nunca lanza; apto
  para fronteras de API.
- **Motor** (`distributeModules`, `calculateGeometry`): lanza `GeometryError` con
  `code` estable (`ERR_*`) y `details` con cifras.
**Consecuencias:** el frontend puede mostrar mensajes sin try/catch para entradas
de usuario, y con try/catch tipado para el cálculo.

### ADR-006 — Distribución determinista de módulos
**Contexto:** al dividir el ancho disponible entre N módulos suele sobrar 1 mm.
**Decisión:** división entera por piso; el residuo se reparte **de izquierda a
derecha**, 1 mm por módulo. Garantiza salida idéntica ante la misma entrada.
Redondeo de posición de entrepaños: `Math.round` (único redondeo permitido,
documentado).

### ADR-007 — Contrato de configuración versionado
**Decisión:** `WardrobeConfig` lleva `schemaVersion` (hoy = 1). La validación
rechaza versiones desconocidas. **Consecuencias:** el frontend y el backend futuro
pueden evolucionar el contrato sin romper el motor; cada versión tendrá su
validador.

### ADR-008 — Materiales por rol (estructura / interior)
**Decisión:** la configuración define dos especificaciones de material:
`structure` (laterales, superior, inferior, divisiones) e `interior`
(entrepaños). El espesor del material **determina la geometría** (restas de
ancho/alto), por eso es parte del cálculo, no solo cosmética.
**Consecuencias:** cambiar de 15 a 18 mm cambia anchos útiles de módulos de
forma coherente y automática.

### ADR-009 — Límites provisionales centralizados
**Contexto:** no tenemos reglas de fabricación confirmadas por carpintería.
**Decisión:** todos los límites viven en `src/contract/limits.ts` y se marcan
como **PROVISIONAL** en `docs/product-rules.md`. Nunca se dispersan en código.

### ADR-010 — Vitest como runner de pruebas
**Decisión:** Vitest 5 (compatible con Node >= 22.12), una configuración mínima
por paquete, tests en `tests/`. **Consecuencias:** misma sintaxis que Jest,
soporte nativo de ESM y TS sin configuración extra.

### ADR-011 — Capa de presentación desacoplada (`apps/web`)
**Contexto:** la Fase 1 añade el visualizador 3D interactivo.
**Decisión:** app React + Vite en `apps/web` que **consume**
`GeometryResult` del motor; nunca calcula geometría propia.
La conversión mm → metros ocurre **solo** en `src/lib/units.ts`,
y la adaptación `Panel` → datos de caja en `src/lib/panels-to-mesh.ts`.
**Consecuencias:** el motor sigue siendo puro y agnóstico de
Three.js; la escena puede reemplazarse ( Canvas 2D, PDF, export )
sin tocar el motor.

### ADR-012 — Renderizado por paneles, sin geometría inventada
**Decisión:** cada `Panel` del motor se renderiza como un
`BoxGeometry` de Three.js, en metros, posicionado en su centro
(el motor reporta la esquina mínima). Geometrías y materiales de
Three.js se **reutilizan** por tamaño único y por `materialId`
(mapas memoizados con `dispose` al desmontar). **No se inventa
geometría**: módulos `hanging` y `drawers` son cajas vacías hasta
que carpintería defina barras y cajas de cajón
(`docs/product-rules.md` §3).
**Consecuencias:** la escena refleja exactamente el motor; si el
motor cambia, la escena cambia coherentemente.

### ADR-013 — Visualizador con carga diferida (lazy)
**Decisión:** `WardrobeViewer` se carga con `React.lazy`
(Three.js es pesado) y la UI muestra un fallback mientras carga.
**Consecuencias:** la interfaz de configuración es usable
inmediatamente; el chunk de Three.js solo se descarga si hay una
configuración válida; el renderizado en servidor (tests) no
requiere WebGL.

### ADR-014 — Estado inválido: dos causas, un manejo
**Contexto:** una configuración puede fallar en dos puntos:
la validación del contrato (`validateWardrobeConfig`, errores de
forma) o el cálculo geométrico (`calculateGeometry`, lanza
`GeometryError`, p. ej. ancho insuficiente para los módulos).
**Decisión:** `App` deriva ambos resultados con `useMemo` y
captura `GeometryError` como estado inválido renderizable
(lista de errores con código y mensaje); cualquier otro error se
propaga (es un defecto de programación, no debe ocultarse).
**Consecuencias:** la UI nunca se rompe por entradas del usuario
y muestra mensajes del motor sin traducirlos ni duplicarlos.

### ADR-015 — Configuración de UI como funciones puras
**Decisión:** `apps/web/src/lib/config.ts` expone
`DEFAULT_CONFIG` y helpers inmutables (`setDimension`,
`setModuleCount`, `setModuleKind`, …) que devuelven una nueva
`WardrobeConfig`. Los límites de la UI provienen de
`WARDROBE_LIMITS` del motor (no se duplican).
**Consecuencias:** actualizaciones funcionales de React seguras,
tests de la UI sin DOM, y un solo lugar para los límites.

### ADR-016 — Barras de colgado como componente cilíndrico (Fase 2A)
**Contexto:** los módulos "hanging" necesitaban barras de
colgado; un tablero (`Panel`) no modela un cilindro.
**Decisión:** nuevo componente geométrico `HangingRod` en el
motor (eje, longitud, diámetro, posición como esquina mínima
del bbox, `materialId`), generado por `buildRods(wardrobe)`
— **una barra por módulo "hanging"**, nunca desde React.
El contrato v1 se extiende con `hangingRod?: HangingRodSpec`
(todos los campos opcionales: backward compatible; ausencia =
defaults provisionales del motor). `GeometryResult` gana
`rods: HangingRod[]` y `totals.rodCount`/`rodLengthMm`
(aditivo; no rompe consumidores existentes).
**Reglas PROVISIONALES** (docs/product-rules.md §3): eje X,
longitud = ancho útil del módulo, centro a 100 mm bajo el
superior, diámetro 18–60 mm (default 30), material metálico
("Acero/brillo" por defecto). Validación de compatibilidad:
la barra debe caber entre superior e inferior
(`ERR_HANGING_ROD_HEIGHT`); diámetro fuera de rango
(`ERR_HANGING_ROD_DIAMETER`).
**Consecuencias:** la escena renderiza `CylinderGeometry`
por barra (reutilizado por eje+longitud+diámetro, con
`dispose`); mm → m solo en `lib/panels-to-mesh.ts`
(`toRenderableRod`).

### ADR-017 — Derivación de estado centralizada (Fase 2A)
**Decisión:** `apps/web/src/lib/derive.ts` expone
`deriveGeometryState(config)` — validación de forma + cálculo
geométrico + captura de `GeometryError` en una función pura,
usada por `App` y por los tests.
**Consecuencias:** la lógica de "válido / inviable / inválido"
se prueba sin DOM ni React; cambios rápidos de configuración
son verificables como secuencias puras; `App` solo maneja
estado de React.

### ADR-018 — Cajoneras como ensamblajes de paneles (Fase 2B)
**Contexto:** los módulos "drawers" necesitaban cajas de
cajón; en Fase 0–2A generaban solo espacio libre.
**Decisión:** las piezas del cajón (frente, dos laterales,
trasera, fondo) son `Panel` con roles nuevos
(`drawer-front`, `drawer-side`, `drawer-back`,
`drawer-bottom`) generados por `buildDrawers(wardrobe)` y
**incluidos en `GeometryResult.panels`** — la presentación
los renderiza como cualquier tablero (un `Box` por panel,
sin inventar geometría). Un `DrawerAssembly`
(`drawers: DrawerAssembly[]` en `GeometryResult`, aditivo)
relaciona las cinco piezas de cada cajón por `partIds`
(ensamblaje identificable). El contrato v1 se extiende de
forma backward compatible: `modules[].drawers` es
**opcional** (ausencia = default 3, así las configuraciones
Fase 0–2A con `{ kind: 'drawers' }` siguen validando) y
`materials.drawer?: MaterialSpec` es opcional (default
provisional "Blanco / 15 mm / mate"). `GeometryTotals` gana
`drawerCount` y `drawerPartCount`.
**Reglas PROVISIONALES** (docs/product-rules.md §3): la
altura interior se reparte en bandas con residuo de abajo
hacia arriba (`distributeDrawerBands`); holgura vertical
de 3 mm arriba de cada cajón y lateral de 3 mm por lado
del frente; el cajón ocupa toda la profundidad interior
(las guías comerciales restarán espacio cuando se
implementen); el frente cubre toda la altura de la caja.
Compatibilidad física verificada: la caja (ancho entre
laterales, profundidad entre frente y trasera, altura de
laterales sobre el fondo) debe caber; si no, el motor
rechaza con `ERR_DRAWER_DIMENSIONS` (defensivo con los
límites actuales). Cantidad fuera de rango 1–8:
`ERR_INVALID_DRAWER_COUNT`.
**Consecuencias:** los cajones permanecen cerrados (sin
animaciones de apertura en esta fase); el volumen de
tableros y el conteo de paneles incluyen las piezas de
cajón; las pruebas de "drawers no genera paneles" de
fases anteriores evolucionan a "genera solo paneles de
cajón" (comportamiento nuevo planeado, no una regresión).

### ADR-019 — Puertas abatibles sobre el frente (Fase 2C)
**Contexto:** el clóset necesita puertas; un tablero
(`Panel`) no modela la apertura, y alterar los
constructores existentes para alojarlas rompería la
geometría de Fases 0–2B.
**Decisión:**
- Las puertas son **componentes geométricos separados**
  (como las barras): `Door` (hoja) y `DoorHandle`
  (tirador) en el motor, generados por
  `buildDoors(wardrobe)` y expuestos de forma aditiva
  en `GeometryResult.doors` / `handles` (con
  `totals.doorCount` / `handleCount`).
- **Activación por presencia:** el contrato v1 extiende
  con `doors?: DoorsConfig` (`leaves` 1|2, `hingeSide?`,
  `clearanceMm?`, `material?` opcional). La ausencia del
  campo = sin puertas (backward compatible con
  configuraciones de fases anteriores).
- **Montaje sobre el frente (PROVISIONAL):** la hoja
  cerrada ocupa `z ∈ [−espesor, 0]` — por delante del
  plano frontal del cuerpo. Es puramente aditivo:
  paneles, barras y cajones NO se alteran.
- **La apertura es una transformación pura de
  presentación:** `doorOpeningTransform(door,
  openAngleDeg)` devuelve `{ hingeXmm, hingeZmm,
  centerOffsetMm, signedAngleRad }`; la capa de
  presentación aplica `rotation.y` sobre un group
  situado en el eje de bisagra. Los datos geométricos
  originales **no se alteran** (la puerta del motor
  permanece cerrada). El ángulo (0–110°) es **estado
  de UI**, no de configuración.
**Reglas PROVISIONALES** (docs/product-rules.md §3):
1–2 hojas por módulo (con 2, las bisagras van en los
extremos exteriores); holgura 0–10 mm (default 3) entre
hojas y bordes del módulo, y entre hojas; el residuo de
1 mm del reparto queda como holgura extra en el borde
derecho; bisagra configurable con una hoja (default
`left`); tirador: cilindro horizontal contra la cara
frontal de la hoja, a 30 mm del borde libre (opuesto a
la bisagra), centrado verticalmente, longitud = 40% del
ancho de hoja acotada entre 40 y 120 mm, diámetro 18 mm;
material de hoja default = estructura (`material-door`);
tirador metálico fijo "Acero/brillo" (`material-handle`).
**Validaciones:** `ERR_INVALID_DOOR_LEAVES`,
`ERR_INVALID_HINGE_SIDE`, `ERR_INVALID_DOOR_CLEARANCE`,
`ERR_DOOR_OPEN_ANGLE` (ángulo fuera de 0–110°) y
`ERR_DOOR_WIDTH_INSUFFICIENT` (defensivo: la abertura
no admite hojas con la holgura).
**Consecuencias:** la escena renderiza un `group` por
puerta en su eje de bisagra (rotación firmada: bisagra
izquierda → ángulo positivo; derecha → negativo; en
ambos casos el borde libre se aleja del frente hacia el
observador) con el `Box` de la hoja y el `Cylinder` del
tirador como hijos; `toRenderableDoor` /
`toRenderableHandle` en `lib/panels-to-mesh.ts`; mm → m
solo en esa capa.

### ADR-020 — Panel trasero por encaje (Fase 2C)
**Contexto:** el mueble lleva panel trasero; debe ser
opcional y no alterar la geometría frontal ni requerir
un constructor nuevo de paneles.
**Decisión:**
- El contrato v1 extiende con `backPanel?:
  BackPanelConfig` (`enabled: boolean`, `thicknessMm:
  15 | 18`, `material?: MaterialSpec` opcional).
  Ausencia del campo o `enabled: false` = sin panel
  trasero (backward compatible).
- **Montaje por encaje (PROVISIONAL):** el trasero es
  un `Panel` con role `'back'` (id `panel-back`,
  `moduleId: null`) **incluido en `GeometryResult.panels`**
  — se renderiza como cualquier tablero, sin inventar
  geometría. Ocupa el plano posterior entre laterales y
  entre superior e inferior: tamaño
  `(ancho − 2t, alto − 2t, espesor)`, posición
  `(t, t, profundidad − espesor)`.
- Con panel trasero activado, los interiores se acortan
  a la **profundidad útil** (`profundidad − espesor
  trasero`): entrepaños y divisiones a `depthMm − th`;
  cajones con `innerDepth = depthMm − 2t − th` (la caja
  vive entre el frente y la cara frontal del trasero);
  barras de colgado centradas en la profundidad útil.
- Material default = estructura (`material-back`).
**Validación:** `ERR_BACK_PANEL_DEPTH` (defensivo con
los límites actuales: la profundidad debe admitir el
encaje).
**Consecuencias:** `GeometryTotals.panelCount` y el
volumen de tableros incluyen el trasero; **sin panel
trasero, la geometría es idéntica a Fase 2B** (cero
regresiones, verificado por tests).

### ADR-021 — Cámara, encuadre y estado de presentación (Fase 3A)

**Contexto:** la interfaz profesional necesita vistas
predefinidas, reencuadre automático al cambiar dimensiones
y mostrar/ocultar puertas con un ángulo de apertura, todo
sin mutar la configuración ni la geometría.

**Decisión:**
- Módulo puro `lib/camera-views.ts` (sin imports de
  three): `VIEW_DIRECTIONS` (front, side, isometric),
  `fitDistance` (distancia que encaja la caja AABB con
  margen ×1.12, considerando FOV y aspecto), `viewPosition`,
  `reframe` (mantiene la dirección y escala el offset) y
  `boxCenter`. Toda la matemática es unit testable sin
  WebGL (cierre analítico, monotonía, pureza).
- `CameraRig` dentro de `WardrobeScene`: gestiona la
  posición de cámara con `useLayoutEffect` (se aplica antes
  del primer pintado), monta en isométrica frontal, aplica
  `ViewRequest { view, nonce }` y recalcula el encuadre al
  cambiar `bounds`/aspecto manteniendo la dirección. Tras
  un arrastre, OrbitControls queda en modo libre.
- `VIEWER_CAMERA = { fov: 45, near: 0.05, far: 200 }` sin
  `position`: la posición es responsabilidad del rig, no de
  R3F, para que no la sobrescriba en cada render.
- Escena: luces clave (frontal-izquierda) + relleno
  (frontal-derecha), hemisférica y ambiente; sombras
  2048 con `bias −0.00015` / `normalBias 0.02` y orto
  ajustado al span; suelo receptor con `shadowMaterial`;
  IBL con `RoomEnvironment` (procedural, de three; **sin
  dependencias nuevas**); fondo `#e7e9ed` y rejilla.
- Estado de presentación en `WardrobeViewer`:
  `doorsVisible` (interruptor `aria-pressed` +
  `data-doors-visible`) y el slider de apertura 0–110°
  (trasladado del ConfigPanel al visor). **Ninguno de los
  dos muta `WardrobeConfig` ni `GeometryResult`.**
- `ConfigPanel`: secciones colapsables (`ConfigSection`,
  `aria-expanded`/`aria-controls`, abiertas por defecto).
- CSS: `.viewer-container` es caja absoluta (`inset: 0`)
  dentro de `.viewer`; los porcentajes de altura solo
  resuelven contra alturas explícitas, así que con
  `height:100% + min-height` la cadena de R3F colapsaba a
  `auto` y el lienzo quedaba en su tamaño intrínseco 2:1
  (359 de 648 px en escritorio; 182 de 506 px en móvil).

**Consecuencias:** la matemática de cámara tiene tests
unitarios; el encuadre se verifica midiendo la silueta
cromática en la suite Playwright (relleno y centrado, píxel
central del panel trasero); las funciones de presentación
siguen siendo puras respecto a la configuración.

### ADR-022 — Eje de bisagra en el plano medio del canto (Fase 3A)

**Contexto:** la verificación de intersecciones (SAT +
recorte Sutherland–Hodgman) demostró que, con el eje de
bisagra en el plano frontal (`z = 0`), las hojas de módulos
adyacentes se interpenetraban desde ~44° de apertura.

**Decisión:**
- `doorOpeningTransform` sitúa el eje en
  `hingeZmm = −door.thicknessMm / 2` (plano medio del
  canto de la hoja). Documentado en `engine/doors.ts` y
  `types/door.ts`.
- Con el eje en el plano medio: el punto medio del canto
  de bisagra permanece sobre el eje (rigidez), ninguna
  hoja excede `z ≤ 0` en ningún ángulo
  (`z máx = −t/2·(1−|cos α|)`, −5,9 mm a 110°), las hojas
  del mismo módulo nunca se solapan y las de módulos
  adyacentes quedan limpias en [0°, ~90°].

**Validación:** 7 tests de intersección en
`packages/geometry-core/tests/doors.test.ts` (ángulos
limpios estrictos 0–85°; zona de bloqueo acotada
90–110°: hoja-hoja ≤ 2746 mm², tirador-tirador ≤ 2016 mm²,
tirador-tablero ≤ 1320 mm², todo en la columna del divisor
x ≤ 20 mm).

**Consecuencias:** cambio de contrato **con evidencia**
(excepción permitida en AGENTS.md §3); el bloqueo mutuo
pasado ~88–92° es bloqueo físico real y queda como
decisión PROVISIONAL de carpintería (¿limitar el ángulo
común a ≤90°? — `docs/product-rules.md`).

### ADR-023 — Persistencia local de diseños (Fase 3B)

**Contexto:** la Fase 3B exige guardar, recuperar y
administrar diseños sin backend, autenticación ni
dependencias nuevas, dejando preparado el salto a un
almacenamiento remoto.

**Decisión:**
- Contrato `DesignRepository` + `SessionStore`
  (operaciones asíncronas) en `lib/designs/repository.ts`;
  el adaptador `localStorage`
  (`lib/designs/local-storage.ts`) es intercambiable sin
  tocar la lógica de negocio (`DesignLibrary`) ni la UI.
- `DesignRecord` con `id`, `nombre`, fechas ISO,
  `storageVersion` **propio** (independiente de
  `WARDROBE_CONFIG_SCHEMA_VERSION` del motor) y la
  `WardrobeConfig` completa. Nunca se persisten mallas,
  geometrías derivadas ni estado de presentación.
- La sesión de trabajo (borrador + diseño activo +
  cambios pendientes) vive en una clave propia
  (`furniconfig.session`), separada de la colección
  (`furniconfig.designs`), y se recupera al recargar.
- Guardado automático con debounce (1 s) sobre el diseño
  activo; `dirty` distingue "edición" de "cambio
  intencional" (abrir, restaurar, nuevo proyecto).

**Integridad:** todo lo leído y escrito pasa por
`validateWardrobeConfig`; versiones desconocidas se
rechazan como incompatibles **sin migración silenciosa y
sin pisar el dato**; los registros corruptos se
cuarentenan (visibles: no; eliminados: no); la cuota
llena o el almacenamiento bloqueado se traducen en
`DesignStorageError` con mensajes comprensibles; los ids
son deterministas (`design-N`) sin reutilización; toda
importación recibe un id nuevo (jamás sobrescribe) y
duplicar usa copia profunda.

**Consecuencias:** la Fase 3 (Laravel/MariaDB) puede
sustituir el adaptador por un repositorio remoto sin
cambiar la interfaz; sin dependencias nuevas; cobierto
por 37 pruebas unitarias y un escenario Playwright en
Chromium real (crear, autosave, recarga, CRUD, import/
export).

### ADR-024 — FurniConfig Studio: selección, historial y modo de edición (Fase 3C)

**Contexto:** la Fase 3C convierte la app en un espacio
de trabajo de diseño 3D ("Studio"): selección directa de
módulos, edición contextual, deshacer/rehacer y paneles
laterales, sin duplicar cálculos del motor ni romper la
persistencia de la Fase 3B.

**Decisión — estado del editor:**
- `useEditorHistory` (`hooks/use-editor-history.ts`): la
  `WardrobeConfig` vigente es el `present` de un
  `EditorHistory` (`lib/studio/history.ts`) con `past`/
  `future` **solo de configuraciones** (nunca geometría,
  cámara, selección ni recursos de Three.js). Límite 50
  pasos; editar desde un estado intermedio descarta el
  futuro; un commit sin cambio real no registra paso.
- Dos puertas de entrada: `update` (edición del usuario,
  registra paso) y `resetTo` (cambios EXTERNOS de
  proyecto desde la sesión 3B: hidratación, abrir,
  nuevo proyecto — historial nuevo, sin mezclar diseños).
- El guardado automático de la Fase 3B observa
  `history.present`: deshacer/rehacer también se guardan.
- Atajos Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z y Ctrl/Cmd+Y fuera
  de campos de formulario (dentro actúa el deshacer
  nativo del navegador).

**Decisión — selección de módulos:**
- La selección es el **id determinista del motor**
  (`module-N`), resuelto contra la geometría vigente en
  cada recálculo: se conserva si el módulo sigue
  existiendo, se limpia si desaparece (p. ej. al reducir
  el conteo) y se conserva de forma provisional si la
  configuración queda inválida (no puede verificarse).
- El mapeo clic → módulo usa los `moduleId` que el motor
  ya asigna a paneles, barras, cajones y puertas: la UI no
  deriva geometría por su cuenta. Los paneles globales
  (laterales, divisiones, superior, inferior, fondo) tienen
  `moduleId = null` y deseleccionan al pulsarlos.
- El clic se distingue de la órbita con un umbral de
  5 px entre pulsación y levantación; pulsar el vacío
  (`onPointerMissed`) deselecciona.
- El resaltado usa **copias auxiliares** de los materiales
  con emisivo azul: los materiales permanentes del motor
  no se modifican.
- "Encuadrar módulo" ajusta la cámara a la envolvente del
  módulo (paneles + barra + hojas) conservando la dirección
  de vista; solo se ejecuta cuando el usuario lo pide
  (nonce), nunca por recálculos.

**Decisión — panel contextual y modo:**
- Panel derecho: con selección muestra
  `ModulePropertiesPanel` (tipo, repisas, cajones, diámetro
  de barra compartido y dimensiones resueltas en solo
  lectura, editando con los helpers puros existentes); sin
  selección muestra indicación + `SummaryPanel`. Los
  errores de validación y el resumen permanecen visibles
  en ambos estados (compatibilidad con Fase 3B).
- Modo sencillo (predeterminado) / avanzado: es
  **organización de herramientas reales** — avanzado
  despliega la sección "Barra de colgado" y la nota del
  contrato; sencillo las mantiene plegadas. No duplica la
  aplicación ni el motor, ni inventa controles.
- Paneles laterales colapsables (`aria-expanded`/
  `aria-controls`); en pantallas ≤760 px arrancan
  contraídos para que el mueble sea lo primero.

**Consecuencias:** una futura familia de mueble
(p. ej. cocinas, muebles de TV) aportaría su contrato de
configuración, su función de derivación y su mapeo de
selección por familia; el historial, las barras del Studio
y la capa de presentación son agnósticos a la familia. Sin
arrastrre libre, sin edición de materiales por módulo y sin
historial persistido (en memoria de la sesión). Los anchos
individuales por módulo llegaron después, en la Fase 3D
(ADR-025). Cubierto por 36 pruebas unitarias nuevas
(historial, selección, paneles) y un escenario Playwright
con ~30 verificaciones y 10 capturas de evidencia.

### ADR-025 — Distribución flexible de anchos por módulo (Fase 3D)

**Problema:** los módulos se repartían uniformemente; un
clóset real necesita anchos distintos (p. ej. una sección
más ancha para colgar abrigos), también para usuarios sin
conocimientos técnicos y sin perder precisión geométrica.

**Decisión — contrato (extensión backward compatible de v1):**
- `ModuleConfig.widthMm?: number` = **ancho interior LIBRE**
  del módulo en mm enteros (el espacio útil entre divisiones
  y laterales; la misma semántica que `Module.widthMm`
  resuelto). NO es una medida nominal con tableros: los
  tableros son piezas separadas y la conservación exacta es
  `Σ(anchos libres) + divisiones + 2 · laterales = ancho
  exterior`.
- Ausencia = **automático**: el motor reparte por igual el
  espacio que queda (residuo entero de 1 mm a los primeros
  automáticos, de izquierda a derecha — la regla histórica).
  Se admiten anchos **parciales**: los declarados se
  respetan y los automáticos absorben el sobrante. Si todos
  declaran, la suma debe coincidir **exactamente** con el
  espacio disponible.
- Sin nueva versión de esquema: misma estrategia que
  `hangingRod`, `doors`, `backPanel` o `materials.drawer`
  (campos opcionales dentro de `schemaVersion: 1`). Los
  diseños antiguos (sin `widthMm`) producen salida idéntica
  byte a byte; los nuevos con anchos sobreviven a
  guardar/cargar, exportar/importar y deshacer/rehacer porque
  viven dentro de la propia `WardrobeConfig`.

**Decisión — motor (`engine/distribute.ts`):**
- `distributeModules` acepta `declaredWidthsMm?: readonly
  (number | undefined)[]` (una entrada por módulo). Valida
  cada declarado (entero, ≥ mínimo y ≤ máximo provisional) y
  la longitud de la lista.
- Límites en `WARDROBE_LIMITS.moduleWidthMm`: mínimo 300 mm
  (existente) y **máximo provisional 2000 mm** (nuevo,
  colapso/deflexión de tableros anchos; PROVISIONAL en
  `product-rules.md`). El máximo se aplica **solo a anchos
  declarados**: así los diseños antiguos (reparto uniforme
  del motor, p. ej. un módulo único de 3.964 mm) siguen
  siendo válidos. El máximo FÍSICO de un módulo declarado lo
  cierra además la validación de suma.
- Nuevos códigos de error (documentados, estables):
  `ERR_MODULE_WIDTH_INVALID` (valor no entero, fuera de rango
  o lista con longitud distinta) y `ERR_MODULE_WIDTH_SUM`
  (todos declaran y la suma no cuadra). El sobrante
  insuficiente para los automáticos reutiliza
  `ERR_MODULE_WIDTH_TOO_SMALL`.
- `maxFixedWidthMm(input + targetIndex)`: ancho máximo que
  puede declarar un módulo sin dejar sin espacio a los demás
  (acotado además por el máximo provisional). La UI consulta
  esta función en lugar de duplicar la aritmética.
- `resolveWardrobe` declara los anchos de la configuración;
  paneles, barras, cajones, puertas e ids (`module-N`) se
  recalculan con los algoritmos existentes, sin cambios.

**Decisión — capa web (helpers puros en `lib/config.ts`):**
- `setModuleWidth` fija el ancho de un módulo (acotado al
  rango válido); `releaseModuleWidth` lo devuelve a
  automático; `equalizeModuleWidths` libera todos (reparto
  uniforme, la "restablecer distribución uniforme");
  `fixSelectedRedistributeOthers` conserva el ancho actual
  del seleccionado y libera los demás ("repartir espacio
  restante"; si el ancho no encaja, no aplica nada).
- Para **evitar configuraciones inválidas**, `setDimension`
  (solo al cambiar el ancho del mueble) y `setModuleCount`
  conservan los fijados **solo si siguen encajando**
  (prueba con el motor); si no, liberan todos y vuelven a
  reparto uniforme. La recuperación es reversible con
  deshacer. `setModuleKind` conserva el ancho fijado.
- Studio: el panel contextual expone un control **numérico
  preciso** con borrador local (se aplica al salir del campo
  o con Enter; mientras se escribe se previsualizan los
  anchos resultantes de los demás módulos, calculados por el
  motor). Un valor fuera de rango no llega a aplicarse: se
  informa el máximo disponible. Las tarjetas de la lista
  muestran el ancho de cada módulo (chip "fijo"/"automático")
  y la sección "Distribución de anchos" resume el estado
  (incluido "no queda espacio por repartir" cuando todos
  están fijados) y ofrece Igualar / Repartir resto.
- Plantillas locales (`lib/studio/templates.ts`): catálogo
  pequeño de 4 distribuciones (básico, colgar, cajonera,
  mixto de cuatro módulos con 900 mm declarados) construido
  sobre los contratos existentes; aplicar cambia dimensiones
  y módulos, conserva materiales y opciones globales, es
  una sola edición deshacerable y siempre produce
  configuraciones válidas (garantizado por tests, con
  espesores 15 y 18 mm).

**Consecuencias:** el reparto sigue siendo determinista y
exacto en mm enteros; la UI no calcula geometría (consulta
`distributeModules`/`maxFixedWidthMm`). Queda pendiente, si
la carpintería lo confirma, un máximo de tablero por
deflexión y el arrastre libre de separadores (priorizado el
control numérico). Cobertura: 27 pruebas nuevas en el motor,
~30 en la web (helpers, plantillas, persistencia, historial
y panel contextual) y 21 verificaciones visuales nuevas con
3 capturas de evidencia.

### ADR-026 — Experiencia de diseño simplificada: categorías y visor estable (Fase 3E)

**Problema:** el panel izquierdo era un formulario único de
9 secciones mezcladas (dimensiones, módulos, distribución,
plantillas, puertas, panel trasero, barra, materiales y
proyectos). Para llegar a "Proyectos" había que hacer scroll
(el propio `App.tsx` hacía `scrollIntoView`); las medidas
convivían con la apariencia y la gestión de archivos; el
visor quedaba reducido entre dos paneles y la página entera
se desplazaba al hacer scroll en el panel.

**Decisión — cuatro categorías (pestañas accesibles):**
- El panel se organiza en **Medidas** (dimensiones, número
  de módulos, distribución de anchos, plantillas), **Interior**
  (contenido de cada módulo y barra de colgado), **Apariencia**
  (puertas, panel trasero, materiales) y **Mis diseños**
  (proyectos). Todas las herramientas existentes se
  conservan: es organización, no recorte.
- Pestañas con patrón WAI-ARIA (`role=tablist/tab/tabpanel`,
  `aria-selected`, `aria-controls/labelledby`, roving
  `tabIndex`, flechas/Home/End). Lógica pura y determinista
  en `lib/studio/tabs.ts` (`nextTabOnArrowKey`), testable sin
  navegador.
- Los cuatro paneles permanecen montados en el DOM (los
  inactivos con `hidden`): no se duplica estado ni se pierde
  funcionalidad al cambiar de categoría; el estado de
  secciones colapsadas y la configuración se conservan.
- El estado de la pestaña activa se eleva a `App.tsx` y se
  pasa controlado a `ConfigPanel` (una sola fuente de
  verdad). "Proyectos" de la barra superior abre la
  categoría "Mis diseños" (sin `scrollIntoView`: el panel
  tiene scroll interno).

**Decisión — visor central estable:**
- `.app` pasa a altura de ventana completa
  (`100dvh`, filas `auto / 1fr / auto`): cabecera y pie
  fijos, fila central flexible. Los paneles laterales
  tienen **scroll interno** (`.panel-body { overflow-y:
  auto }`) y el visor llena el espacio restante sin
  desplazar la página.
- En ≤1200 px el flujo se apila con el **visor primero**
  (`order: -1`) y los paneles debajo; la página scrollea
  de forma natural.
- Se conservan controles de cámara, selección directa 3D,
  resaltado de módulos y reencuadre automático (sin cambios
  de cámara al navegar, verificado con píxeles).

**Decisión — lenguaje y ayuda:**
- Textos de ayuda breves bajo la barra de pestañas (uno por
  categoría). Notas provisionales y parámetros técnicos
  (holgura, diámetro de barra, esespesores) se mantienen
  visibles pero de-emphasizados; el modo avanzado los
  despliega.

**Consecuencias:** ninguna funcionalidad perdida; todos los
`data-*`, etiquetas y roles que usan las pruebas se
conservan. La iluminación se verificó con evidencia (10
capturas nuevas) y no presentaba defectos que corregir.
Cobertura: 15 pruebas unitarias nuevas (lógica de pestañas +
estructura SSR) y 17 verificaciones visuales nuevas con 10
capturas de evidencia.

## 4. Flujo de cálculo detallado

1. `validateWardrobeConfig(input: unknown)` — validación runtime completa
   (tipos, rangos, conteos, espesores 15|18, versión de contrato).
2. `resolveWardrobe(config)`:
   - `distributeModules`: `anchoUtil = anchoTotal − 2·tLateral`;
     `disponible = anchoUtil − (N−1)·tDivision`; reparte entero + residuo.
   - Altura interior de módulos: `altoTotal − 2·tEstructura`.
   - Materiales resueltos con ids `material-structure` / `material-interior`.
3. `buildPanels(wardrobe)`:
   - Paneles globales: laterales (0 y `ancho − t`), inferior (y=0), superior
     (`y = alto − t`), todos de espesor `t` de estructura.
   - Por módulo: entrepaños (solo `kind: 'shelves'`) distribuidos uniformemente
     en la altura interior; divisiones entre módulos consecutivos (espesor
     completo, posición x al final del módulo anterior).
   `buildRods(wardrobe)`: una barra cilíndrica por módulo
   "hanging" (componente no panelar, en `rods`).
   `buildDrawers(wardrobe)`: por módulo "drawers", N cajones
   (`distributeDrawerBands`: bandas de altura con residuo
   de abajo hacia arriba); cada cajón = 5 paneles con
   roles `drawer-*` (frente, 2 laterales, trasera, fondo)
   incluidos en `panels`, relacionados por un
   `DrawerAssembly` en `drawers`.
   `buildDoors(wardrobe)`: si `doors` está presente en la
   configuración, una hoja (o dos) por módulo montada
   sobre el frente (`z ∈ [−espesor, 0]`) con su tirador
   cilíndrico; componentes separados en `doors`/`handles`
   (posición cerrada; la apertura es
   `doorOpeningTransform`, una transformación pura de
   presentación).
   Si `backPanel.enabled`, el panel trasero por encaje
   entra en `panels` (role `back`) y los interiores se
   acortan a la profundidad útil.
4. `calculateGeometry` ensambla `GeometryResult` con totales (conteo y volumen
   de paneles en mm³ —incluidas las piezas de cajón y el
   panel trasero—, útil para estimaciones futuras de
   material; barras, cajones, puertas y tiradores con
   sus propios conteos).

## 5. Invariantes geométricos (verificados con tests)

- Suma de anchos horizontales (laterales + divisiones + módulos) = ancho total.
- Los paneles nunca se solapan entre sí por construcción
  (las piezas de un cajón se tocan como máximo; los cajones
  entre sí quedan separados por la holgura de 3 mm).
- Todo panel referencia un material existente en `wardrobe.materials`
  (incluidos `material-rod`, `material-drawer`, `material-door`
  y `material-back` cuando aplican).
- Todo `partId` de un `DrawerAssembly` existe en `panels`, y
  todo panel `drawer-*` pertenece a exactamente un ensamblaje.
- Toda puerta y todo tirador referencian materiales existentes
  (`material-door`, `material-handle`); cada tirador pertenece
  a exactamente una puerta (`doorId` existe en `doors`).
- Las hojas cerradas ocupan `z ∈ [−espesor, 0]` (montaje sobre
  el frente): nunca intersecan paneles, barras ni cajones.
- Con panel trasero activado, ningún panel interior penetra el
  plano posterior del trasero (encaje: `z ≤ profundidad − th`).
- Misma entrada → `GeometryResult` idéntico (determinismo, verificado por test).

## 6. Capa de presentación (`apps/web`, Fase 1)

```
WardrobeConfig (estado de UI, actualizaciones inmutables)
       │
       ▼
validateWardrobeConfig() ──▶ errores de forma (panel de errores)
       │ ok
       ▼
calculateGeometry() ──▶ GeometryResult   ──▶ GeometryError capturado
       │                                          (estado inválido)
       ▼
toRenderablePanels()   (mm → m, esquina mínima → centro)
toRenderableRods()     (mm → m, cilindros por eje+longitud+diámetro)
toRenderableDoors()    (mm → m; hojas y tiradores, posición cerrada)
toRenderableHandles()  (mm → m, centro del cilindro)
       │
       ▼
React Three Fiber: un Box por Panel/hoja, un Cylinder por barra y
tirador, group por puerta rotado sobre su eje de bisagra
(doorOpeningTransform + ángulo de UI), OrbitControls (Drei),
geometrías y materiales reutilizados, carga diferida (lazy).
```

Reglas de la capa: mm → m solo en `lib/units.ts`; no mutar la
configuración; no inventar geometría; el motor es la fuente única
de verdad de dimensiones y paneles. La matemática de cámara vive
en `lib/camera-views.ts` (pura, sin three; Fase 3A) y el estado de
presentación (visibilidad de puertas, ángulo de apertura, vista
predefinida) es UI: tampoco toca `WardrobeConfig` ni
`GeometryResult`.

### Estructura del Studio (Fase 3C)

```
TopBar (acciones del proyecto, deshacer/rehacer, estado)
┌──────────────┬──────────────────────────┬──────────────┐
│ Panel        │ WardrobeViewer           │ Panel        │
│ izquierdo    │ (selección, resaltado,   │ derecho      │
│ ConfigPanel  │  vistas, encuadre)       │ contexto +   │
│ + diseños    │                          │ resumen      │
└──────────────┴──────────────────────────┴──────────────┘
BottomBar (dimensiones, módulos, validación, guardado)
```

Estado del editor en `App.tsx`: `useEditorHistory`
(historial de configuraciones) + selección por id
resuelto contra la geometría + modo sencillo/avanzado +
paneles colapsables. La capa pura del Studio vive en
`lib/studio/` (`history.ts`, `selection.ts`); los
componentes en `components/studio/`. La selección solo
existe mientras hay geometría calculada por el motor: si
la configuración es inválida, el visor muestra el estado
controlado y el panel derecho concentra los errores.

## 7. No-go explícitos de esta fase

- Sin backend, base de datos, autenticación, pagos, cotizaciones
  (Fases 3–4).
- Sin editor CAD ni características de carpintería pendientes de
  validación (herrajes reales, guías comerciales de cajón,
  bisagras comerciales).
- Sin animaciones de apertura de cajones (permanecen cerrados).
- Sin puertas corredizas ni puertas con varios paneles
  (solo hojas lisas de 1–2 leaves en esta fase).
- Sin cotizaciones: el volumen de tableros se muestra como dato
  geométrico, no como precio.
