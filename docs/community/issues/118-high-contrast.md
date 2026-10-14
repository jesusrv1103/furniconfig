# Issue #118: Modo alto contraste

## Descripción
Tema de alto contraste para usuarios con baja visión.

## Descripción técnica

- **CSS Variables** para temas en `src/styles.css`:
  ```css
  :root {
    --bg: #ffffff;
    --text: #1f2937;
    --accent: #2f6feb;
    --border: #d1d5db;
    --muted: #6b7280;
    /* ... */
  }
  
  @media (prefers-contrast: more) {
    :root {
      --bg: #000000;
      --text: #ffffff;
      --accent: #ffff00;
      --border: #ffffff;
      --muted: #cccccc;
    }
  }
  
  [data-theme="high-contrast"] {
    --bg: #000000;
    --text: #ffffff;
    --accent: #ffff00;
    --border: #ffffff;
    --muted: #cccccc;
  }
  ```
- **Toggle en TopBar**: botón "Alto contraste" (icono sol/luna/contraste).
  - `aria-pressed` para estado.
  - Persiste en `localStorage` (`theme: 'high-contrast' | 'auto' | 'light' | 'dark'`).
  - Respeta `prefers-contrast: more` (media query) como default.
- **Variables CSS** para todos los colores (bg, text, accent, border, muted, error, success, warning).
- **Componentes**: todos usan variables CSS (sin colores hardcoded).
- **Preview**: selector de tema en TopBar (Auto / Claro / Oscuro / Alto contraste).

## Criterios de aceptación

- [ ] Variables CSS para todos los colores (bg, text, accent, border, muted, error, success, warning).
- [ ] Media query `prefers-contrast: more` aplica tema alto contraste automático.
- [ ] Toggle en TopBar: "Alto contraste" (icono + `aria-pressed`).
- [ ] Persistencia en `localStorage` (`theme`).
- [ ] Selector de tema en TopBar (Auto/Claro/Oscuro/Alto contraste).
- [ ] Todos los componentes usan variables CSS (sin colores hardcoded).
- [ ] Test visual: modo alto contraste legible (contraste ≥ 7:1).
- [ ] Tests unitarias (toggle, persistencia, media query).

## Áreas afectadas

- `apps/web/src/styles.css` (variables CSS, media queries, tema alto contraste)
- `apps/web/src/components/studio/TopBar.tsx` (toggle + selector tema)
- `apps/web/src/hooks/use-theme.ts` (nuevo hook: tema + persistencia)
- `apps/web/src/App.tsx` (proveedor tema)
- Tests unitarias (toggle, persistencia, media query)

## Etiquetas sugeridas

`accessibility`, `frontend`, `good first issue`, `phase-3l`

## Prioridad

Media