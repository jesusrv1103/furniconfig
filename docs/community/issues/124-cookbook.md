# Issue #124: Ejemplos de uso (Cookbook)

## Descripción
Recetas prácticas ("cómo hacer X") para casos de uso comunes: clóset esquina, estantería, vanity, cocina, etc.

## Descripción técnica

### Formato de receta
Cada receta en `docs/cookbook/`:
```markdown
# Título: Clóset esquinero en L

## Objetivo
Diseñar un clóset en forma de L (dos tramos perpendiculares).

## Configuración base
```json
{
  "version": 2,
  "widthMm": 2400,
  "heightMm": 2400,
  "depthMm": 600,
  "modules": [...],
  ...
}
```

## Pasos
1. Crear mueble principal (tramo largo).
2. Añadir módulo esquina (tipo `corner` - futuro).
3. Ajustar anchos con arrastre visual.
4. Añadir barra de colgado solo en tramo largo.
4. Configurar cajones en módulo central.

## Resultado
![Captura del resultado](/cookbook/images/corner-wardrobe.png)

## Variantes
- Clóset en U (3 tramos).
- Clóset con módulo esquina dedicado (futuro).
```

### Recetas propuestas (10+)
1. **Clóset esquinero en L** (dos tramos perpendiculares).
2. **Estantería biblioteca** (sin puertas, solo entrepaños).
3. **Vanity baño** (cajón + 2 puertas + hueco sifón).
4. **Cocina base** (módulo horno + cajones + zócalo).
5. **Vestidor walk-in** (múltiples tramos, isla central).
6. **Armario puente** (módulo superior sobre cama/escritorio).
7. **Zapatero modular** (módulos bajos, entrepaños inclinados).
8. **Despensa modular** (estantes profundos, cajones extraíbles).
9. **Mueble TV con almacenamiento** (hueco TV + cajones + puertas).
9. **Oficina en casa** (escritorio integrado + estanterías + cajonera).

### Formato de entrega
- Archivos Markdown en `docs/cookbook/`.
- Imágenes en `docs/cookbook/images/`.
- Config JSON descargable por receta.
- Enlace desde README principal.

## Criterios de aceptación

- [ ] 10+ recetas en `docs/cookbook/`.
- [ ] Cada receta: objetivo, config JSON, pasos, captura, variantes.
- [ ] Config JSON válido (valida con `validateWardrobeConfig`).
- [ ] Imágenes reales del visualizador (capturas 1440x900).
- [ ] Enlaces desde README principal → Cookbook.
- [ ] Script para validar todas las configs del cookbook (`npm run validate:cookbook`).

## Áreas afectadas

- `docs/cookbook/` (nuevo directorio con 10+ recetas)
- `docs/cookbook/images/` (capturas)
- `apps/web/scripts/validate-cookbook.ts` (script validación)
- `package.json` (script `validate:cookbook`)

## Etiquetas sugeridas

`documentation`, `good first issue`, `phase-3n`

## Prioridad

Media