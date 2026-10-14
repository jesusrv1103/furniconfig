# Issue #116: Historial de versiones de diseño

## Descripción
Versionado automático de diseños guardados (git-like): snapshots, diff visual, restauración, ramas.

## Descripción técnica

- Extensión de `DesignRepository` / `DesignSession`:
  - Cada guardado (auto o manual) crea **snapshot** versionado:
    ```typescript
    interface DesignSnapshot {
      id: string;              // UUID
      version: number;         // 1, 2, 3...
      config: WardrobeConfig;  // Config completa en ese momento
      authorId: string;
      message?: string;        // Mensaje opcional (commit message)
      parentId?: string;       // Para ramas (fork)
      createdAt: number;
    }
    ```
  - Diseño principal mantiene `currentVersion` + array `history: DesignSnapshot[]`.
  - **Ramas (fork)**: "Duplicar como nueva rama" → nuevo diseño con `parentId` apuntando a snapshot actual.
- UI en "Mis diseños" / diseño abierto:
  - Pestaña "Historial": lista cronológica (versión, fecha, autor, mensaje).
  - **Diff visual**: seleccionar 2 versiones → compara configs (diff JSON + diff visual 3D).
  - **Restaurar**: "Restaurar esta versión" → crea nueva versión con esa config.
  - **Fork**: "Crear rama desde aquí" → nuevo diseño con `parentId`.
  - Mensajes de commit: opcional al guardar manual, auto-generado en auto-save ("Auto-save: cambió ancho a 2400mm").
- Limpieza: opcional "Compactar historial" (mantiene últimas N versiones + hitos).

## Criterios de aceptación

- [ ] Snapshots automáticos en cada guardado (auto + manual).
- [ ] Historial visible: versión, fecha, autor, mensaje.
- [ ] Diff visual: selecciona 2 versiones → diff JSON + diff 3D (capturas).
- [ ] Restaurar versión → crea nueva versión con esa config.
- [ ] Fork: "Crear rama desde aquí" → nuevo diseño con `parentId`.
- [ ] Mensajes commit: manual en guardado manual, auto en auto-save.
- [ ] Limpieza opcional: compactar historial (mantener últimas N + hitos).
- [ ] Tests unitarias (CRUD snapshots, diff, fork, restore).

## Áreas afectadas

- `apps/web/src/lib/designs/types.ts` (tipos `DesignSnapshot`, `DesignVersion`)
- `apps/web/src/lib/designs/repository.ts` (CRUD snapshots, fork, restore)
- `apps/web/src/lib/designs/diff.ts` (nuevo: diff configs + visual)
- `apps/web/src/components/studio/DesignSection.tsx` (pestaña Historial)
- `apps/web/src/components/studio/DesignDiff.tsx` (nuevo: diff visual)
- `apps/web/src/hooks/use-design-session.ts` (auto-save → snapshot)
- Tests unitarias (CRUD, diff, fork, restore)

## Etiquetas sugeridas

`enhancement`, `frontend`, `help wanted`, `phase-3k`

## Prioridad

Media