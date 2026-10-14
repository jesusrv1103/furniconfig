# Issue #113: Validación de reglas carpinteras reales

## Descripción
Reemplazar límites provisionales por reglas validadas con carpinteros profesionales.

## Descripción técnica

- Investigación: encuesta/entrevistas a 5+ carpinteros profesionales.
- Documentar reglas reales:
  - **Anchos mínimos/máximos** por tipo de módulo (clóset, estantería, vanity, cocina).
  - **Huecos mínimos** para puertas, cajones, electrodomésticos.
  - **Cantos y chapados**: reglas de chapado (cara vista/oculta), radio mínimo esquinas.
  - **Refuerzos**: cuándo añadir refuerzos (estantes > 800mm, laterales > 2400mm).
  - **Cantos y chapados**: reglas de canto (PVC, melamina, madera), radio mínimo.
  - **Herrajes**: separación mínima bisagras, guías cajones, soportes estantes.
  - **Cargas**: capacidad carga por tipo de estante/barra (kg/m).
  - **Ventilación**: huecos mínimos para ventilación (espalda, base).
- Actualizar:
  - `docs/product-rules.md` (documento maestro de reglas validadas).
  - `packages/geometry-core/src/contract/limits.ts` (límites duros en validación).
  - `packages/geometry-core/src/contract/validateWardrobeConfig.ts` (nuevas validaciones).
- Marcar reglas: **VALIDADA** (confirmada por ≥3 carpinteros) vs **PROVISIONAL** (pendiente).

## Criterios de aceptación

- [ ] Entrevista/encuesta a ≥5 carpinteros profesionales.
- [ ] Documento `docs/carpentry-rules.md` con reglas categorizadas.
- [ ] `docs/product-rules.md` actualizado (marcar VALIDADA/PROVISIONAL).
- [ ] `contract/limits.ts` actualizado con límites validados.
- [ ] `validateWardrobeConfig` incluye nuevas validaciones (errores claros).
- [ ] Tests unitarias para nuevas validaciones.
- [ ] Documento de referencia: carpinteros contactados, fecha, método.

## Áreas afectadas

- `docs/product-rules.md` (actualización)
- `docs/carpentry-rules.md` (nuevo documento)
- `packages/geometry-core/src/contract/limits.ts`
- `packages/geometry-core/src/contract/validateWardrobeConfig.ts`
- Tests unitarias (nuevas validaciones)

## Etiquetas sugeridas

`documentation`, `geometry-core`, `help wanted`, `phase-3j`

## Prioridad

Media