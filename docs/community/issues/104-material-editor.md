# Issue #104: Editor de materiales visual

## Descripción
Panel para crear/editar materiales visualmente (color, textura, brillo, roughness) con preview en tiempo real.

## Descripción técnica

- Nueva pestaña/panel "Materiales" en categoría "Apariencia" (o modal).
- Lista de materiales existentes (tarjetas con preview).
- Botón "Nuevo material" → abre editor.
- Editor de material:
  - **Color base**: selector HEX/RGB + color picker visual.
  - **Textura**: upload imagen (drag & drop) → genera Three.js Texture (repeat/wrap configurable).
  - **Roughness**: slider 0–1 (0 = brillante, 1 = mate).
  - **Metalness**: slider 0–1 (0 = dieléctrico, 1 = metálico).
  - **Clearcoat**: slider 0–1 (capa transparente).
  - **Normal map**: upload opcional.
  - **Preview en tiempo real**: esfera 3D rotativa con iluminación estándar.
- Guardar: añade a `config.materials` con ID determinista (`material-custom-1`, etc.).
- Materiales predefinidos (sistema) no editables, solo clonables.

## Criterios de aceptación

- [ ] Panel accesible desde categoría "Apariencia".
- [ ] Lista de materiales con preview (esfera miniatura).
- [ ] Editor: color picker (HEX/RGB), upload textura, sliders roughness/metalness/clearcoat.
- [ ] Preview en tiempo real (esfera 3D rotativa con luces estándar).
- [ ] Upload textura: drag & drop, genera Three.js Texture (repeat/wrap).
- [ ] Guardar: genera ID determinista (`material-custom-N`), añade a `config.materials`.
- [ ] Materiales sistema: no editables, solo "Clonar".
- [ ] Persistencia: materiales custom se guardan en diseño (localStorage).
- [ ] Accesibilidad: formularios accesibles, focus visible, labels.

## Áreas afectadas

- `apps/web/src/components/studio/MaterialEditor.tsx` (nuevo componente)
- `apps/web/src/components/studio/AppearancePanel.tsx` (integración)
- `apps/web/src/lib/config.ts` (funciones puras: `addMaterial`, `updateMaterial`, `cloneMaterial`)
- `apps/web/src/lib/materials.ts` (creación Three.js materials desde config)
- `apps/web/src/lib/studio/tabs.ts` (nueva pestaña o sección en Apariencia)
- Tests unitarias + visual

## Etiquetas sugeridas

`enhancement`, `frontend`, `UX`, `phase-3h`

## Prioridad

Media