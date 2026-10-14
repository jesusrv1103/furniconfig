# Issue #122: Tests de propiedad (property-based testing)

## Descripción
Property-based testing para el motor geométrico usando fast-check.

## Descripción técnica

### Librería: `fast-check`
- Property-based testing (como QuickCheck en Haskell).
- Genera miles de casos aleatorios que cumplen precondiciones.
- Encuentra edge cases que tests unitarios manuales no cubren.

### Propiedades a testear

#### `distributeModules` (engine/distribution.ts)
```typescript
// tests/engine/distribution.property.test.ts
import { test, expect } from 'vitest';
import fc from 'fast-check';
import { distributeModules } from '../src/engine/distribution.js';

test('distributeModules: suma exacta de anchos', () => {
  fc.assert(fc.property(
    fc.integer({ min: 300, max: 3000 }),  // widthMm
    fc.integer({ min: 1, max: 10 }),      // moduleCount
    fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), // fixed flags
    (widthMm, moduleCount, fixedFlags) => {
      // Precondición: ancho suficiente para mínimos
      const minTotal = moduleCount * 300;
      if (widthMm < minTotal) return;
      
      const input = { widthMm, moduleCount, fixedWidths: {}, ... };
      const result = distributeModules(input);
      
      // Propiedad: suma exacta
      const sum = result.widths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(widthMm);
      
      // Propiedad: cada ancho >= 300
      result.widths.forEach(w => expect(w).toBeGreaterThanOrEqual(300));
    }
  ), { numRuns: 1000 });
});

test('distributeModules: fijos respetados', () => {
  fc.assert(fc.property(
    fc.integer({ min: 600, max: 3000 }),
    fc.integer({ min: 2, max: 5 }),
    fc.record({
      fixedIndex: fc.integer({ min: 0, max: 4 }),
      fixedWidth: fc.integer({ min: 300, max: 2000 })
    }),
    (widthMm, moduleCount, { fixedIndex, fixedWidth }) => {
      if (fixedWidth >= widthMm) return;
      if (widthMm < 300 * moduleCount) return;
      
      const input = {
        widthMm,
        moduleCount,
        fixedWidths: { [fixedIndex]: fixedWidth }
      };
      const result = distributeModules(input);
      
      // Propiedad: módulo fijo respeta su ancho
      expect(result.widths[fixedIndex]).toBe(fixedWidth);
      
      // Propiedad: suma exacta
      const sum = result.widths.reduce((a, b) => a + b, 0);
      expect(sum).toBe(widthMm);
    }
  ), { numRuns: 500 });
});
```

#### `generatePanels` (engine/panels.ts)
- Propiedad: número correcto de paneles según config.
- Propiedad: dimensiones coherentes (suma anchos = ancho total).
- Propiedad: posiciones no se solapan.

#### `generateDoors` (engine/doors.ts)
- Propiedad: número de hojas = módulos × hojasPorMódulo.
- Propiedad: bisagras en lado correcto (izq/der alternado).
- Propiedad: apertura 0-110° no causa colisiones.

### Integración
```bash
# package.json (geometry-core)
"test:property": "vitest run --config vitest.property.config.ts"
```
```typescript
// vitest.property.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.property.test.ts'],
    testTimeout: 60_000,
    poolOptions: { threads: { singleThread: true } }, // fast-check no es thread-safe
  },
});
```

## Criterios de aceptación

- [ ] `fast-check` instalado en `geometry-core`.
- [ ] Tests de propiedad para `distributeModules` (suma exacta, fijos respetados, límites).
- [ ] Tests de propiedad para `generatePanels` (conteo, dimensiones, no-solapamiento).
- [ ] Tests de propiedad para `generateDoors` (hojas, bisagras, colisiones).
- [ ] Config Vitest separada para property tests (timeout alto, single-thread).
- [ ] `npm run test:property` ejecuta solo property tests.
- [ ] 1000+ casos generados por propiedad.
- [ ] CI incluye `npm run test:property` en job verify.

## Áreas afectadas

- `packages/geometry-core/package.json` (dep: `fast-check`)
- `packages/geometry-core/vitest.property.config.ts`
- `packages/geometry-core/tests/engine/*.property.test.ts` (nuevos archivos)
- `package.json` (script `test:property`)

## Etiquetas sugeridas

`testing`, `geometry-core`, `help wanted`, `phase-3m`

## Prioridad

Media