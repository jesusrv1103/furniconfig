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
       │
       ▼
GeometryResult { wardrobe, panels, totals }
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
│       │   │   ├── wardrobe.ts      # Wardrobe (resuelta)
│       │   │   └── geometry-result.ts
│       │   ├── contract/            # frontera de entrada
│       │   │   ├── wardrobe-config.ts   # contrato versionado (schemaVersion)
│       │   │   ├── limits.ts            # límites provisionales (¡validar!)
│       │   │   └── validate.ts          # validación runtime de unknown
│       │   └── engine/              # funciones puras
│       │       ├── distribute.ts    # anchos útiles y distribución de módulos
│       │       ├── panels.ts        # generación de paneles
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
4. `calculateGeometry` ensambla `GeometryResult` con totales (conteo y volumen
   de paneles en mm³, útil para estimaciones futuras de material).

## 5. Invariantes geométricos (verificados con tests)

- Suma de anchos horizontales (laterales + divisiones + módulos) = ancho total.
- Los paneles nunca se solapan entre sí por construcción.
- Todo panel referencia un material existente en `wardrobe.materials`.
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
       │
       ▼
React Three Fiber: un Box por Panel, OrbitControls (Drei),
geometrías y materiales reutilizados, carga diferida (lazy).
```

Reglas de la capa: mm → m solo en `lib/units.ts`; no mutar la
configuración; no inventar geometría; el motor es la fuente única
de verdad de dimensiones y paneles.

## 7. No-go explícitos de esta fase

- Sin backend, base de datos, autenticación, pagos, cotizaciones
  (Fases 3–4).
- Sin editor CAD ni características de carpintería pendientes de
  validación (panel trasero, herrajes, cajas de cajón, barras de
  colgado).
- Sin cotizaciones: el volumen de tableros se muestra como dato
  geométrico, no como precio.
