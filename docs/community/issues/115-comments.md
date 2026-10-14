# Issue #115: Comentarios en diseños

## Descripción
Sistema de comentarios anidados en diseños guardados para colaboración entre equipo/carpintero.

## Descripción técnica

- Extensión de `DesignSession` / `Design` en `apps/web/src/lib/designs/`:
  - Nuevo campo `comments: Comment[]` en cada diseño guardado.
  - `Comment`:
    ```typescript
    interface Comment {
      id: string;              // UUID o ID determinista
      authorId: string;        // ID usuario (placeholder: "user-1")
      authorName: string;      // Nombre visible
      content: string;         // Texto (markdown básico)
      createdAt: number;       // timestamp
      updatedAt?: number;
      parentId?: string;       // Para hilos (respuestas)
      resolved: boolean;       // Marcado como resuelto
      mentions: string[];      // @usuario mencionados
    }
    ```
- UI en pestaña "Mis diseños" / diseño abierto:
  - Panel lateral "Comentarios" (colapsable).
  - Lista hilos (comentarios raíz + respuestas anidadas).
  - Formulario "Añadir comentario" (textarea + @menciones).
  - Botón "Resolver" / "Reabrir" en cada comentario.
  - Filtros: Todos / Abiertos / Resueltos / Míos.
- Notificaciones:
  - Local: badge en pestaña "Mis diseños" + toast.
  - Email (futuro): webhook configurable.
- Persistencia: `localStorage` (extendido) / IndexedDB (futuro).

## Criterios de aceptación

- [ ] Modelo `Comment` tipado con hilos (`parentId`), menciones, resuelto.
- [ ] Panel "Comentarios" en diseño abierto (colapsable).
- [ ] Hilos anidados (respuestas bajo comentario padre).
- [ ] Formulario: textarea + @menciones (autocomplete usuarios).
- [ ] Botones: Resolver/Reabrir, Editar (solo autor), Eliminar (solo autor/admin).
- [ ] Filtros: Todos / Abiertos / Resueltos / Míos.
- [ ] Notificación local: badge + toast en nueva mención/respuesta.
- [ ] Persistencia en `localStorage` / `DesignRepository`.
- [ ] Tests unitarias (CRUD comentarios, hilos, menciones).

## Áreas afectadas

- `apps/web/src/lib/designs/types.ts` (nuevos tipos `Comment`, `DesignWithComments`)
- `apps/web/src/lib/designs/repository.ts` (CRUD comentarios)
- `apps/web/src/components/studio/DesignSection.tsx` (panel comentarios)
- `apps/web/src/components/studio/CommentThread.tsx` (nuevo componente)
- `apps/web/src/hooks/use-design-session.ts` (notificaciones)
- Tests unitarias

## Etiquetas sugeridas

`enhancement`, `frontend`, `help wanted`, `phase-3k`

## Prioridad

Media