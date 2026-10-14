# Changelog — FurniConfig

> Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y versionado [SemVer](https://semver.org/lang/es/).

> **Nota**: Este proyecto está en fase pre-1.0 (0.x). La API pública y los contratos pueden cambiar sin aviso previo en versiones menores.

---

## [Unreleased] — En desarrollo (main)

### Added
- **QA-VISUAL-01**: Estabilización completa de clickGuard y suite visual.
  - `clickGuard` consume ref en cada llamada (evita contaminación entre gestos).
  - `wasDragRef` evita deselección espuria tras arrastre de órbita.
  - `meshClickedRef` compartido con WardrobeScene evita deselección cuando handlePick selecciona.
  - Red de seguridad global `pointerup` (capture) limpia ref si se suelta fuera.
  - `onPointerMissed` usa `clickGuard` para distinguir clic vs órbita.
  - `onClick` fallback ignora clics en elementos interactivos (botones, inputs, tabs) → corrige test "Ajustar".
- **Fase 3F.2**: Arrastre visual de separadores (PR #6).
  - Motor puro `computeDragResult` (cuantización 1/10 mm, clamp).
  - Componente 3D `DividerDragHandle` con `pointer capture`, raycasting plano Y=0, Escape.
  - Botón "Arrastre divisores" + selector 1/10 mm en barra.
  - Historial una entrada por arrastre; Escape cancela.
  - OrbitControls desactivado solo durante arrastre válido.
  - Controles de teclado (Tab, flechas, Escape) por separador.
- **Fase 3F.1**: Cotas visuales 3D.
  - Motor puro `lib/studio/dimensions.ts` (generales y contextuales).
  - Render CAD con líneas, flechas y etiquetas sobre el modelo.
  - Unidades mm/cm de presentación y control "Cotas" en visor.
- **Fase 3E**: Experiencia simplificada (Studio).
  - Panel único con 4 categorías (Medidas, Interior, Apariencia, Mis diseños).
  - Navegación por teclado (flechas/Home/End) y WAI-ARIA.
  - Modo sencillo/avanzado (secciones colapsables).
  - TopBar con deshacer/rehacer + atajo "Mis diseños".
  - Panel contextual editable (tipo, repisas, cajones, barra, ancho módulo).
  - Barra inferior de estado, paneles laterales colapsables, modo sencillo/avanzado.
- **Fase 3D**: Distribución flexible.
  - Ancho interior libre por módulo (mm enteros).
  - Reparto uniforme histórico preservado.
  - Fijar/liberar anchos, Igualar anchos, Repartir espacio restante.
  - Plantilla mixto (ancho declarado + reparto automático).
  - Suma exacta y códigos de error estables.
- **Fase 3C**: Studio de diseño.
  - Selección directa 3D (clic + umbral anti-drag).
  - Panel contextual editable (tipo, repisas, cajones, barra, ancho).
  - Deshacer/Rehacer acotado (Ctrl+Z fuera de inputs).
  - Panel contextual con previsualización de módulos afectados.
  - Selección por lista y clic 3D (consistencia UI/3D).
- **Fases 2A–2C**: Geometría base.
  - Paneles, entrepaños, barras de colgado, cajoneras, puertas abatibles.
  - Panel trasero opcional, tiradores, materiales.

### Changed
- **clickGuard**: Ahora consume `pointerDownRef` en cada llamada para evaluar cada gesto independientemente.
- **OrbitControls**: Se desactiva solo durante arrastre válido de separador; se restaura siempre (soltar, Escape, pointercancel, lostpointercapture, focus lost, unmount).
- **onClick fallback**: Ignora clics en elementos interactivos (botones, inputs, selects, tabs, roles button/tab/menuitem).
- **Suite visual**: 200/200 checks pasan (4 ejecuciones consecutivas estables).

### Fixed
- 4 fallos visuales críticos (QA-VISUAL-01): deselección, cotas, centímetros, restauración etiquetas.
- Test "Ajustar" fallaba por deselección espuria al clicar botón → corregido filtrando elementos interactivos en `onClick`.
- clickGuard contaminaba clics posteriores tras arrastre de órbita (consumo de ref por gesto).
- Deselección espuria tras arrastre de órbita (wasDragRef).
- Deselección espuria tras selección 3D (meshClickedRef).

---

## [0.6.0] — 2024-10-13 (Merge PR #7: QA-VISUAL-01)

### Added
- Fix completo de clickGuard y estabilidad visual (QA-VISUAL-01).
- Test "Ajustar" corregido (filtro de elementos interactivos en onClick).

### Changed
- Merge commit `4b3c31f` preservando historial.

---

## [0.5.0] — 2024-10-13 (Merge PR #6: Fase 3F.2)

### Added
- **Fase 3F.2**: Arrastre visual de separadores completo.
- Motor puro `lib/studio/separators.ts` (`computeDragResult`).
- Componente 3D `DividerDragHandle` + controles teclado.
- OrbitControls desactivado durante arrastre.
- Historial: una entrada por arrastre completo.

### Fixed
- 4 fallos visuales previos (QA-VISUAL-01 previos).

---

## [0.4.0] — 2024-10-13 (Merge PR #5: Fase 3F.1)

### Added
- **Fase 3F.1**: Cotas visuales 3D completas.
- Motor puro `lib/studio/dimensions.ts`.
- Render CAD (líneas, flechas, etiquetas) sobre modelo.
- Unidades mm/cm, control "Cotas" en visor.

---

## [0.3.0] — 2024-10-13 (Merge PR #4: Fase 3E)

### Added
- **Fase 3E**: Studio simplificado (4 categorías, navegación teclado, modo simple/avanzado).
- TopBar con deshacer/rehacer + "Mis diseños".
- Panel contextual editable + previsualización módulos afectados.
- Barra inferior, paneles colapsables, modo simple/avanzado.

---

## [0.2.0] — 2024-10-13 (Merge PR #3: Fase 3D)

### Added
- **Fase 3D**: Distribución flexible de anchos.
- Ancho libre por módulo (mm enteros), suma exacta.
- Fijar/liberar, Igualar, Repartir, Plantilla mixto.
- Suma exacta, códigos de error estables.

---

## [0.1.0] — 2024-10-13 (Merge PR #1/2: Fases 0–2C)

### Added
- **Fase 0**: Motor geométrico puro (`geometry-core`).
- **Fase 2A**: Paneles, entrepaños, barras de colgado.
- **Fase 2B**: Cajoneras.
- **Fase 2C**: Puertas abatibles (1–2 hojas, apertura 0–110°).
- Panel trasero opcional, tiradores, materiales.

---

## Convenciones de versión

- **MAJOR (X.0.0)**: Cambios incompatibles en contratos/motor.
- **MINOR (0.X.0)**: Nuevas funcionalidades, fases completadas.
- **PATCH (0.0.X)**: Fixes, correcciones visuales, docs.

> **Nota pre-1.0**: Las versiones 0.x pueden romper API/contratos en versiones menores.