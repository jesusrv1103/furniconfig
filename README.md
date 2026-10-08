# FurniConfig

Plataforma SaaS B2B para carpinterías y fabricantes de muebles personalizados.
El usuario diseña muebles en 3D, modifica medidas, materiales y distribuciones,
visualiza los cambios inmediatamente y solicita cotizaciones.

**Primer producto:** clósets rectos modulares.

## Estado actual

**Fase 2B — Cajoneras paramétricas** (completada).
Motor paramétrico puro (`packages/geometry-core`) con
paneles estructurales, entrepaños, barras de colgado
(Fase 2A) y cajoneras (Fase 2B: frentes, laterales,
traseras y fondos como ensamblajes identificables);
visualizador 3D (`apps/web`, React + Three.js).
No hay backend, autenticación, pagos ni cotizaciones
todavía (Fases 3–4).

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
│       │   ├── engine/       # funciones puras: distribución, paneles, barras, cajones
│       │   └── types/        # Wardrobe, Module, Panel, HangingRod, DrawerAssembly, GeometryResult
│       └── tests/            # pruebas unitarias (Vitest)
└── apps/
    └── web/                  # visualizador 3D (React + Vite + React Three Fiber)
        ├── src/
        │   ├── components/   # ConfigPanel, SummaryPanel, WardrobeScene…
        │   ├── lib/          # units (mm→m), panels-to-mesh, materials, config, derive
        │   └── App.tsx       # estado + validación derivada
        ├── tests/            # unidades, transformación, config, render + visual/ (Playwright)
        └── index.html
```

## Documentación clave

- [`docs/architecture.md`](docs/architecture.md) — decisiones de arquitectura (ADR) y flujo de cálculo.
- [`docs/product-rules.md`](docs/product-rules.md) — reglas confirmadas y límites **provisionales** pendientes de validar con carpintería.
- [`docs/roadmap.md`](docs/roadmap.md) — fases del proyecto.
