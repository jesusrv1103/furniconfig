# Issue #114: Compartir diseño por URL

## Descripción
Genera URL corta que carga el diseño en el visor (solo lectura), para compartir con clientes/equipo.

## Descripción técnica

- Serialización de `WardrobeConfig` a string compacto:
  - Compresión: LZ-string o similar (URL-safe base64).
  - Versión de contrato incluida.
  - Parámetros opcionales: vista inicial, unidad (mm/cm), tema.
- Endpoint/URL: `/view/<compressed-config>` (ruta en `apps/web`).
- Página `/view/:config`:
  - Solo lectura (sin edición, sin paneles laterales).
  - Visor 3D completo (navegación, vistas, cotas).
  - Parámetros URL: `?view=front&unit=cm&theme=dark`.
  - Meta tags Open Graph (título, imagen preview).
- Expiración opcional: parámetro `?exp=2024-12-31` (valida en carga).
- QR code: botón "Compartir" → genera QR con URL.
- Seguridad: validación de config al cargar (reject si inválida).

## Criterios de aceptación

- [ ] Serialización `WardrobeConfig` → string comprimido (LZ-string + base64url).
- [ ] Ruta `/view/:config` carga visor solo lectura.
- [ ] Parámetros URL: `view`, `unit`, `theme`, `exp`.
- [ ] Meta tags OG (título, imagen preview del diseño).
- [ ] Botón "Compartir" → modal con URL + QR code.
- [ ] Validación al cargar: rechaza config inválida con mensaje claro.
- [ ] Expiración opcional (`?exp=YYYY-MM-DD`).
- [ ] Tests unitarias (serialización, deserialización, validación).

## Áreas afectadas

- `apps/web/src/lib/serialization.ts` (nuevo: compress/decompress config)
- `apps/web/src/App.tsx` (ruta `/view/:config`)
- `apps/web/src/components/studio/TopBar.tsx` (botón "Compartir" + modal QR)
- `apps/web/src/components/WardrobeViewer.tsx` (modo solo lectura)
- `apps/web/src/lib/qr.ts` (nuevo: generar QR code)
- Tests unitarias (serialización, validación, expiración)

## Etiquetas sugeridas

`enhancement`, `frontend`, `good first issue`, `phase-3k`

## Prioridad

Media