# Issue #103: Zoom a selección (Fit selection)

## Descripción
Botón "Encuadrar selección" que encuadra la cámara solo en los módulos seleccionados (no en todo el mueble).

## Descripción técnica

- Botón "Encuadrar selección" en Toolbar (junto a "Ajustar" y "Encuadrar módulo").
- Solo habilitado si hay ≥ 1 módulo seleccionado.
- Calcula bounding box 3D de los módulos seleccionados (unión de sus bounding boxes).
- Cámara encuadra la unión con margen 10% (padding).
- Animación suave de cámara (transition 500ms con easing).
- Si no hay selección, botón deshabilitado (ya existe en 3C: "sin selección, Encuadrar módulo queda deshabilitado").

## Criterios de aceptación

- [ ] Botón visible en Toolbar (icono + tooltip "Encuadrar selección").
- [ ] Solo habilitado si ≥ 1 módulo seleccionado.
- [ ] Calcula bounding box unión de módulos seleccionados.
- [ ] Cámara encuadra con margen 10% (padding).
- [ ] Animación suave 500ms con easing.
- [ ] Funciona con 1 o múltiples módulos seleccionados.
- [ ] Accesibilidad: foco visible, `aria-label`, navegable por teclado.

## Áreas afectadas

- `apps/web/src/components/WardrobeViewer.tsx` (botón en toolbar + handler)
- `apps/web/src/components/WardrobeScene.tsx` (cálculo bounding box unión)
- `apps/web/src/lib/camera-views.ts` (función `fitSelection`)
- `apps/web/src/components/studio/TopBar.tsx` (si botón va ahí)
- Tests unitarias + visual

## Etiquetas sugeridas

`enhancement`, `frontend`, `good first issue`, `phase-3g`

## Prioridad

Media