# Issue #101: Copiar/pegar configuración de módulo

## Descripción
Permitir copiar la configuración de un módulo (Ctrl+C) y pegarla en otro módulo (Ctrl+V) o vía menú contextual.

## Descripción técnica

- Atajos globales: `Ctrl+C` (copiar módulo seleccionado), `Ctrl+V` (pegar en módulo seleccionado).
- Menú contextual en tarjeta de módulo: "Copiar configuración", "Pegar configuración".
- Qué se copia/pega: tipo, ancho, repisas, cajones, barra, material.
- No se copia: ID (se mantiene el del destino), posición en lista.
- Historial: una entrada por pegado (consistente con 3F.2).
- Feedback visual: toast "Configuración copiada" / "Configuración pegada".

## Criterios de aceptación

- [ ] `Ctrl+C` con módulo seleccionado → copia config al portapapeles interno.
- [ ] `Ctrl+V` con módulo seleccionado → pega config (sobrescribe destino).
- [ ] Menú contextual en tarjeta: "Copiar configuración", "Pegar configuración".
- [ ] Solo copia/pega: tipo, ancho, repisas, cajones, barra, material.
- [ ] No modifica ID ni posición del módulo destino.
- [ ] Historial: una entrada por pegado (deshacer revierte).
- [ ] Feedback visual (toast) en ambas acciones.
- [ ] Accesibilidad: atajos documentados, menú accesible por teclado.

## Áreas afectadas

- `apps/web/src/hooks/use-editor-history.ts` (atajos globales)
- `apps/web/src/components/ModuleCard.tsx` (menú contextual)
- `apps/web/src/lib/config.ts` (función pura `pasteModuleConfig`)
- `apps/web/src/hooks/use-toast.ts` (nuevo hook para feedback)
- Tests unitarias

## Etiquetas sugeridas

`enhancement`, `frontend`, `UX`, `phase-3g`

## Prioridad

Media