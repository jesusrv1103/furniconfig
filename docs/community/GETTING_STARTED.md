# Guía de Inicio para Colaboradores — FurniConfig

> **Idioma principal:** Español. Incluye resumen en inglés al final.

---

## 🎯 ¿Qué es FurniConfig?

FurniConfig es una plataforma SaaS B2B para carpinterías y fabricantes de muebles personalizados. El primer producto es un diseñador de **clósets rectos modulares** en 3D.

**Stack**: React 19 + TypeScript + Vite + Three.js (React Three Fiber) + Motor geométrico puro en TypeScript (`packages/geometry-core`).

---

## 🚀 Configuración rápida (5 min)

### Requisitos

- **Node.js >= 22.12** (LTS)
- **npm >= 10** (usa workspaces, no pnpm)
- **Chromium/Chrome** (para pruebas visuales)

```bash
# 1. Clona tu fork
git clone https://github.com/TU_USUARIO/furniconfig.git
cd furniconfig

# 2. Instala dependencias (workspaces)
npm install

# 3. Verifica que todo compila y testa
npm run typecheck
npm test
npm run build

# 4. Levanta el visualizador en desarrollo
npm run dev --workspace @furniconfig/web
# Abre http://localhost:5173
```

### Pruebas visuales (opcional, local)

```bash
npm run test:visual --workspace @furniconfig/web
# Requiere Chromium/Chrome instalado
# Tarda varios minutos, genera capturas en /tmp/opencode/fase3a/
```

---

## 🏗️ Entendiendo la arquitectura (5 min)

### Dos paquetes principales

```
furniconfig/
├── packages/
│   └── geometry-core/      # 🧠 Motor puro (TypeScript, sin Three.js/React)
│       ├── src/
│       │   ├── contract/   # Contrato de configuración versionado + validación
│       │   ├── engine/     # Funciones puras: distribución, paneles, barras, cajones, puertas
│       │   └── types/      # Wardrobe, Module, Panel, HangingRod, DrawerAssembly, Door, GeometryResult
│       └── tests/          # 179 tests unitarios (Vitest)
└── apps/
    └── web/                # 🎨 Studio 3D (React + Three.js / R3F)
        ├── src/
        │   ├── components/  # ConfigPanel, WardrobeScene, WardrobeViewer…
        │   ├── hooks/       # use-editor-history, use-design-session
        │   ├── lib/         # units, panels-to-mesh, materials, derive, camera-views
        │   └── App.tsx      # Estado del Studio + validación derivada
        ├── tests/           # 164 tests (unidades + visual-check helpers)
        └── tests/visual/   # Playwright + Chromium (200 checks visuales)
```

### Flujo de datos (simplificado)

```
Usuario edita en UI
      │
      ▼
src/lib/config.ts (funciones puras: setModuleWidth, addModule, etc.)
      │
      ▼
validateWardrobeConfig() → WardrobeConfig válida
      │
      ▼
geometry-core engine → GeometryResult (paneles, barras, cajones, puertas)
      │
      ▼
apps/web: panels-to-mesh.ts → Three.js meshes → WardrobeScene (R3F)
```

---

## 🧪 Cómo probar tus cambios

### Pruebas unitarias (rápidas, ~2 seg)

```bash
npm test                    # Todas (343 tests: 179 core + 164 web)
npm test --workspace @furniconfig/geometry-core  # Solo motor (179)
npm test --workspace @furniconfig/web            # Solo web (164)
```

### Typecheck + Build

```bash
npm run typecheck   # tsc --noEmit en todos los workspaces
npm run build       # Compila a dist/
```

### Pruebas visuales (Playwright)

```bash
npm run test:visual --workspace @furniconfig/web
# Requiere Chromium/Chrome
# Tarda 3-5 min, genera capturas en /tmp/opencode/fase3a/
# 200 checks visuales (196 base + 4 fallos corregidos + 11 3F.2)
```

---

## 🧭 Encontrar dónde tocar

### ¿Quieres tocar el motor geométrico?

```
packages/geometry-core/src/
├── contract/          # Validación, contratos versionados
├── engine/
│   ├── distribution.ts      # Reparto de anchos
│   ├── panels.ts            # Generación de paneles
│   ├── hangingRods.ts       # Barras de colgado
│   ├── drawers.ts           # Cajoneras
│   ├── doors.ts             # Puertas abatibles
│   └── geometry.ts          # Orquestador principal
└── types/                  # Tipos compartidos
```

### ¿Quieres tocar la UI 3D?

```
apps/web/src/
├── components/
│   ├── WardrobeScene.tsx      # Escena 3D (R3F)
│   ├── WardrobeViewer.tsx     # Visor + controles + clickGuard
│   ├── WardrobeDimensions.tsx # Cotas 3D (HTML overlay)
│   ├── DividerDragHandle.tsx  # Arrastre separadores 3F.2
│   └── studio/                # Toolbars, paneles, tarjetas
├── hooks/
│   ├── use-editor-history.ts  # Deshacer/Rehacer
│   └── use-design-session.ts  # Persistencia diseños
├── lib/
│   ├── panels-to-mesh.ts      # Conversión paneles → Three.js meshes
│   ├── units.ts               # mm ↔ m
│   ├── config.ts              # Funciones puras de config
│   └── studio/                # Capa pura: history, selection, tabs
└── App.tsx                    # Estado raíz + validación derivada
```

### ¿Quieres tocar pruebas visuales?

```
apps/web/tests/visual/visual-check.mjs
# 200 checks en una sola función async
# Usa Playwright + Chromium
# Genera capturas en /tmp/opencode/fase3a/
```

---

## 🧪 Escribir pruebas

### Unitarias (Vitest)

```typescript
// packages/geometry-core/tests/distribution.test.ts
import { describe, expect, it } from 'vitest'
import { distributeModules } from '../src/engine/distribution.js'

describe('distributeModules', () => {
  it('reparte uniformemente 3 módulos en 2400mm', () => {
    const result = distributeModules({ widthMm: 2400, moduleCount: 3, ... })
    expect(result.moduleWidths).toEqual([800, 800, 800])
  })
})
```

### Helpers visuales (Playwright)

```javascript
// apps/web/tests/visual/visual-check.mjs
async function shootStable(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  saveShot(name, await page.locator('canvas').screenshot())
}
```

---

## 🌿 Flujo de contribución (resumen)

1. **Fork** → Clona tu fork.
2. **Rama** → `fix/...` | `feat/...` | `docs/...` | `refactor/...` | `test/...`
3. **Commits** → Conventional Commits (`fix:`, `feat:`, `docs:`, `refactor:`, `test:`).
4. **Verifica local** → `npm run typecheck && npm test && npm run build`.
5. **PR** → Plantilla + checklist + CI verde.
6. **Revisión** → Mantenedor revisa + aprueba → Merge commit (no squash).

---

## 🆘 ¿Atascado? ¿Dudas?

- **Issues**: [GitHub Issues](https://github.com/jesusrv1103/furniconfig/issues) (etiqueta `good first issue`).
- **Discusiones**: [GitHub Discussions](https://github.com/jesusrv1103/furniconfig/discussions).
- **Email mantenedor**: jesus.ramirez@newsoftglobal.com (placeholder).

---

## 🇺🇸 English Summary

**FurniConfig** — B2B SaaS for parametric custom furniture design (wardrobes first).

**Stack**: React 19 + TypeScript + Vite + Three.js/R3F + Pure TS geometric engine (`packages/geometry-core`).

**Quick start**:
```bash
git clone https://github.com/YOUR_FORK/furniconfig.git
cd furniconfig
npm install
npm run typecheck && npm test && npm run build
npm run dev --workspace @furniconfig/web  # http://localhost:5173
```

**Architecture**: Pure TS geometric engine (`packages/geometry-core`, 179 tests) + React Three Fiber studio (`apps/web`, 164 tests). Pure functions, no Three.js/React in engine. mm internal units, deterministic IDs.

**Tests**: `npm test` (343 total), `npm run test:visual` (Playwright, 200 checks, local only).

**Contributing**: Fork → branch (`fix/`, `feat/`, `docs/`) → Conventional Commits → PR with CI green → maintainer review → merge commit.

**Community**: [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md), [Discussions](https://github.com/jesusrv1103/furniconfig/discussions).