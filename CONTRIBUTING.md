# Guía de Contribución — FurniConfig

> **Idioma principal:** Español. Los issues y PRs pueden redactarse en español o inglés.

---

## 🎯 ¿Cómo contribuir?

Agradecemos cualquier tipo de contribución:

- 🐛 **Reportar bugs** — Usa la plantilla de bug report.
- 💡 **Proponer mejoras** — Usa la plantilla de feature request.
- 📝 **Mejorar documentación** — Corrige typos, añade ejemplos, traduce.
- 🔧 **Enviar código** — Fixes, nuevas herramientas, refactors, tests.
- ♿ **Accesibilidad** — Mejora WAI-ARIA, contraste, navegación por teclado.
- 🎨 **UX/Diseño** — Mejora flujos, iconos, feedback visual.
- 🪵 **Conocimiento carpintero** — Valida reglas, sugiere límites reales.

---

## 🚀 Primeros pasos

### 1. Configura tu entorno

```bash
# Requisitos
# - Node.js >= 22.12
# - npm >= 10

# Clona tu fork
git clone https://github.com/TU_USUARIO/furniconfig.git
cd furniconfig

# Instala dependencias (usa npm workspaces)
npm install

# Verifica que todo funciona
npm run typecheck
npm test
npm run build
```

### 2. Ejecuta el visualizador en desarrollo

```bash
npm run dev --workspace @furniconfig/web
# Abre http://localhost:5173
```

### 3. Pruebas visuales (opcional, local)

```bash
npm run test:visual --workspace @furniconfig/web
# Requiere Chromium/Chrome instalado
```

---

## 🌿 Flujo de trabajo con Git

### Ramas

- `main` — Rama protegida, solo merge via PR.
- `fix/*` — Corrección de bug (ej. `fix/clickguard-orbit`).
- `feat/*` — Nueva funcionalidad (ej. `feat/drawer-preview`).
- `docs/*` — Documentación (ej. `docs/oss-readme`).
- `refactor/*` — Refactor sin cambio funcional.
- `test/*` — Añadir/actualizar pruebas.

### Commits

Usa **Conventional Commits** (en inglés):

```
fix: clickGuard consume ref on each call
feat: add visual separator dragging
docs: update README with installation steps
refactor: extract clickGuard to separate module
test: add orbit drag regression test
```

### Pull Requests

1. Crea la rama desde `main` actualizado.
2. Haz commits atómicos y descriptivos.
3. Ejecuta localmente: `npm run typecheck && npm test && npm run build`.
4. Abre PR hacia `main` usando la plantilla.
5. Rellena la checklist del PR.
6. Espera CI (typecheck + tests + build) y revisión.

> **Regla**: No hacer merge directo a `main`. Siempre via PR con CI aprobado.

---

## 🧪 Pruebas

### Unitarias (Vitest)

```bash
npm test                    # Todas (geometry-core + web)
npm test --workspace @furniconfig/geometry-core
npm test --workspace @furniconfig/web
```

- **geometry-core**: 179 tests (motor puro, determinista).
- **web**: 164 tests (React, hooks, utils, visual-check helpers).
- **Total**: 343 tests.

### Visuales (Playwright) — Solo local

```bash
npm run test:visual --workspace @furniconfig/web
```

- Requieren Chromium/Chrome instalado.
- Tardan varios minutos.
- Generan capturas en `/tmp/opencode/fase3a/`.
- **No bloquean CI** (se ejecutan localmente por ahora).

### Buenas prácticas de testing

- **Una prueba = un comportamiento**.
- Nombra tests describiendo el comportamiento: `debería deseleccionar al clicar en vacío`.
- Usa `describe` para agrupar por funcionalidad.
- No mockees el motor geométrico: es puro y determinista.
- Para tests visuales: usa `shootStable` y `pixelDiffRatio`.

---

## 🏗️ Arquitectura — Qué tocar y qué no

### `packages/geometry-core` (Motor puro)

- **Sin Three.js, React, I/O, estado global**.
- Funciones puras: misma entrada → misma salida.
- Valida entrada con `validateWardrobeConfig()` antes de calcular.
- Lanza `GeometryError` con código estable (`GeometryErrorCode`).
- Tests: casos nominales, límites y entradas inválidas.

### `apps/web` (Capa de presentación)

- Conversión mm → m **solo** en `src/lib/units.ts`.
- Adaptación de paneles a mallas **solo** en `src/lib/panels-to-mesh.ts`.
- La web **no muta** configuración: usa funciones puras de `src/lib/config.ts`.
- Estado: historial (`use-editor-history`), sesión (`use-design-session`).
- UI: React 19 + Three.js (R3F) + React Three Fiber/Drei.

### Reglas de oro

| ✅ Haz | ❌ No hagas |
|--------|-------------|
| Funciones puras en `geometry-core` | Importar Three.js/React en `geometry-core` |
| Validar antes de calcular | Mutar config directamente en la web |
| Tests unitarios para motor | Mutar estado global |
| IDs deterministas (`module-1`) | UUIDs aleatorios |
| `strict: true` + `noUncheckedIndexedAccess` | `any` sin justificación |

---

## 🎨 Convenciones de código

- **TypeScript strict**: `strict: true`, `noUncheckedIndexedAccess`.
- **ESLint + Prettier** (config en `package.json` / `eslint.config.js`).
- Identificadores en **inglés**; docs y comentarios en **español**.
- Archivos `kebab-case`; exports nombrados; sin `default export` en motor.
- IDs deterministas: `module-1`, `panel-side-left`, `material-structure`.
- Errores: `GeometryError` con `code` de `GeometryErrorCode`.

---

## ♿ Accesibilidad (WAI-ARIA)

- Todas las interacciones por teclado: Tab, Flechas, Home/End, Escape, Enter.
- Roles ARIA: `tablist`, `tab`, `tabpanel`, `button`, `slider`, `dialog`.
- Estados: `aria-selected`, `aria-expanded`, `aria-pressed`, `aria-disabled`.
- Foco visible: `focus-visible` con anillo azul (`outline: 2px solid var(--accent)`).
- Contraste mínimo 4.5:1 (WCAG AA).
- Navegación por teclado en paneles, toolbars, visor.

---

## 📝 Documentación

- **Idioma principal**: Español. Incluye intro en inglés en README.
- Archivos `kebab-case`: `architecture.md`, `product-rules.md`.
- ADRs en `docs/architecture.md` (formato: título, contexto, decisión, consecuencias).
- Reglas de producto en `docs/product-rules.md` (marca **PROVISIONAL** si no validado).
- Roadmap en `docs/roadmap.md` (fases con checklist).

---

## 🔒 Seguridad

- **No commitees secretos** (tokens, claves, passwords).
- `.env*` en `.gitignore`.
- Reporte de vulnerabilidades: ver [SECURITY.md](SECURITY.md).
- Dependencias: `npm audit` en CI.

---

## 🏷️ Etiquetas sugeridas para Issues/PRs

| Etiqueta | Uso |
|----------|-----|
| `good first issue` | Ideal para nuevos colaboradores |
| `help wanted` | Se busca ayuda |
| `bug` | Error funcional |
| `enhancement` | Nueva funcionalidad/mejora |
| `documentation` | Solo docs |
| `geometry-core` | Motor geométrico |
| `frontend` | apps/web (React/Three.js) |
| `UX` | Experiencia de usuario |
| `testing` | Pruebas unitarias/visuales |
| `accessibility` | Accesibilidad WAI-ARIA |

---

## 🤝 Código de Conducta

Ver [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Resumen:

- Sé respetuoso, inclusivo y constructivo.
- No toleramos acoso, discriminación ni conducta tóxica.
- Reporta incidencias a: conduct@furniconfig.example.com (placeholder).

---

## 📞 Contacto

- Issues: [GitHub Issues](https://github.com/jesusrv1103/furniconfig/issues)
- Discusiones: [GitHub Discussions](https://github.com/jesusrv1103/furniconfig/discussions)
- Email del mantenedor: jesus.ramirez@newsoftglobal.com (placeholder)

---

> **Gracias por contribuir a FurniConfig**. Cada aporte, grande o pequeño, mejora la herramienta para carpinteros, diseñadores y fabricantes.