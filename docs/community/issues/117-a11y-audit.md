# Issue #117: Auditoría WCAG 2.1 AA completa

## Descripción
Auditoría completa de accesibilidad + fixes para cumplir WCAG 2.1 Level AA.

## Descripción técnica

### Auditoría (fase 1)
- Ejecutar `axe-core` en CI (GitHub Actions).
- Testing manual con screen readers: NVDA (Windows), VoiceOver (macOS/iOS).
- Checklist WCAG 2.1 AA:
  - **1.1.1** Non-text content: alt text en imágenes/iconos, labels en inputs.
  - **1.3.1** Info and relationships: headings, labels, landmarks.
  - **1.4.3** Contrast (Minimum): 4.5:1 texto normal, 3:1 texto grande.
  - **1.4.4** Resize text: hasta 200% sin pérdida funcionalidad.
  - **2.1.1** Keyboard: toda funcionalidad por teclado.
  - **2.1.2** No keyboard trap.
  - **2.4.3** Focus order: orden lógico.
  - **2.4.7** Focus visible: anillo visible en todos los elementos.
  - **3.2.1** On focus: no cambio de contexto inesperado.
  - **3.3.2** Labels or instructions: labels en todos los inputs.

### Fixes (fase 2)
- **Contraste**: ajustar colores en `src/styles.css` (variables CSS).
- **Focus visible**: `outline: 2px solid var(--accent); outline-offset: 2px` en todos los elementos interactivos.
- **Labels**: `<label>` asociados a todos los inputs (explícitos o `aria-label`).
- **ARIA**: roles correctos (`tablist`, `tab`, `tabpanel`, `button`, `slider`, `dialog`, `alert`).
- **Focus management**: `focus-visible` polyfill, focus trapping en modales.
- **Skip links**: "Saltar al contenido principal" al inicio.
- **Landmarks**: `<main>`, `<nav>`, `<aside>`, `<header>`, `<footer>`.
- **Live regions**: `aria-live="polite"` para toasts/notificaciones.

### Testing automatizado
- `axe-core` en CI (GitHub Actions job `accessibility`).
- `axe-playwright` en tests visuales.
- Tests unitarias para componentes críticos (modales, tabs, sliders).

## Criterios de aceptación

- [ ] `axe-core` en CI: 0 violations nivel AA.
- [ ] Contraste ≥ 4.5:1 (texto normal), ≥ 3:1 (texto grande).
- [ ] Focus visible en TODOS los elementos interactivos (outline azul 2px).
- [ ] Navegación teclado completa (Tab, Flechas, Home/End, Escape, Enter).
- [ ] Focus trapping en modales/dialogs.
- [ ] Screen reader testing: NVDA + VoiceOver (sin bloqueos).
- [ ] `aria-live` en toasts/notificaciones.
- [ ] Skip link "Saltar al contenido" funcional.
- [ ] CI job `accessibility` pasa (axe-core 0 violations AA).

## Áreas afectadas

- `apps/web/src/styles.css` (colores, focus, skip link)
- `apps/web/src/components/` (ARIA roles, labels, focus management)
- `apps/web/src/hooks/use-focus-trap.ts` (nuevo hook)
- `.github/workflows/ci.yml` (job `accessibility` con axe-core)
- `apps/web/tests/accessibility/` (nuevas tests axe-playwright)
- Docs: `docs/accessibility-audit.md` (reporte)

## Etiquetas sugeridas

`accessibility`, `frontend`, `high priority`, `phase-3l`

## Prioridad

Alta