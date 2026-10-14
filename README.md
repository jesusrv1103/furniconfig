# FurniConfig

Plataforma SaaS B2B para carpinterías y fabricantes de muebles personalizados.
El usuario diseña muebles en 3D, modifica medidas, materiales y distribuciones,
visualiza los cambios inmediatamente y solicita cotizaciones.

**Primer producto:** clósets rectos modulares.

---

## 🇪🇸 Español

### Estado actual

**Fase 3F.2 — Arrastre visual de separadores** completada e integrada en `main`;
Fase 3F.1 (cotas visuales 3D) completada e integrada.

**Motor paramétrico puro** (`packages/geometry-core`) con:
- Paneles estructurales, entrepaños, barras de colgado (Fase 2A)
- Cajoneras (Fase 2B)
- Puertas abatibles con tiradores (Fase 2C: hojas de 1–2 por módulo,
  montadas sobre el frente, apertura 0–110°, eje de bisagra en plano medio)
- Panel trasero opcional por encaje
- **Anchos individuales por módulo** (Fase 3D: ancho interior libre en mm
  enteros, compatible con reparto uniforme histórico, suma exacta y
  códigos de error estables)
- **Cotas visuales 3D** (Fase 3F.1: motor puro `lib/studio/dimensions.ts`
  con cotas generales y contextuales, render CAD con líneas, flechas y
  etiquetas, unidades mm/cm, control "Cotas" en visor)
- **Arrastre visual de separadores** (Fase 3F.2: motor puro
  `lib/studio/separators.ts` — `computeDragResult`, cuantización 1/10 mm,
  clamp; componente 3D `DividerDragHandle` con `pointer capture`,
  raycasting plano Y=0, Escape; botón "Arrastre divisores" + selector
  1/10 mm en barra; historial una entrada por arrastre, Escape cancela)

La interfaz es un **estudio de diseño 3D** (`apps/web`, React + Three.js)
organizado en **cuatro categorías** (Fase 3E, ADR-026):
Medidas, Interior, Apariencia y Mis diseños, con pestañas accesibles
WAI-ARIA (flechas/Home/End), visor central estable con scroll interno
en los paneles (el visor nunca desplaza la página; en pantallas ≤1200 px
el visor va primero), selección directa de módulos por clic (resaltado
y umbral anti-drag), vistas predefinidas, "Ajustar" y "Encuadrar módulo",
**cotas visuales sobre el modelo** (Fase 3F.1, ADR-027: ancho/alto/
profundidad totales y del módulo seleccionado, etiquetas en mm o cm de
presentación y control para mostrar u ocultarlas), **arrastre visual de
separadores** (Fase 3F.2, ADR-028: indicador por división, arrastre con
`pointer capture`, raycasting plano Y=0, modo 1/10 mm, historial una
entrada, Escape cancela), barra superior con deshacer/rehacer (historial
acotado de configuraciones) y atajo a "Mis diseños", panel contextual
editable a la derecha (tipo, repisas, cajones, barra y ancho del módulo
con previsualización de los módulos afectados), barra inferior de estado,
paneles laterales colapsables y modo sencillo/avanzado.

Sección "Proyectos": guardado local de diseños (`localStorage` vía
contrato `DesignRepository`) con guardado automático, recuperación de
sesión tras recargar, CRUD con confirmaciones y export/importación de
JSON validado.

CI en GitHub Actions para Pull Requests hacia `main` (npm ci, typecheck,
pruebas y build; Node 22, sin secretos).

**No hay backend, autenticación, pagos ni cotizaciones todavía** (Fases
3–4 del roadmap).

---

## 🇺🇸 English

### Current Status

**Phase 3F.2 — Visual Separator Dragging** completed and merged into
`main`; Phase 3F.1 (3D visual dimensions) completed and merged.

**Pure parametric engine** (`packages/geometry-core`) featuring:
- Structural panels, shelves, hanging rods (Phase 2A)
- Drawer assemblies (Phase 2B)
- Hinged doors with handles (Phase 2C: 1–2 leaves per module, front-mounted,
  0–110° opening, hinge axis on panel mid-plane)
- Optional back panel via dado joint
- **Per-module individual widths** (Phase 3D: free interior width in whole
  mm, compatible with historical uniform distribution, exact sum and
  stable error codes)
- **3D Visual Dimensions** (Phase 3F.1: pure engine `lib/studio/dimensions.ts`
  with general and contextual dimensions, CAD-style rendering with lines,
  arrows and labels, mm/cm units, "Dimensions" toggle in viewer)
- **Visual Separator Dragging** (Phase 3F.2: pure engine
  `lib/studio/separators.ts` — `computeDragResult`, 1/10 mm quantization,
  clamp; 3D component `DividerDragHandle` with `pointer capture`,
  Y=0 plane raycasting, Escape; "Drag Separators" button + 1/10 mm
  selector in toolbar; one history entry per drag, Escape cancels)

The interface is a **3D design studio** (`apps/web`, React + Three.js)
organized in **four categories** (Phase 3E, ADR-026): Dimensions,
Interior, Appearance and My Designs, with accessible WAI-ARIA tabs
(arrows/Home/End), stable central viewer with internal panel scrolling
(viewer never scrolls page; on screens ≤1200px viewer goes first),
direct module selection by click (highlight and anti-drag threshold),
predefined views, "Fit" and "Frame Module", **visual dimensions on
model** (Phase 3F.1, ADR-027: total width/height/depth and selected
module dimensions, labels in mm or cm, toggle to show/hide), **visual
separator dragging** (Phase 3F.2, ADR-028: indicator per division, drag
with `pointer capture`, Y=0 plane raycasting, 1/10 mm mode, one history
entry per drag, Escape cancels), top bar with undo/redo (bounded config
history) and shortcut to "My Designs", editable right contextual panel
(type, shelves, drawers, rod and module width with affected modules
preview), bottom status bar, collapsible side panels and simple/advanced
mode.

"Projects" section: local design persistence (`localStorage` via
`DesignRepository` contract) with autosave, session recovery on reload,
CRUD with confirmations and validated JSON export/import.

CI in GitHub Actions for Pull Requests to `main` (npm ci, typecheck,
tests and build; Node 22, no secrets).

**No backend, authentication, payments or quoting yet** (Roadmap Phases
3–4).

---

## Stack

- Frontend: React 19 + TypeScript + Vite + Three.js / React Three Fiber
- Geometric Engine: Pure TypeScript, independent of frontend
- Backend (future): Laravel · Database (future): MariaDB
- Tests: Vitest (engine + web) · Playwright + Chromium (visual)

---

## Commands

Requires **Node.js >= 22.12** and npm >= 10. Uses **npm workspaces**
(no pnpm needed).

```bash
npm install          # installs dependencies for all packages
npm test             # runs Vitest across all packages
npm run typecheck    # type checking (tsc --noEmit)
npm run build        # compiles packages to dist/
npm run clean        # removes build and node_modules

# Web visualizer (apps/web)
npm run dev --workspace @furniconfig/web      # dev server (http://localhost:5173)
npm run build --workspace @furniconfig/web    # production build
npm run preview --workspace @furniconfig/web  # preview production build
npm run test:visual --workspace @furniconfig/web # visual tests (Playwright + Chromium)
```

---

## Units & Coordinates Convention

- Internal unit: **whole millimeters** throughout the system.
- Axes: **X = width**, **Y = height**, **Z = depth**.
- Origin: bottom-left-front corner of the wardrobe; panel positions
  correspond to their minimum corner (x, y, z).

---

## Project Structure

```
furniconfig/
├── docs/                     # decisions and product rules
│   ├── architecture.md       # architecture and ADRs
│   ├── product-rules.md      # product rules and limits
│   └── roadmap.md            # phase plan
├── packages/
│   └── geometry-core/        # pure parametric engine (mm, no Three.js)
│       ├── src/
│       │   ├── contract/     # versioned config contract + validation
│       │   ├── engine/       # pure functions: distribution, panels, rods, drawers, doors
│       │   └── types/        # Wardrobe, Module, Panel, HangingRod, DrawerAssembly, Door, GeometryResult
│       └── tests/            # unit tests (Vitest)
└── apps/
    └── web/                  # FurniConfig Studio (React + Vite + React Three Fiber)
        ├── src/
        │   ├── components/   # ConfigPanel, SummaryPanel, DesignSection, WardrobeScene…
        │   │   └── studio/   # TopBar, BottomBar, PanelToolbar, ModulePropertiesPanel
        │   ├── hooks/        # use-editor-history (undo/redo), use-design-session (designs)
        │   ├── lib/          # units (mm→m), panels-to-mesh, materials, config, derive, camera-views
        │   │   ├── designs/  # 3B persistence (repository, library, storage)
        │   │   └── studio/   # pure editor layer (history, selection, tabs)
        │   └── App.tsx       # Studio state + derived validation
        ├── tests/            # units, persistence, render + visual/ (Playwright)
        └── index.html
```

---

## Key Documentation

- [`docs/architecture.md`](docs/architecture.md) — architecture decisions (ADRs) and calculation flow.
- [`docs/product-rules.md`](docs/product-rules.md) — confirmed product rules and **provisional** limits pending carpentry validation.
- [`docs/roadmap.md`](docs/roadmap.md) — project phases plan.

---

## Community

We welcome contributions from developers, designers, carpenters and students.
See our community guides:

- [Contributing Guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)
- [Getting Started for Contributors](docs/community/GETTING_STARTED.md)
- [Architecture Guide](docs/community/ARCHITECTURE_GUIDE.md)
- [Community Roadmap](docs/community/ROADMAP.md)

---

## License

MIT License (proposed, pending approval). See [LICENSE_EVALUATION](docs/community/LICENSE_EVALUATION.md) for evaluation details.

---

## Security

See [Security Policy](SECURITY.md) for vulnerability reporting.