# Issue #109: Cocinas modulares (base)

## Descripción
Módulos base de cocina: cajones, puertas, huecos para horno/lavavajillas, zócalo, encimera.

## Descripción técnica

- Nuevo tipo: `type: 'kitchen-base'` (discriminated union).
- Config `KitchenBaseConfig`:
  - `widthMm`, `heightMm` (850-900mm estándar), `depthMm` (600mm estándar).
  - `modules: KitchenModuleConfig[]`: cada módulo puede ser:
    - `cajones`: 1-4 cajones (alturas configurables).
    - `puertas`: 1-2 hojas (bisagras estándar).
    - `hueco_electrodomestico`: tipo `oven` | `dishwasher` | `fridge` | `microwave` (dimensiones estándar).
    - `falso` (panel decorativo).
  - `plinth: PlinthConfig` (zócalo: altura 100-150mm, recorte patas).
  - `countertop: CountertopConfig` (encimera: grosor, material, recorte fregadero/placa).
  - `materials` compartido.
- Motor (`geometry-core`):
  - Tipo `KitchenBase` en union.
  - `generateKitchenBase()`: genera módulos + zócalo + encimera.
  - Soporte huecos estándar electrodomésticos (norma EU: 600mm ancho).
  - Zócalo: recorte patas delanteras/traseras.
  - Encimera: grosor configurable, recorte fregadero/placa.
- UI:
  - Selector tipo: "Cocina base".
  - Panel contextual por módulo: tipo (cajones/puertas/electrodoméstico), dimensiones.
  - Panel global: zócalo, encimera, materiales.
  - Validación: huecos electrodomésticos no solapan, zócalo continuo.

## Criterios de aceptación

- [ ] Tipo `kitchen-base` en config.
- [ ] Módulos: cajones (1-4), puertas (1-2), huecos electrodomésticos estándar.
- [ ] Zócalo configurable (altura, recorte patas).
- [ ] Encimera configurable (grosor, material, recortes).
- [ ] Huecos electrodomésticos estándar (600mm ancho).
- [ ] UI: selector tipo + panel contextual por módulo + panel global.
- [ ] Validación: sin solapes, zócalo continuo.
- [ ] Render 3D correcto.
- [ ] Tests unitarias + visual.

## Áreas afectadas

- `packages/geometry-core/src/types/` (KitchenBaseConfig, ModuleConfig variants)
- `packages/geometry-core/src/engine/` (generateKitchenBase, union types)
- `apps/web/src/lib/config.ts` (funciones kitchen)
- `apps/web/src/components/studio/MeasuresPanel.tsx` (selector)
- `apps/web/src/components/studio/InteriorPanel.tsx` (paneles contextuales)
- `apps/web/src/components/WardrobeScene.tsx` (render kitchen)
- Tests unitarias + visual

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `frontend`, `help wanted`, `phase-3i`

## Prioridad

Media