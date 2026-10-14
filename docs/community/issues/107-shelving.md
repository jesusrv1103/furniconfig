# Issue #107: Estanterías modulares

## Descripción
Nuevo tipo de mueble: estanterías abiertas (sin puertas, sin cajones, sin barra de colgado, solo entrepaños + laterales + trasera opcional).

## Descripción técnica

- Nuevo tipo de mueble en config: `type: 'shelving'` (además de `wardrobe`).
- Config específica `ShelvingConfig`:
  - `widthMm`, `heightMm`, `depthMm` (como wardrobe).
  - `modules: ShelvingModuleConfig[]` (entrepaños + laterales).
  - `ShelvingModuleConfig`: `widthMm`, `shelves: ShelfConfig[]` (cantidad, posición, material).
  - `backPanel: BackPanelConfig` (opcional).
  - `materials: MaterialConfig` (compartido con wardrobe).
- Motor (`geometry-core`):
  - Nuevo tipo `Shelving` en `WardrobeConfig` (union type o discriminated union).
  - `generateShelving()` en engine: genera laterales, entrepaños, trasera.
  - Sin puertas, sin cajones, sin barra de colgado.
  - Laterales obligatorios (izq/der), entrepaños configurables.
- UI:
  - Selector de tipo de mueble en "Medidas" (radio: Clóset / Estantería).
  - Panel contextual para estantería: entrepaños (cantidad, posición), material, trasera.
  - Vista 3D: render correcto (sin puertas, sin cajones, sin barra).

## Criterios de aceptación

- [ ] Nuevo tipo `shelving` en config (discriminated union con `wardrobe`).
- [ ] Motor genera: laterales (izq/der), entrepaños configurables, trasera opcional.
- [ ] Sin puertas, sin cajones, sin barra de colgado.
- [ ] Laterales obligatorios (izq/der), entrepaños configurables (cantidad, posición).
- [ ] UI: selector tipo mueble (Clóset / Estantería) en "Medidas".
- [ ] Panel contextual específico para estantería.
- [ ] Render 3D correcto (solo laterales, entrepaños, trasera).
- [ ] Tests unitarias (motor) + visual (render).

## Áreas afectadas

- `packages/geometry-core/src/types/` (nuevos tipos `ShelvingConfig`, `ShelvingModuleConfig`)
- `packages/geometry-core/src/engine/` (nuevo `generateShelving`, union types)
- `apps/web/src/lib/config.ts` (funciones para shelving)
- `apps/web/src/components/studio/MeasuresPanel.tsx` (selector tipo mueble)
- `apps/web/src/components/studio/InteriorPanel.tsx` (panel contextual shelving)
- `apps/web/src/components/WardrobeScene.tsx` (render shelving)
- Tests unitarias (motor) + visual

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `frontend`, `help wanted`, `phase-3i`

## Prioridad

Media-alta