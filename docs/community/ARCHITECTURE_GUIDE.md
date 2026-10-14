# Guía de Arquitectura — FurniConfig

> **Idioma principal:** Español. Incluye resumen en inglés al final.

---

## 🏗️ Visión general

FurniConfig sigue una arquitectura **motor + presentación** con separación estricta:

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (React + Three.js)  ◄── Capa de presentación      │
│  - UI, estado, validación derivada, persistencia           │
└──────────────────────────┬──────────────────────────────────┘
                           │ Contrato versionado (WardrobeConfig)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/geometry-core      ◄── Motor puro (TypeScript)   │
│  - Sin Three.js, React, I/O, estado global                 │
│  - Funciones puras: misma entrada → misma salida           │
│  - Validación → Cálculo → GeometryResult                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧠 Motor geométrico (`packages/geometry-core`)

### Principios inmutables

| Principio | Descripción |
|-----------|-------------|
| **Pureza** | Sin Three.js, React, I/O, estado global, timers, random. |
| **Determinismo** | Misma entrada → misma salida. Siempre. |
| **Validación primero** | `validateWardrobeConfig()` antes de calcular. |
| **Errores tipados** | `GeometryError` con `code: GeometryErrorCode` (estable). |
| **Unidad interna** | Milímetros enteros. X=ancho, Y=alto, Z=profundidad. Origen: esquina inferior-izquierda-frontal. |
| **IDs deterministas** | `module-1`, `panel-side-left`, `material-structure`. Sin UUIDs. |

### Estructura del motor

```
packages/geometry-core/src/
├── contract/                    # Contrato versionado + validación
│   ├── WardrobeConfig.ts        # Configuración de entrada (versionada)
│   ├── GeometryResult.ts        # Resultado de cálculo (paneles, barras, etc.)
│   ├── WardrobeConfigVersion.ts # Versionado de contrato
│   └── validateWardrobeConfig.ts # Validación con GeometryError
├── engine/
│   ├── distribution.ts          # Reparto de anchos (uniforme, fijado, mixto)
│   ├── panels.ts                # Generación de paneles estructurales
│   ├── hangingRods.ts           # Barras de colgado
│   ├── drawers.ts               # Cajoneras
│   ├── doors.ts                 # Puertas abatibles (1-2 hojas, bisagra)
│   └── geometry.ts              # Orquestador: config → GeometryResult
├── studio/                      # Capa pura del editor (solo para apps/web)
│   ├── history.ts               # Deshacer/Rehacer (bounded)
│   ├── selection.ts             # Selección de módulos
│   └── tabs.ts                  # Navegación por categorías
├── types/                       # Tipos compartidos (Wardrobe, Module, Panel, etc.)
└── index.ts                     # Exports públicos
```

### Flujo de cálculo (motor)

```
WardrobeConfig (validada)
        │
        ▼
distributeModules()          → anchos por módulo (mm enteros)
        │
        ▼
generatePanels()             → paneles estructurales + entrepaños
        │
        ▼
generateHangingRods()        → barras de colgado
        │
        ▼
generateDrawerAssemblies()   → cajoneras
        │
        ▼
generateDoors()              → puertas abatibles (1-2 hojas)
        │
        ▼
generateBackPanel()          → panel trasero (opcional)
        │
        ▼
GeometryResult { panels, hangingRods, drawerAssemblies, doors, backPanel, wardrobe }
```

### Contrato de configuración (versionado)

```typescript
// contract/WardrobeConfig.ts
interface WardrobeConfig {
  version: number;              // Contrato versionado
  widthMm: number;              // Ancho total (mm)
  heightMm: number;             // Alto total (mm)
  depthMm: number;              // Profundidad (mm)
  modules: ModuleConfig[];      // Config por módulo
  materials: MaterialConfig;    // Materiales por rol
  hangingRod: HangingRodConfig; // Barra de colgado
  drawers: DrawerConfig;        // Cajoneras
  doors: DoorsConfig;           // Puertas (1-2 hojas, materiales)
  backPanel: BackPanelConfig;   // Panel trasero (opcional)
}
```

> **Regla**: El contrato es versionado (`version: number`). Cambios breaking → nueva versión. El motor valida y migra si es posible.

### Errores geométricos

```typescript
// contract/GeometryError.ts
class GeometryError extends Error {
  code: GeometryErrorCode;  // Código estable
  details?: Record<string, unknown>;
}

type GeometryErrorCode =
  | 'INVALID_WIDTH'           // Ancho fuera de rango
  | 'INVALID_HEIGHT'          // Alto fuera de rango
  | 'INVALID_DEPTH'           // Profundidad fuera de rango
  | 'INSUFFICIENT_WIDTH'      // Ancho insuficiente para módulos
  | 'MODULE_WIDTH_TOO_SMALL'  // Módulo < mínimo
  | 'MODULE_WIDTH_TOO_LARGE'  // Módulo > máximo
  | 'INVALID_MODULE_COUNT'    // Cantidad de módulos inválida
  | 'INVALID_DRAWER_COUNT'    // Cajones inválidos
  | 'INVALID_DOOR_CONFIG'     // Config de puertas inválida
  | 'CONTRACT_VERSION_MISMATCH'; // Versión de contrato no soportada
```

> **Regla**: Los códigos son **estables**. Nunca se eliminan ni renombran. Solo se añaden.

---

## 🎨 Capa de presentación (`apps/web`)

### Responsabilidades

| Capa | Responsabilidad | Qué NO hace |
|------|-----------------|-------------|
| `App.tsx` | Estado raíz, validación derivada, historial, sesión | Calcular geometría |
| `WardrobeViewer` | Visor 3D, clickGuard, controles, cotas | Calcular geometría |
| `WardrobeScene` | Escena R3F, meshes, selección, arrastre | Calcular geometría |
| `ConfigPanel` / `DesignSection` | UI de edición, navegación tabs | Calcular geometría |
| `src/lib/config.ts` | Funciones puras de edición (setModuleWidth, etc.) | Mutar estado directamente |
| `src/lib/derive.ts` | Derivación pura: config → GeometryResult | Side effects |

### Flujo de estado (web)

```
Usuario interactúa en UI
        │
        ▼
Función pura de config.ts (setModuleWidth, addModule, etc.)
        │
        ▼
Nueva WardrobeConfig (inmutable)
        │
        ▼
App.tsx: setConfig(nuevaConfig) → historial (use-editor-history)
        │
        ▼
deriveGeometryState(config) → { geometry, geometryError, ... }
        │
        ▼
WardrobeViewer → WardrobeScene → Three.js meshes (R3F)
```

> **Regla de oro**: La web **nunca muta** la configuración. Todas las actualizaciones son funciones puras que devuelven nueva `WardrobeConfig`.

### Conversión de unidades (solo en presentación)

```typescript
// lib/units.ts
export const mmToM = (mm: number): number => mm / 1000;
export const mToMm = (m: number): number => Math.round(m * 1000);

// ÚNICO lugar donde se convierte mm → m para Three.js
const widthM = mmToM(config.widthMm);
```

### Adaptación de paneles a mallas (Three.js)

```typescript
// lib/panels-to-mesh.ts
export function toRenderablePanels(panels: Panel[], materials: MaterialMap): RenderablePanel[]
// Convierte Panel (mm, esquina mínima) → Three.js Mesh (m, centro)
```

> **Regla**: La conversión mm→m y Panel→Mesh ocurre **solo** en `lib/units.ts` y `lib/panels-to-mesh.ts`. El motor nunca ve metros ni Three.js.

---

## 🔄 Flujo de datos completo (end-to-end)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USUARIO                                        │
│  - Edita medidas en ConfigPanel                                            │
│  - Arrastra separador en WardrobeScene                                     │
│  - Selecciona módulo, cambia material, etc.                                │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        apps/web (Capa de presentación)                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │ App.tsx         │  │ WardrobeViewer  │  │ WardrobeScene (R3F)         │ │
│  │ - Estado raíz   │  │ - clickGuard    │  │ - Meshes (paneles, barras,  │ │
│  │ - Historial     │  │ - onPointerMissed│ │   barras, cajones, puertas) │ │
│  │ - Sesión        │  │ - onClick       │  │ - Selección (handlePick)    │ │
│  │ - Validación    │  │ - Cotas (HTML)  │  │ - Arrastre (DividerDrag)    │ │
│  └────────┬────────┘  └────────┬────────┘  └──────────────┬──────────────┘ │
│           │                    │                          │               │
│           ▼                    ▼                          ▼               │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    src/lib/derive.ts                                │ │
│  │  deriveGeometryState(config) → { geometry, geometryError, ... }    │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    packages/geometry-core (Motor puro)                      │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ validateWardrobeConfig(config) → throws GeometryError / ok         │  │
│  └────────────────────────────────┬────────────────────────────────────┘  │
│                                   │                                       │
│                                   ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ geometry.ts (orquestador)                                         │  │
│  │  distributeModules() → anchos                                      │  │
│  │  generatePanels() → paneles                                        │  │
│  │  generateHangingRods() → barras                                    │  │
│  │  generateDrawerAssemblies() → cajoneras                            │  │
│  │  generateDoors() → puertas                                         │  │
│  │  generateBackPanel() → panel trasero                               │  │
│  └────────────────────────────────┬────────────────────────────────────┘  │
│                                   │                                       │
│                                   ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ GeometryResult { panels, hangingRods, drawerAssemblies,            │  │
│  │              doors, backPanel, wardrobe }                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🔑 Conceptos clave para colaboradores

### 1. IDs deterministas
```typescript
// Siempre deterministas, nunca UUID
moduleId: `module-${index + 1}`           // "module-1", "module-2"
panelId: `panel-side-left`                // Roles fijos
materialId: `material-structure`          // Por rol
```

### 2. Unidades y coordenadas
```typescript
// Motor: SIEMPRE mm enteros
interface Panel {
  positionMm: { x: number; y: number; z: number };  // Esquina mínima (mm)
  sizeMm: { x: number; y: number; z: number };      // Tamaño (mm)
  role: PanelRole;                                   // 'side' | 'shelf' | 'back' | ...
}

// Presentación: SOLO en lib/units.ts y lib/panels-to-mesh.ts
const widthM = mmToM(panel.sizeMm.x);  // mm → m para Three.js
const pos = [mmToM(panel.positionMm.x) + widthM/2, ...]; // Centro para Three.js
```

### 3. Coordenadas (motor vs Three.js)
```
Motor (mm, esquina mínima):     Three.js (m, centro):
Origen: esquina inf-izq-frontal  Origen: centro del mundo
X: ancho (+)                     X: derecha (+)
Y: alto (+)                      Y: arriba (+)
Z: profundidad (+)               Z: hacia cámara (-) / fuera (-)
```

### 4. Historial (deshacer/rehacer)
```typescript
// hooks/use-editor-history.ts
interface EditorHistoryApi {
  config: WardrobeConfig;           // Estado presente
  update(updater: (c) => WardrobeConfig): void;  // Registra paso
  resetTo(config: WardrobeConfig): void;         // Sin paso (carga)
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}
```
- **Una acción = un paso** (arrastre completo = 1 entrada).
- `resetTo` para carga de proyecto (sin paso).
- `canUndo`/`canRedo` para UI.

---

## 🧪 Testing

### Motor (geometry-core)
```bash
npm test --workspace @furniconfig/geometry-core
# 179 tests: distribución, paneles, barras, cajones, puertas, validación
```
- Casos nominales, límites, entradas inválidas.
- Determinismo: misma entrada → misma salida.
- `GeometryError` con códigos estables.

### Web (apps/web)
```bash
npm test --workspace @furniconfig/web
# 164 tests: hooks, utils, config, visual-check helpers
```

### Visuales (Playwright)
```bash
npm run test:visual --workspace @furniconfig/web
# 200 checks: 3D, UI, cotas, arrastre, 3F.2, responsive
```

---

## 📦 Publicación y versión

- **Monorepo**: npm workspaces (`packages/*`, `apps/*`).
- **Versionado**: SemVer en `package.json` raíz.
- **Pre-1.0**: `0.x.x` — API/contratos pueden romper en minor.
- **Publicación**: `npm publish --workspaces` (cuando se habilite).

---

## 🇺🇸 English Summary

**Architecture**: Pure TS geometric engine (`packages/geometry-core`, 179 tests) + React Three Fiber studio (`apps/web`, 164 tests). Strict separation: engine is pure (no Three.js, React, I/O), web is presentation only (mm→m conversion only in `lib/units.ts`, Panel→Mesh in `lib/panels-to-mesh.ts`).

**Key principles**: Pure functions, deterministic IDs, mm integers, versioned contracts, typed errors, immutable config updates, single history entry per user action.

**Data flow**: User action → pure config function → new WardrobeConfig → history → deriveGeometryState → GeometryResult → Three.js meshes.

**Testing**: 179 engine tests + 164 web tests + 200 visual checks (Playwright, local only).

**Contributing**: Pure functions in engine, no Three.js/React in core, mm integers, deterministic IDs, Conventional Commits, PR with CI green.