# Issue #102: Deshacer/Rehacer global (Ctrl+Z/Y en toda la app)

## Descripción
Extender los atajos globales `Ctrl+Z` (deshacer) y `Ctrl+Y` / `Ctrl+Shift+Z` (rehacer) para que funcionen en cualquier foco, no solo fuera de inputs (ya parcial en Fase 3C).

## Descripción técnica

- Atajos globales registrados en `use-editor-history` o hook dedicado `use-global-shortcuts`.
- `Ctrl+Z`: deshace última acción (si `canUndo`).
- `Ctrl+Y` / `Ctrl+Shift+Z`: rehace (si `canRedo`).
- No interfiere con inputs/textarea/select (event.stopPropagation en handlers de inputs).
- Funciona en cualquier foco: visor, paneles, toolbars, inputs (cuando no editando texto).
- Feedback visual opcional: toast "Deshecho: [acción]" / "Rehecho: [acción]".

## Criterios de aceptación

- [ ] `Ctrl+Z` deshace última acción desde cualquier foco (excepto editando texto).
- [ ] `Ctrl+Y` / `Ctrl+Shift+Z` rehace (si `canRedo`).
- [ ] No interfiere con edición en inputs/textarea/select.
- [ ] Funciona en visor, paneles, toolbars, tarjetas.
- [ ] Feedback visual opcional (toast) configurable.
- [ ] Tests unitarias para hook de atajos globales.

## Áreas afectadas

- `apps/web/src/hooks/use-editor-history.ts` (extender con atajos globales)
- `apps/web/src/hooks/use-global-shortcuts.ts` (nuevo hook)
- `apps/web/src/App.tsx` (registrar hook)
- Tests unitarias

## Etiquetas sugeridas

`enhancement`, `frontend`, `accessibility`, `phase-3g`

## Prioridad

Media