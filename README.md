# FurniConfig

Plataforma SaaS B2B para carpinterías y fabricantes de muebles personalizados.
El usuario diseña muebles en 3D, modifica medidas, materiales y distribuciones,
visualiza los cambios inmediatamente y solicita cotizaciones.

**Primer producto:** clósets rectos modulares.

## Estado actual

**Fase 3E — Experiencia de diseño simplificada** (completada).
Motor paramétrico puro (`packages/geometry-core`) con
paneles estructurales, entrepaños, barras de colgado
(Fase 2A), cajoneras (Fase 2B) y puertas abatibles
con tiradores (Fase 2C: hojas de 1–2 por módulo,
montadas sobre el frente, con apertura pura de
presentación 0–110° y eje de bisagra en el plano medio
del canto — corrección con evidencia de la Fase 3A);
panel trasero opcional por encaje; y **anchos
individuales por módulo** (Fase 3D: ancho interior libre
en mm enteros, compatible con el reparto uniforme
histórico, con suma exacta y códigos de error
estables). La interfaz es un **estudio de diseño 3D**
(`apps/web`, React + Three.js) organizado en **cuatro
categorías** (Fase 3E, ADR-026): Medidas, Interior,
Apariencia y Mis diseños, con pestañas accesibles
WAI-ARIA (flechas/Home/End), visor central estable con
scroll interno en los paneles (el visor nunca desplaza la
página; en pantallas ≤1200 px el visor va primero),
selección directa de módulos por clic (resaltado y umbral
anti-drag), vistas predefinidas, "Ajustar" y "Encuadrar
módulo", barra superior con deshacer/rehacer (historial
acotado de configuraciones) y atajo a "Mis diseños",
panel contextual editable a la derecha (tipo, repisas,
cajones, barra y ancho del módulo con previsualización de
los módulos afectados), barra inferior de estado, paneles
laterales colapsables y modo sencillo/avanzado. Sección
"Proyectos": guardado local de diseños (`localStorage`
vía contrato `DesignRepository`) con guardado
automático, recuperación de sesión tras recargar, CRUD
con confirmaciones y export/importación de JSON
validado. CI en GitHub Actions para Pull Requests hacia
`main` (npm ci, typecheck, pruebas y build; Node 22, sin
secretos). No hay backend, autenticación, pagos ni
cotizaciones todavía (Fases 3–4).

## Stack

- Frontend: React 19 + TypeScript + Vite + Three.js / React Three Fiber
- Motor geométrico: TypeScript puro, independiente del frontend
- Backend (futuro): Laravel · Base de datos (futura): MariaDB
- Pruebas: Vitest (motor y web) · Playwright + Chromium (visuales)

## Comandos

Requiere **Node.js >= 22.12** y npm >= 10. Se usa **npm workspaces** (no hace falta pnpm).

```bash
npm install          # instala dependencias de todos los paquetes
npm test             # ejecuta Vitest en todos los paquetes
npm run typecheck    # verificación de tipos (tsc --noEmit)
npm run build        # compila los paquetes a dist/
npm run clean        # elimina build y node_modules

# Visualizador web (apps/web)
npm run dev --workspace @furniconfig/web     # servidor de desarrollo (http://localhost:5173)
npm run build --workspace @furniconfig/web   # build de producción
npm run preview --workspace @furniconfig/web # previsualizar el build
npm run test:visual --workspace @furniconfig/web # pruebas visuales reales (Playwright + Chromium)
```

## Convención de unidades y coordenadas

- Unidad interna: **milímetros enteros** en todo el sistema.
- Ejes: **X = ancho**, **Y = alto**, **Z = profundidad**.
- Origen: esquina inferior-izquierda-frontal del mueble; las posiciones de los
  paneles corresponden a su esquina mínima (x, y, z).

## Estructura

```
furniconfig/
├── docs/                     # decisiones y reglas de producto
│   ├── architecture.md       # arquitectura y ADRs
│   ├── product-rules.md      # reglas del producto y límites
│   └── roadmap.md            # plan por fases
├── packages/
│   └── geometry-core/        # motor paramétrico puro (mm, sin Three.js)
│       ├── src/
│       │   ├── contract/     # contrato de configuración versionado + validación
│       │   ├── engine/       # funciones puras: distribución, paneles, barras, cajones, puertas
│       │   └── types/        # Wardrobe, Module, Panel, HangingRod, DrawerAssembly, Door, GeometryResult
│       └── tests/            # pruebas unitarias (Vitest)
└── apps/
    └── web/                  # FurniConfig Studio (React + Vite + React Three Fiber)
        ├── src/
        │   ├── components/   # ConfigPanel, SummaryPanel, DesignSection, WardrobeScene…
        │   │   └── studio/   # TopBar, BottomBar, PanelToolbar, ModulePropertiesPanel
        │   ├── hooks/        # use-editor-history (deshacer/rehacer), use-design-session (diseños)
        │   ├── lib/          # units (mm→m), panels-to-mesh, materials, config, derive, camera-views
        │   │   ├── designs/  # persistencia 3B (repositorio, biblioteca, storage)
        │   │   └── studio/   # capa pura del editor (history, selection, tabs)
        │   └── App.tsx       # estado del Studio + validación derivada
        ├── tests/            # unidades, persistencia, render + visual/ (Playwright)
        └── index.html
```

## Documentación clave

- [`docs/architecture.md`](docs/architecture.md) — decisiones de arquitectura (ADR) y flujo de cálculo.
- [`docs/product-rules.md`](docs/product-rules.md) — reglas confirmadas y límites **provisionales** pendientes de validar con carpintería.
- [`docs/roadmap.md`](docs/roadmap.md) — fases del proyecto.
