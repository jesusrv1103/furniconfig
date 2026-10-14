# Issue #121: Tests de regresión visual (pixelmatch)

## Descripción
Comparación de capturas base vs actual con umbral configurable para detectar regresiones visuales automáticamente.

## Descripción técnica

### Capturas base versionadas
- Directorio: `apps/web/tests/visual/baselines/` (en repo, versionado).
- Estructura:
  ```
  tests/visual/baselines/
  ├── 01-inicial.png
  ├── 02-ancho-2800.png
  ├── 03b-cinco-cajones.png
  ├── ...
  ├── evidence-3f2-01-controles.png
  └── manifest.json  # { "01-inicial": { hash: "sha256...", size: 123456 } }
  ```

### Pixelmatch
- Librería: `pixelmatch` (rápido, sin dependencias nativas).
- Configuración:
  ```typescript
  // tests/visual/pixelmatch.config.ts
  export const PIXELMATCH_CONFIG = {
    threshold: 0.1,      // tolerancia por canal (0-1)
    includeAA: true,     // incluir anti-aliasing
    alpha: 0.3,          // transparencia diff
    diffColor: [255, 0, 0],  // color diff (rojo)
  };
  ```
- Umbrales por tipo de test:
  - **Estabilidad** (sin cambios): threshold 0.01 (0.1% pixeles).
  - **Cambio funcional** (ancho, módulos): threshold 0.05 (5%).
  - **Materiales/iluminación**: threshold 0.1 (10%).

### Integración en visual-check.mjs
```javascript
// tests/visual/visual-check.mjs
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

async function compareWithBaseline(page, name, baselineName) {
  const current = await page.locator('canvas').screenshot();
  const baseline = fs.readFileSync(`tests/visual/baselines/${baselineName}.png`);
  
  const img1 = PNG.sync.read(current);
  const img2 = PNG.sync.read(baseline);
  const diff = new PNG({ width: img1.width, height: img1.height });
  
  const diffPixels = pixelmatch(
    img1.data, img2.data, diff.data,
    img1.width, img1.height,
    PIXELMATCH_CONFIG
  );
  
  const diffRatio = diffPixels / (img1.width * img1.height);
  const threshold = getThresholdForTest(name);
  
  if (diffRatio > threshold) {
    fs.writeFileSync(`/tmp/opencode/fase3a/diff-${name}.png`, PNG.sync.write(diff));
    throw new Error(`Visual regression: ${name} diff ${(diffRatio*100).toFixed(2)}% > ${threshold*100}%`);
  }
}
```

### Actualización de baselines
- Comando: `npm run test:visual:update-baselines` → regenera capturas base.
- Requiere revisión manual antes de commit (PR con capturas actualizadas).

## Criterios de aceptación

- [ ] Directorio `tests/visual/baselines/` con capturas base versionadas.
- [ ] `pixelmatch` integrado en `visual-check.mjs`.
- [ ] Umbrales configurables por tipo de test.
- [ ] Comparación pixel-a-pixel con tolerancia configurable.
- [ ] Reporte diff visual (imagen diff roja) en fallo.
- [ ] Comando `npm run test:visual:update-baselines` para actualizar.
- [ ] Tests unitarias para pixelmatch (thresholds, diff generation).

## Áreas afectadas

- `apps/web/tests/visual/visual-check.mjs` (integración pixelmatch)
- `apps/web/tests/visual/pixelmatch.config.ts` (configuración)
- `apps/web/tests/visual/baselines/` (capturas base, en repo)
- `package.json` (scripts: `test:visual:update-baselines`)
- `package.json` (deps: `pixelmatch`, `pngjs`)
- Tests unitarias para pixelmatch

## Etiquetas sugeridas

`testing`, `frontend`, `good first issue`, `phase-3m`

## Prioridad

Media