# Issue #108: Muebles de baño (vanity)

## Descripción
Mueble bajo lavabo (vanity): 2 puertas, 1 cajón superior, hueco para sifón.

## Descripción técnica

- Nuevo tipo en config: `type: 'vanity'` (discriminated union).
- Config `VanityConfig`:
  - `widthMm`, `heightMm`, `depthMm` (estándar: 600-1200mm ancho, 850mm alto, 450-550mm profundidad).
  - `sinkCutout: SinkCutoutConfig` (posición X/Y, diámetro/rectángulo para sifón/lavabo).
  - `modules: VanityModuleConfig[]`: 1 cajón superior + 2 puertas inferiores.
  - `DrawerConfig` (cajón superior: altura fija ~150mm).
  - `DoorsConfig` (2 hojas, bisagras estándar).
  - `backPanel` con recorte para sifón (opcional).
  - `materials`, `hangingRod` (no aplica), `drawers` (solo superior).
- Motor (`geometry-core`):
  - Tipo `Vanity` en union type.
  - `generateVanity()`: genera cajón superior + puertas inferiores + recorte sifón en panel trasero/fondo.
  - Hueco sifón: recorte en panel trasero + panel inferior (o panel falso).
- UI:
  - Selector tipo mueble: "Vanity" (baño).
  - Panel contextual: posición/tamaño hueco sifón, cajón superior (altura), puertas (1-2 hojas).
  - Validación: hueco sifón no interfiere con cajón/puertas.

## Criterios de aceptación

- [ ] Tipo `vanity` en config (discriminated union).
- [ ] Motor genera: cajón superior + 2 puertas + recorte sifón.
- [ ] Hueco sifón configurable (posición X/Y, tamaño).
- [ ] Recorte en panel trasero + panel inferior.
- [ ] UI: selector tipo "Vanity" + panel contextual específico.
- [ ] Validación: hueco no interfiere con cajón/puertas.
- [ ] Render 3D correcto (cajón + puertas + recorte).
- [ ] Tests unitarias + visual.

## Áreas afectadas

- `packages/geometry-core/src/types/` (VanityConfig, SinkCutoutConfig)
- `packages/geometry-core/src/engine/` (generateVanity, union types)
- `apps/web/src/lib/config.ts` (funciones vanity)
- `apps/web/src/components/studio/MeasuresPanel.tsx` (selector tipo)
- `apps/web/src/components/studio/InteriorPanel.tsx` (panel contextual)
- `apps/web/src/components/WardrobeScene.tsx` (render vanity)
- Tests unitarias + visual

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `frontend`, `help wanted`, `phase-3i`

## Prioridad

Media