# Issue #100: Duplicar módulo

## Descripción
Añadir botón "Duplicar" en el panel contextual para clonar el módulo seleccionado e insertarlo adyacente.

## Descripción técnica

- Botón "Duplicar" en `ModulePropertiesPanel` (visible cuando hay módulo seleccionado).
- Al clicar: clona la configuración del módulo (tipo, ancho, repisas, cajones, barra, material).
- Inserta el nuevo módulo adyacente (a la derecha del original).
- Actualiza anchos: el original y el duplicado reparten el espacio (o el duplicado toma el ancho del original y los demás absorben).
- Genera **una sola entrada en historial** (consistente con 3F.2).
- IDs deterministas: el nuevo módulo toma el siguiente índice (`module-N+1`), los posteriores se renumeran.

## Criterios de aceptación

- [ ] Botón visible en panel contextual cuando hay módulo seleccionado.
- [ ] Duplica correctamente: tipo, ancho, repisas, cajones, barra, material.
- [ ] Inserta adyacente (índice + 1).
- [ ] Anchos: suma conservada, reparto coherente.
- [ ] Historial: una sola entrada (deshacer revierte la duplicación completa).
- [ ] IDs deterministas: `module-N+1` para el nuevo, renumeración posterior.
- [ ] UI: botón con icono/documentación, tooltip "Duplicar módulo".
- [ ] Accesibilidad: foco visible, `aria-label`, navegable por teclado.

## Áreas afectadas

- `apps/web/src/components/ModulePropertiesPanel.tsx` (botón + handler)
- `apps/web/src/lib/config.ts` (función pura `duplicateModule`)
- `apps/web/src/lib/studio/history.ts` (ya soporta una entrada por acción)
- Tests unitarias en `apps/web/tests/`

## Etiquetas sugeridas

`enhancement`, `frontend`, `good first issue`, `phase-3g`

## Prioridad

Media

## Contexto

Permite a carpinteros/diseñadores replicar rápidamente configuraciones de módulos (ej. varios módulos idénticos en un clóset grande).