# Roadmap Comunitario — FurniConfig

> **Idioma principal:** Español. Incluye resumen en inglés al final.
>
> **Versión:** 1.0 | **Fecha:** 2024-10-14
>
> Este roadmap describe oportunidades para la comunidad. Las fases 0–3F.2 están completadas e integradas en `main`. Las fases 3G+ son oportunidades abiertas para la comunidad.

---

## 📋 Estado actual (Fases completadas)

| Fase | Estado | Descripción |
|------|--------|-------------|
| **Fase 0** | ✅ | Motor geométrico puro (`geometry-core`) |
| **Fase 2A** | ✅ | Paneles, entrepaños, barras de colgado |
| **Fase 2B** | ✅ | Cajoneras |
| **Fase 2C** | ✅ | Puertas abatibles (1–2 hojas, apertura 0–110°) |
| **Fase 3D** | ✅ | Distribución flexible (ancho libre, fijar/liberar, igualar, repartir) |
| **Fase 3E** | ✅ | Studio simplificado (4 categorías, navegación teclado, modo simple/avanzado) |
| **Fase 3F.1** | ✅ | Cotas visuales 3D (motor puro, render CAD, mm/cm) |
| **Fase 3F.2** | ✅ | Arrastre visual de separadores (clickGuard, teclado, historial) |
| **QA-VISUAL-01** | ✅ | Estabilización clickGuard + suite visual 200/200 |

---

## 🗺️ Roadmap comunitario (Fases 3G+)

> **Nota**: Las fases futuras son **oportunidades abiertas** para la comunidad. No hay fechas comprometidas. La prioridad la marca la comunidad.

---

### 🎯 Fase 3G — Funcionalidades de productividad (Prioridad alta)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#100: Duplicar módulo** | Botón "Duplicar" en panel contextual para clonar módulo adyacente. | - Duplica config (tipo, ancho, repisas, cajones, barra)<br>- Inserta adyacente<br>- Actualiza historial (1 paso) | `enhancement`, `frontend`, `good first issue` |
| **#101: Copiar/pegar configuración de módulo** | Copiar config de un módulo y pegar en otro (atajo Ctrl+C/Ctrl+V o menú contextual). | - Copia tipo, ancho, repisas, cajones, barra, material<br>- Pega en módulo seleccionado<br>- Historial 1 paso | `enhancement`, `frontend`, `UX` |
| **#102: Deshacer/Rehacer global (Ctrl+Z/Y en toda la app)** | Atajos globales funcionando fuera de inputs (ya parcial en 3C). | - Ctrl+Z deshace última acción en cualquier foco<br>- Ctrl+Y rehace<br>- No interfiere con inputs | `enhancement`, `frontend`, `accessibility` |
| **#103: Zoom a selección (Fit selection)** | Botón "Encuadrar selección" que encuadra solo módulos seleccionados. | - Calcula bounding box de módulos seleccionados<br>- Cámara encuadra con margen 10%<br>- Funciona con 1 o múltiples módulos | `enhancement`, `frontend`, `good first issue` |

---

### 🎨 Fase 3H — Materiales y acabados (Prioridad media)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#104: Editor de materiales visual** | Panel para crear/editiar materiales (color, textura, brillo, roughness). | - Selector de color (HEX/RGB)<br>- Upload textura (imagen → texture)<br>- Sliders roughness/metalness<br>- Preview en esfera 3D<br>- Guarda en config.materials | `enhancement`, `frontend`, `UX` |
| **#105: Biblioteca de materiales predefinidos** | Catálogo de materiales comunes (melaminas, maderas, lacados, vidrios). | - JSON con 20+ materiales predefinidos<br>- Categorías: melamina, madera, lacado, vidrio, metal<br>- Preview en tarjeta<br>- Botón "Usar este material" | `enhancement`, `frontend`, `documentation` |
| **#106: Materiales por cara (interior/exterior)** | Diferente material para cara interior vs exterior de paneles. | - Config por panel: `materialInterior`, `materialExterior`<br>- UI en panel contextual<br>- Render correcto en Three.js (side: DoubleSide) | `enhancement`, `geometry-core`, `frontend` |

---

### 🏗️ Fase 3I — Nuevas tipologías de muebles (Prioridad media-alta)

> Objetivo: Extender el motor para soportar nuevas familias de muebles.

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#107: Estanterías modulares** | Estanterías abiertas (sin puertas, sin cajones, solo entrepaños + laterales + trasera). | - Tipo `shelf` en config<br>- Sin puertas, sin cajones, sin barra<br>- Entrepaños configurables (cantidad, posición)<br>- Laterales + trasera obligatorios | `enhancement`, `geometry-core`, `frontend`, `help wanted` |
| **#108: Muebles de baño (vanity)** | Mueble bajo lavabo (2 puertas, 1 cajón, hueco sifón). | - Tipo `vanity`<br>- Hueco sifón configurable (posición, tamaño)<br>- 1 cajón superior + 2 puertas<br>- Panel trasero con recorte | `enhancement`, `geometry-core`, `frontend`, `help wanted` |
| **#109: Cocinas modulares (base)** | Módulos base de cocina (cajones, puertas, hueco horno/lavavajillas). | - Tipo `kitchen-base`<br>- Módulos estándar 60/80/90cm<br>- Huecos para electrodomésticos<br>- Zócalo, encimera, tiradores | `enhancement`, `geometry-core`, `frontend`, `help wanted` |

---

### 🔧 Fase 3J — Motor y datos (Prioridad técnica)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#110: Validación de estabilidad estructural** | Motor verifica que el mueble no vuelque (centro de gravedad dentro de base). | - Cálculo centro de gravedad (materiales + contenido estimado)<br>- Check: CG dentro de base + margen seguridad<br>- Warning en UI si inestable | `enhancement`, `geometry-core`, `help wanted` |
| **#111: Lista de corte (cut list) exportable** | Genera lista de piezas con dimensiones, material, cantidad, etiquetas. | - Exporta CSV/JSON/PDF<br>- Incluye: pieza, dimensiones, material, cantidad, cantos<br>- Agrupa por material<br>- Etiquetas para optimización (nesting) | `enhancement`, `geometry-core`, `frontend`, `good first issue` |
| **#112: Optimización de corte (nesting básico)** | Algoritmo simple para optimizar placas (guillotine o shelf packing). | - Input: lista de piezas + tamaño placa (2440x1220, 2800x2070)<br>- Output: planos de corte + desperdicio %<br>- Exporta SVG/DXF para CNC | `enhancement`, `geometry-core`, `help wanted` |
| **#113: Validación de reglas carpinteras reales** | Reemplazar límites provisionales por reglas validadas con carpinteros. | - Encuesta a 5+ carpinteros<br>- Documentar reglas: min/max ancho, huecos, cantos, refuerzos<br>- Actualizar `docs/product-rules.md` y `contract/limits.ts` | `documentation`, `geometry-core`, `help wanted` |

---

### 🌐 Fase 3K — Plataforma y colaboración (Prioridad media)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#114: Compartir diseño por URL** | Genera URL corta que carga diseño en visor (solo lectura). | - Serializa config en URL (comprimida)<br>- Visor de solo lectura (sin edición)<br>- Expiración opcional<br>- QR code para móvil | `enhancement`, `frontend`, `good first issue` |
| **#115: Comentarios en diseños** | Comentarios anidados en diseños guardados (para equipo/carpintero). | - CRUD comentarios en diseño guardado<br>- Menciones @usuario<br>- Notificaciones (email/localStorage)<br>- Resuelto/pendiente | `enhancement`, `frontend`, `help wanted` |
| **#116: Historial de versiones de diseño** | Versionado automático de diseños guardados (git-like). | - Snapshots automáticos en cada guardado<br>- Diff visual entre versiones<br>- Restaurar versión anterior<br>- Ramas (fork de diseño) | `enhancement`, `frontend`, `help wanted` |

---

### ♿ Fase 3L — Accesibilidad y UX (Prioridad alta)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#117: Auditoría WCAG 2.1 AA completa** | Auditoría completa + fixes para AA. | - axe-core en CI<br>- Contraste 4.5:1 mínimo<br>- Focus visible en todos los elementos<br>- Navegación teclado completa<br>- Screen reader testing (NVDA/VoiceOver) | `accessibility`, `frontend`, `high priority` |
| **#118: Modo alto contraste** | Tema alto contraste para baja visión. | - Toggle en TopBar<br>- CSS variables para tema<br>- Persiste en localStorage<br>- Funciona en todos los componentes | `accessibility`, `frontend`, `good first issue` |
| **#119: Internacionalización (i18n)** | Soporte multiidioma (ES/EN base, extensible). | - i18n library (i18next o similar)<br>- ES/EN completos<br>- Estructura para añadir idiomas<br>- Selector de idioma en TopBar | `enhancement`, `frontend`, `documentation` |

---

### 🧪 Fase 3M — Calidad y testing (Prioridad técnica)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#120: Pruebas visuales en CI (Chromium headless)** | Mover pruebas visuales a GitHub Actions con Chromium headless. | - Job separado `visual-tests`<br>- Chromium headless en ubuntu-latest<br>- Artefactos: capturas + reporte<br>- Timeout 10 min<br>- Reintentos (2x) en flakes | `testing`, `CI`, `help wanted` |
| **#121: Tests de regresión visual (pixelmatch)** | Comparación de capturas base vs actual con umbral configurable. | - Capturas base versionadas en repo (`tests/visual/baselines/`)<br>- pixelmatch con tolerancia configurable<br>- Reporte HTML con diffs<br>- Fail si diff > umbral | `testing`, `frontend`, `good first issue` |
| **#122: Tests de propiedad (fast-check)** | Property-based testing para motor geométrico. | - fast-check para `distributeModules`, `panels`, `doors`<br>- Propiedades: suma exacta, límites, determinismo<br>- 1000+ casos aleatorios por test | `testing`, `geometry-core`, `help wanted` |

---

### 📚 Fase 3N — Documentación y ejemplos (Prioridad continua)

| Issue propuesto | Descripción | Criterios de aceptación | Etiquetas sugeridas |
|-----------------|-------------|-------------------------|---------------------|
| **#123: Guía de migración de versiones** | Documento para migrar configs entre versiones de contrato. | - Tabla versiones → cambios breaking<br>- Script de migración automática (si posible)<br>- Ejemplos reales | `documentation`, `good first issue` |
| **#124: Ejemplos de uso (cookbook)** | Recetas: "Cómo hacer X" (clóset esquina, estantería, vanity, etc.). | - 10+ recetas con capturas<br>- Config JSON + explicación<br>- Enlaces a issues relacionados | `documentation`, `good first issue` |
| **#125: Video tutoriales** | Videos cortos (2-5 min) para features clave. | - 5 videos: inicio, medidas, interior, apariencia, proyectos<br>- Subtítulos ES/EN<br>- Publicados en YouTube/GitHub | `documentation`, `help wanted` |

---

## 🏷️ Etiquetas propuestas para GitHub

| Etiqueta | Color | Descripción |
|----------|-------|-------------|
| `good first issue` | #7057ff | Ideal para nuevos colaboradores |
| `help wanted` | #0075ca | Se busca ayuda activa |
| `bug` | #d73a4a | Error funcional |
| `enhancement` | #a2eeef | Nueva funcionalidad/mejora |
| `documentation` | #0075ca | Solo documentación |
| `geometry-core` | #5319e7 | Motor geométrico (packages/geometry-core) |
| `frontend` | #1d76db | apps/web (React/Three.js) |
| `UX` | #fbca04 | Experiencia de usuario |
| `testing` | #bfd4f2 | Pruebas unitarias/visuales |
| `accessibility` | #d4c5f9 | Accesibilidad WAI-ARIA |
| `CI` | #bfdadc | Integración continua |
| `security` | #ee0701 | Seguridad |
| `dependencies` | #0366d6 | Actualización de dependencias |

---

## 🗳️ Cómo priorizar

La comunidad decide la prioridad mediante:

1. **Reacciones 👍 en issues** — Cuantos más 👍, mayor prioridad.
2. **Comentarios con contexto** — "Necesito esto para mi carpintería porque..."
3. **PRs listos** — Un PR listo para merge sube prioridad automáticamente.
4. **Votación trimestral** — Encuesta en Discussions cada trimestre.

---

## 🤝 Cómo participar

1. **Elige un issue** (o propone uno nuevo).
2. **Comenta** "Me apunto" o abre PR con `Draft`.
3. **Pregunta dudas** en el issue o en Discussions.
4. **Entrega PR** → CI verde → Revisión → Merge.

---

## 🇺🇸 English Summary

**Current**: Phases 0–3F.2 completed (geometry-core, panels, rods, drawers, doors, flexible widths, studio, dimensions, separator drag). QA-VISUAL-01 stabilized (200/200 visual checks).

**Community Roadmap (3G+)**:
- **3G**: Productivity (duplicate module, copy/paste, global undo, fit selection)
- **3H**: Materials (visual editor, library, per-face materials)
- **3I**: New furniture types (shelves, vanity, kitchen base)
- **3J**: Engine/data (structural validation, cut list, nesting, carpentry rules)
- **3K**: Collaboration (share URL, comments, version history)
- **3L**: Accessibility (WCAG AA, high contrast, i18n)
- **3M**: Quality (visual CI, pixelmatch, property-based testing)
- **3N**: Docs (migration guide, cookbook, videos)

**Labels**: `good first issue`, `help wanted`, `bug`, `enhancement`, `documentation`, `geometry-core`, `frontend`, `UX`, `testing`, `accessibility`, `CI`.

**Prioritization**: Community votes (👍), context comments, ready PRs, quarterly poll.

**Get involved**: Pick an issue → comment "I'll take it" → draft PR → CI green → review → merge.