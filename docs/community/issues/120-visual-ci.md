# Issue #120: Pruebas visuales en CI (Chromium headless)

## Descripción
Mover pruebas visuales (Playwright) a GitHub Actions con Chromium headless para detección automática de regresiones visuales.

## Descripción técnica

### Job CI separado
```yaml
# .github/workflows/visual-tests.yml
name: Visual Tests
on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'  # nocturno

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - name: Install dependencies
        run: npm ci
      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium
      - name: Build
        run: npm run build
      - name: Run visual tests
        run: npm run test:visual --workspace @furniconfig/web
        env:
          PLAYWRIGHT_BROWSERS_PATH: /usr/bin
      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-screenshots
          path: /tmp/opencode/fase3a/
          retention-days: 7
      - name: Upload report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-report
          path: /tmp/opencode/fase3a/inspeccion.json
```

### Configuración Playwright para CI
```typescript
// apps/web/tests/visual/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: false,
  retries: 2,                    // reintenta 2x en flakes
  timeout: 120_000,              // 2 min por test
  reporter: [['json', { outputFile: 'visual-report.json' }]],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview --workspace @furniconfig/web',
    port: 4173,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
```

### Optimizaciones
- **Retries**: 2 reintentos en flakes (timeout 120s por test).
- **Paralelismo**: `fullyParallel: false` (tests visuales secuenciales por estado compartido).
- **Artifacts**: capturas + reporte JSON subidos como artifacts (7 días).
- **Schedule**: nocturno + en PRs.

## Criterios de aceptación

- [ ] Job `visual-tests` en CI pasa en PRs y schedule nocturno.
- [ ] Chromium headless instalado con deps (`playwright install --with-deps chromium`).
- [ ] Retries: 2 reintentos, timeout 120s/test.
- [ ] Artifacts: capturas + reporte JSON subidos (7 días).
- [ ] Tests visuales pasan en CI (200/200).
- [ ] Tiempo total < 30 min (timeout job).
- [ ] Documentación: `docs/visual-testing-ci.md`.

## Áreas afectadas

- `.github/workflows/visual-tests.yml` (nuevo workflow)
- `apps/web/tests/visual/playwright.config.ts` (config Playwright CI)
- `apps/web/tests/visual/visual-check.mjs` (ajustes para CI: timeouts, retries)
- `docs/visual-testing-ci.md` (documentación)

## Etiquetas sugeridas

`testing`, `CI`, `help wanted`, `phase-3m`

## Prioridad

Media