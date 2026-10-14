# Issue #111: Lista de corte (cut list) exportable

## Descripción
Genera lista de piezas con dimensiones, material, cantidad, etiquetas para optimización de corte.

## Descripción técnica

- Nueva función en `geometry-core`: `engine/cutlist.ts` → `generateCutList(geometry: GeometryResult): CutList`.
- `CutList`:
  ```typescript
  interface CutListItem {
    id: string;                    // ID único (ej. "panel-side-left-1")
    name: string;                  // Nombre legible ("Lateral izquierdo")
    dimensions: { x: number; y: number; z: number }; // mm (x=ancho, y=alto, z=profundidad)
    materialId: string;            // ID material
    materialName: string;          // Nombre legible
    quantity: number;              // Cantidad (si hay piezas idénticas)
    edges: EdgeBandConfig[];       // Cantos: [{ edge: 'x+', materialId }, ...]
    label: string;                 // Etiqueta para etiquetado (ej. "LAT-IZQ-01")
    nestingId?: string;            // ID para nesting (opcional)
  }
  interface CutList {
    items: CutListItem[];
    summary: {
      totalPieces: number;
      totalAreaM2: number;         // Área total en m²
      byMaterial: Record<string, { pieces: number; areaM2: number }>;
    };
  }
  ```
- Agrupación: piezas idénticas (mismas dimensiones + material) → `quantity > 1`.
- Etiquetas: formato estándar (`PANEL-{ROLE}-{INDEX}`, `ROD-{INDEX}`, `DRAWER-{INDEX}`, `DOOR-{INDEX}`).
- Exportación:
  - `exportCutListCSV(cutlist): string` (CSV con columnas estándar).
  - `exportCutListJSON(cutlist): string` (JSON completo).
  - `exportCutListPDF(cutlist): Uint8Array` (PDF con tabla + resumen).
- UI: Botón "Exportar lista de corte" en BottomBar/Toolbar → descarga CSV/JSON/PDF.

## Criterios de aceptación

- [ ] Función `generateCutList(geometry)` en `engine/cutlist.ts`.
- [ ] Tipos `CutListItem`, `CutList` tipados.
- [ ] Agrupación piezas idénticas → `quantity`.
- [ ] Etiquetas estándar (`PANEL-ROLE-INDEX`, etc.).
- [ ] Exportación CSV (columnas: id, name, x, y, z, material, qty, edges, label).
- [ ] Exportación JSON (completo).
- [ ] Exportación PDF (tabla + resumen por material).
- [ ] UI: botón "Exportar lista de corte" → descarga (selector CSV/JSON/PDF).
- [ ] Tests unitarias (agrupación, etiquetas, exportaciones).

## Áreas afectadas

- `packages/geometry-core/src/engine/cutlist.ts` (nuevo módulo)
- `packages/geometry-core/src/types/` (tipos `CutListItem`, `CutList`)
- `apps/web/src/lib/derive.ts` (integración opcional)
- `apps/web/src/components/studio/BottomBar.tsx` / `TopBar.tsx` (botón exportar)
- `apps/web/src/lib/export.ts` (nuevo: CSV/JSON/PDF helpers)
- Tests unitarias (agrupación, etiquetas, exportaciones)

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `frontend`, `good first issue`, `phase-3j`

## Prioridad

Media