# Issue #106: Materiales por cara (interior/exterior)

## Descripción
Permitir asignar materiales diferentes a la cara interior vs exterior de los paneles.

## Descripción técnica

- Configuración por panel: `materialInterior`, `materialExterior` (opcionales, heredan de `material` si no definidos).
- Motor (`geometry-core`): `Panel` incluye `materialInteriorId?`, `materialExteriorId?`.
- `panels-to-mesh.ts`: genera Three.js Mesh con `side: DoubleSide` y `material` array `[exteriorMaterial, interiorMaterial]`.
- UI en panel contextual (módulo) y/o panel de materiales:
  - Checkbox "Materiales diferenciados interior/exterior".
  - Dos selectores: "Material exterior", "Material interior".
  - Por defecto: ambos heredan del material general del panel.
- Render: Three.js `Mesh` con `material: [exteriorMat, interiorMat]` y `side: DoubleSide`.
- Sombras: ambas caras proyectan/reciben sombra.

## Criterios de aceptación

- [ ] Config por panel: `materialInteriorId?`, `materialExteriorId?` (opcionales).
- [ ] Motor genera Mesh con `side: DoubleSide` y array de materiales `[ext, int]`.
- [ ] UI: checkbox "Materiales diferenciados" + dos selectores.
- [ ] Por defecto: ambos heredan del material general.
- [ ] Render correcto: caras opuestas con materiales distintos.
- [ ] Sombras: ambas caras proyectan/reciben.
- [ ] Tests unitarias (motor) + visual (render).

## Áreas afectadas

- `packages/geometry-core/src/types/Panel.ts` (nuevos campos opcionales)
- `packages/geometry-core/src/engine/panels.ts` (propagar campos)
- `apps/web/src/lib/panels-to-mesh.ts` (DoubleSide + array materiales)
- `apps/web/src/lib/materials.ts` (crear materiales para ambas caras)
- `apps/web/src/components/studio/ModulePropertiesPanel.tsx` (UI)
- Tests unitarias (motor) + visual

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `frontend`, `phase-3h`

## Prioridad

Media