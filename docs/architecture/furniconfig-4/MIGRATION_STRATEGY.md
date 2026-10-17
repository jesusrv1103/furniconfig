# MIGRATION_STRATEGY — Compatibilidad y estrategia de migración (FASE-4A)

> Diseño propuesto, no implementado. Objetivo: **cero roturas** de lo que
> ya funciona.

## 1. Principio rector

> Lo existente **no se migra a la fuerza**: se **contiene**.

`WardrobeConfig` v1 sigue siendo el contrato del configurador de clósets.
El modelador 4.0 es una capa nueva que puede **alojar** esos documentos tal
cual, sin reescribirlos. La migración solo se activa si el usuario abre un
diseño antiguo dentro del modelador, y será explícita y reversible.

## 2. Matriz de compatibilidad

| Activo existente | ¿Se modifica? | Estrategia |
|------------------|---------------|------------|
| `WardrobeConfig` (`schemaVersion: 1`) | **No** | Se almacena como `params` de un `ComponentInstance` tipo `furniconfig.wardrobe` |
| `geometry-core` (contratos, 22 códigos de error) | **No** | Seguro por tests: 179 unitarias deben seguir verdes sin tocarlo |
| `WARDROBE_CONFIG_SCHEMA_VERSION = 1` | **No** | Ningún bump |
| Diseños locales (`furniconfig.designs`, `storageVersion: 1`) | **No** | Sigue funcionando en el flujo actual de `DesignSection` |
| `DESIGN_EXPORT_FORMAT = 'furniconfig-design'` | **No** | Se mantiene; el modelador añade un formato **nuevo** (`furniconfig-scene`) |
| Selección de módulos (`resolveSelection`, `moduleBoundsMm`) | **No** | Sigue operando dentro del modo configurador |
| Historial del configurador (`EditorHistory`) | **No** | Dos historiales separados: uno para WardrobeConfig, otro (`CommandHistory`) para el documento de escena |
| Escenarios Playwright (200 checks) | **No** | Deben seguir en verde; el modelador añade escenarios **nuevos** |
| Pruebas unitarias (522) | **No** | Deben seguir en verde; se añaden suites nuevas |
| `units.ts`, `camera-views.ts`, `panels-to-mesh.ts` | **No** (reutilización) | Se importan; no se editan ni se duplican |
| `AGENTS.md` reglas 1–11 | **No** | El modelador las respeta (mm enteros, motor puro, sin inventar geometría) |

## 3. Estrategia de integración por fases

### Fase 4B — Documento y kernel sin UI (futuro)

- Nuevo paquete `modeler-core` (puro) + `kernel-adapter`.
- `geometry-core` sin tocar. `apps/web` sin tocar salvo un entry point nuevo.
- **Criterio**: `npm test` y `npm run typecheck` siguen en verde con los
  tests antiguos intactos.

### Fase 4C — Editor básico (futuro)

- Nueva ruta/pantalla de modelador **accesible desde la UI**, no como
  reemplazo del configurador.
- El configurador actual permanece por defecto (ADR de usabilidad: no
  obligar a migrar).

### Fase 4D — Componentes paramétricos (futuro)

- `furniconfig.wardrobe` se registra como `ParametricComponentDef` que
  **delega** en `calculateGeometry`. Un usuario del modelador puede insertar
  un clóset y editarlo con las herramientas actuales.

> **Actualizado (FASE-4B-D)**: el contrato `ParametricComponentDef` +
> `buildComponent` está **implementado** en `modeler-core` (D1) y la
> definición `furniconfig.wardrobe` v1 (params = `WardrobeConfig` íntegro,
> construcción 1:1 sobre `validateWardrobeConfig` → `calculateGeometry`)
> vive en la capa de composición `apps/web/src/lib/modeler/components/`
> (D2). La conversión de sólidos libres a componente con equivalencia
> demostrable (`createConvertToComponentCommand`) y el servicio de
> regeneración asíncrona sin UI (`SceneGeometryService`) también están
> implementados (D3/D4a). **Quedan para 4C/4D**: insertar el clóset desde
> la UI del modelador, el cableado del servicio con el worker en pantalla
> (D4b) y la vuelta atrás modelador → configurador.

## 4. Estrategia de versionado

| Artefacto | Constante | Regla de bump |
|-----------|-----------|---------------|
| Contrato del clóset | `WARDROBE_CONFIG_SCHEMA_VERSION` (1) | Solo si cambia la forma de `WardrobeConfig` → **no previsto** |
| Diseños guardados | `DESIGN_STORAGE_VERSION` (1) | Solo si cambia `DesignRecord` → **no previsto** |
| Export de diseño | `DESIGN_EXPORT_FORMAT` (constante texto) | Inmutable |
| **Nuevo** documento de escena | `SCENE_FORMAT_VERSION` (1) | Cambios de forma del `SceneDocument` |
| **Nuevo** export de escena | `'furniconfig-scene'` | Marcador nuevo, independiente del anterior |

**Regla de oro** (heredada de `local-storage.ts`): *versión desconocida →
error antes de escribir; sin migración silenciosa*. Cada salto de versión
exige una función `migrateXtoY` explícita con sus propios tests.

## 5. Escenario de apertura de un diseño antiguo en el modelador

Opción recomendada (**envoltorio no destructivo**):

```
DesignRecord (formato 'furniconfig-design' v1)
   │  el usuario pulsa "Abrir en el modelador"
   ▼
SceneDocument nuevo
   └─ ComponentInstance { type: 'furniconfig.wardrobe', version: 1,
                          params: WardrobeConfig (SIN CAMBIOS) }
   ▼
geometry-core (intacto) genera Panel[] → objetos de escena → misma malla visual
```

- El **diseño original no se toca** hasta que el usuario guarde
  explícitamente; guardar en el modelador crea un registro nuevo
  (`furniconfig-scene`), sin sobrescribir (mismo principio que
  `DesignLibrary.importJson`, que siempre asigna id nuevo).
- La vuelta atrás (modelador → configurador) solo es posible si el
  documento contiene **exactamente un** `furniconfig.wardrobe` y ningún
  sólido libre; si no, se informa (mensaje explícito, sin migración
  sorpresa).

> **Implementado (FASE-4B-D, paso parcial)**: la transformación pura
> `openDesignAsSceneDocument(record)`
> (`apps/web/src/lib/modeler/open-design.ts`) materializa el envoltorio:
> crea el `SceneDocument` nuevo con el `WardrobeConfig` como `params`
> exactos, sin tocar el registro ni persistir nada. El disparador "Abrir en
> el modelador" y la persistencia del documento nuevo quedan para la
> Fase 4C (UI); la vuelta atrás sigue pendiente.

## 6. Importación / exportación

| Formato | Estado | Plan |
|---------|--------|------|
| `furniconfig-design` (JSON) | **Existente**, validado en `transfer.ts` | Se conserva sin cambios |
| `furniconfig-scene` (JSON) | Nuevo, en diseño (`SCENE_DOCUMENT.md` §3.8/§5) | Marcador + versión + validación completa, mismo patrón |
| OBJ / STL / glTF | No existen | Fuera del MVP; `GeometryKernel` deja la puerta abierta (RISKS R-08) |

## 7. Protección de las pruebas existentes

| Suite | Protección |
|-------|-----------|
| 179 geometry-core | El paquete **no se modifica**: cualquier diff en `packages/geometry-core/src/**` bloquea la revisión |
| 343 web | Se ejecutan sin cambios; el modelador añade suites propias en `apps/web/tests/modeler/**` |
| 200 visuales | Siguen siendo la red de seguridad del configurador; se añaden checks nuevos en fase 4C (no se reescriben los existentes) |

Plan de verificación obligatorio en cada fase futura:

```bash
npm run typecheck
npm test
npm run build
npm run test:visual --workspace @furniconfig/web
```

## 8. Riesgos de migración

| Riesgo | Mitigation |
|--------|------------|
| Deriva accidental del contrato del clóset | Diff prohibido en `geometry-core` durante 4A–4C; revisión en PR |
| Doble historial confuso al usuario | UI clara: modos separados; el historial activo depende del modo |
| Formato de escena que evoluciona rápido | Versionado estricto + tests de `parseSceneExport` con JSON hostil (mismo molde que `parseDesignExport`) |
| Colisión de materiales entre clóset y sólidos libres | Ids de material con prefijo por namespace en el documento |
