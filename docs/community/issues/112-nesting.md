# Issue #112: Optimización de corte (nesting básico)

## Descripción
Algoritmo simple para optimizar placas (guillotine o shelf packing) y generar planos de corte para CNC.

## Descripción técnica

- Nuevo módulo: `engine/nesting.ts` → `nestParts(parts: CutListItem[], stockSheets: StockSheet[]): NestingResult`.
- `StockSheet`:
  ```typescript
  interface StockSheet {
    id: string;
    materialId: string;
    dimensions: { x: number; y: number }; // mm (ej. 2440x1220, 2800x2070)
    thickness: number; // mm
    quantity: number; // láminas disponibles
    grainDirection?: 'x' | 'y' | 'none'; // dirección veta (para madera)
  }
  ```
- `NestingResult`:
  ```typescript
  interface NestingResult {
    sheets: NestedSheet[];
    wasteAreaM2: number;
    wastePercentage: number;
    usedSheets: number;
  }
  interface NestedSheet {
    sheetId: string;
    placements: Placement[];
    wasteAreaM2: number;
  }
  interface Placement {
    partId: string;           // ID de pieza (de CutListItem)
    x: number; y: number;     // posición en lámina (mm)
    rotation: 0 | 90;         // rotación (0 o 90°)
  }
  ```
- Algoritmo: **Guillotine packing** (bin packing 2D) o **Shelf packing** (más simple).
  - Input: partes (de CutList) + láminas stock.
  - Output: colocación por lámina + desperdicio.
  - Heurística: ordenar piezas por área descendente (largest area first).
  - Rotación 0/90° permitida (respetando `grainDirection`).
- Exportación:
  - SVG por lámina (plano de corte para CNC).
  - DXF (opcional, para CAD/CAM).
  - Reporte JSON/CSV con desperdicio.

## Criterios de aceptación

- [ ] Módulo `engine/nesting.ts` con `nestParts(parts, stockSheets)`.
- [ ] Tipos `StockSheet`, `NestingResult`, `NestedSheet`, `Placement`.
- [ ] Algoritmo Guillotine o Shelf packing (funcional).
- [ ] Respeta `grainDirection` (rotación 0/90° condicionada).
- [ ] Output: `NestingResult` con `placements` por lámina.
- [ ] Exportación SVG por lámina (plano corte CNC).
- [ ] Exportación DXF (opcional).
- [ ] Reporte desperdicio (área + %).
- [ ] Tests unitarias (casos: 1 lámina, múltiples, veta, rotación).

## Áreas afectadas

- `packages/geometry-core/src/engine/nesting.ts` (nuevo módulo)
- `packages/geometry-core/src/types/` (tipos `StockSheet`, `NestingResult`, etc.)
- `packages/geometry-core/src/engine/cutlist.ts` (integración)
- `apps/web/src/lib/export.ts` (SVG/DXF export)
- `apps/web/src/components/studio/BottomBar.tsx` (botón "Optimizar corte")
- Tests unitarias (algoritmo, veta, rotación, desperdicio)

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `help wanted`, `phase-3j`

## Prioridad

Media