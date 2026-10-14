# Issue #110: Validación de estabilidad estructural

## Descripción
El motor verifica que el mueble no vuelque (centro de gravedad dentro de la base con margen de seguridad).

## Descripción técnica

- Nuevo módulo en `geometry-core`: `engine/structural.ts`.
- Función `validateStructuralStability(geometry: GeometryResult, config: WardrobeConfig): StructuralValidationResult`.
- Cálculo:
  1. **Centro de gravedad (CG)** del mueble vacío:
     - Suma ponderada de volúmenes × densidad material (kg/m³ por material).
     - Paneles, barras, cajones, puertas, trasera.
  2. **CG con carga estimada** (opcional):
     - Ropa en barras (kg/m lineal).
     - Contenido cajones (kg por cajón).
     - Objetos en entrepaños (kg/m²).
  3. **Base de apoyo**: polígono convexo de puntos de contacto con suelo (patas, zócalo, laterales).
  4. **Check**: CG (proyección XY) dentro de base + margen seguridad (ej. 10% de ancho base).
- Resultado:
  ```typescript
  interface StructuralValidationResult {
    stable: boolean;
    centerOfGravity: { x: number; y: number; z: number }; // mm
    supportPolygon: Point2D[]; // polígono de apoyo (mm)
    safetyMargin: number; // mm (distancia CG a borde base)
    warnings: string[]; // avisos si margen < umbral
  }
  ```
- Integración: `deriveGeometryState` llama a validación y expone en `derived.structuralValidation`.
- UI: Warning en TopBar/BottomBar si `!stable` o `margin < threshold`.

## Criterios de aceptación

- [ ] Módulo `engine/structural.ts` con `validateStructuralStability`.
- [ ] Cálculo CG (vacío + carga estimada configurable).
- [ ] Polígono de apoyo (puntos de contacto con suelo).
- [ ] Check: CG dentro de base + margen 10%.
- [ ] Resultado tipado con `stable`, `centerOfGravity`, `supportPolygon`, `safetyMargin`, `warnings`.
- [ ] Integración en `deriveGeometryState` → expone en `derived`.
- [ ] UI: Warning visible en TopBar/BottomBar si inestable o margen bajo.
- [ ] Tests unitarias (casos: estable, inestable, límite).

## Áreas afectadas

- `packages/geometry-core/src/engine/structural.ts` (nuevo módulo)
- `packages/geometry-core/src/engine/geometry.ts` (integración)
- `packages/geometry-core/src/types/` (nuevos tipos `StructuralValidationResult`)
- `apps/web/src/lib/derive.ts` (integración)
- `apps/web/src/components/studio/TopBar.tsx` / `BottomBar.tsx` (warning UI)
- Tests unitarias (casos: estable, inestable, límite)

## Etiquetas sugeridas

`enhancement`, `geometry-core`, `help wanted`, `phase-3j`

## Prioridad

Media