# AGENTS.md — Instrucciones persistentes para OpenCode

## Proyecto

**FurniConfig**: SaaS B2B para diseño paramétrico de muebles a medida.
Primer producto: clósets rectos modulares. Fase actual: **Fase 3E**
(Experiencia de diseño simplificada: panel de configuración
en cuatro categorías — Medidas, Interior, Apariencia y Mis
diseños — con pestañas accesibles WAI-ARIA, visor central
estable con scroll interno y lógica de pestañas pura en
`lib/studio/tabs.ts`; completada en la rama
`feat/3e-simplified-designer`, pendiente de commit/PR).
La siguiente fase está pendiente de apertura.

Antes de implementar cualquier cosa, lee `README.md`, `docs/architecture.md` y
`docs/product-rules.md`.

## Comandos

```bash
npm install
npm test             # Vitest en todos los paquetes (geometry-core + web)
npm run typecheck    # tsc --noEmit en todos los paquetes
npm run build        # compilación a dist/ y build de apps/web

# Servidor de desarrollo del visualizador
npm run dev --workspace @furniconfig/web   # http://localhost:5173

# Pruebas visuales reales (Playwright + Chromium)
npm run test:visual --workspace @furniconfig/web
```

Requiere Node.js >= 22.12. Gestor de paquetes: **npm workspaces** (no usar pnpm/yarn
en este proyecto).

## Reglas inviolables

1. **Unidad interna: milímetros enteros.** X = ancho, Y = alto, Z = profundidad.
   Origen en la esquina inferior-izquierda-frontal; posiciones = esquina mínima.
2. **El motor geométrico (`packages/geometry-core`) es puro**: sin Three.js, sin
   React, sin dependencias runtime, sin I/O, sin estado global. Funciones
   deterministas: misma entrada → misma salida.
3. **Validar antes de calcular.** Toda entrada externa pasa por
   `validateWardrobeConfig()`; el motor lanza `GeometryError` con código estable.
   La web captura `GeometryError` (configuraciones geométricamente inviables,
   p. ej. ancho insuficiente) y las muestra como estado inválido.
4. **No inventar reglas de fabricación.** Si un límite o regla no está confirmado
   por carpintería, se centraliza en `src/contract/limits.ts` y se marca como
   **PROVISIONAL** en `docs/product-rules.md`.
5. **Sin dependencias nuevas** sin justificación explícita (anótala en el PR/comentario).
6. **Código tipado** con `strict: true` y `noUncheckedIndexedAccess`.
7. **Pruebas obligatorias** para funciones geométricas: casos nominales, límites y
   entradas inválidas. Ejecutarlas y reportar resultados reales.
8. **No hacer commits ni push automáticamente.** El usuario decide cuándo.
9. **No implementar** autenticación, pagos, backend, cotizaciones ni un editor CAD
   hasta que la fase correspondiente esté abierta (ver `docs/roadmap.md`).
10. **Capa de presentación (`apps/web`)**: la conversión mm → m ocurre
    **exclusivamente** en `src/lib/units.ts` y la adaptación de paneles en
    `src/lib/panels-to-mesh.ts`. La escena renderiza **solo** los paneles
    y componentes que genera el motor (tableros, barras de colgado,
    cajoneras; no inventar geometría).
11. **La web no muta la configuración**: todas las actualizaciones son funciones
    puras de `src/lib/config.ts` que devuelven una nueva `WardrobeConfig`.

## Convenciones

- Identificadores de código en inglés; documentación y comentarios en español.
- Archivos `kebab-case`, exports nombrados, sin `default export` en el motor.
- IDs deterministas (sin UUID): `module-1`, `panel-side-left`,
  `panel-shelf-m2-1`, `material-structure`.
- Errores: `GeometryError` con `code` del union `GeometryErrorCode` (estable y
  documentado; añadir solo cuando sea necesario).

## Flujo de trabajo recomendado

1. Leer docs y estado actual.
2. Proponer enfoque brevemente antes de escribir código.
3. Implementar por capas: `types/` → `contract/` → `engine/`.
4. Añadir tests junto al código; ejecutar `npm test` y `npm run typecheck`.
5. Actualizar docs si cambian decisiones o reglas.
6. Reportar: archivos, funcionalidades, resultados reales de pruebas, riesgos.

## Responde en español.
