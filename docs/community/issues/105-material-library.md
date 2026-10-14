# Issue #105: Biblioteca de materiales predefinidos

## Descripción
Catálogo de materiales comunes (melaminas, maderas, lacados, vidrios, metales) listos para usar.

## Descripción técnica

- Archivo JSON/TS en `apps/web/src/lib/material-library.ts` (o JSON en `public/materials/`).
- 20+ materiales predefinidos categorizados:
  - **Melaminas** (blanco, gris, roble, nogal, haya, blanco mate, gris antracita...)
  - **Maderas naturales** (roble, nogal, cerezo, pino, haya, wengué...)
  - **Lacados** (blanco brillo, blanco mate, negro mate, gris brillo, colores RAL...)
  - **Vidrios** (transparente, mate, ahumado, reflex)
  - **Metales** (acero inox, aluminio anodizado, negro mate, dorado cepillado)
  - **Otros** (corian, compacto, HPL, piedra sinterizada)
- Cada material: nombre, categoría, color base (HEX), roughness, metalness, textura opcional (URL o base64), tags.
- UI en panel "Apariencia": pestaña "Biblioteca" con grid de tarjetas.
- Tarjeta: preview esfera, nombre, categoría, tags.
- Botón "Usar este material" → añade a `config.materials` (clona si ya existe).
- Buscador/filtro por categoría, texto.

## Criterios de aceptación

- [ ] 20+ materiales predefinidos en categorías documentadas.
- [ ] UI: grid de tarjetas con preview (esfera), nombre, categoría, tags.
- [ ] Filtro por categoría (tabs/chips) + buscador por nombre.
- [ ] Botón "Usar" → clona a `config.materials` (ID determinista).
- [ ] Persistencia: materiales añadidos se guardan en diseño.
- [ ] Accesibilidad: grid navegable por teclado, focus visible, ARIA labels.
- [ ] Documentación: `docs/material-library.md` con tabla completa.

## Áreas afectadas

- `apps/web/src/lib/material-library.ts` (datos)
- `apps/web/src/components/studio/MaterialLibrary.tsx` (UI)
- `apps/web/src/components/studio/AppearancePanel.tsx` (integración)
- `apps/web/src/lib/config.ts` (funciones: `addMaterialFromLibrary`)
- Tests unitarias + visual

## Etiquetas sugeridas

`enhancement`, `frontend`, `documentation`, `phase-3h`

## Prioridad

Media