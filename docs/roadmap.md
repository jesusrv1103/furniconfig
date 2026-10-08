# Roadmap — FurniConfig

## Fase 0 — Fundación y motor paramétrico ✅

- [x] Estructura del monorepo (npm workspaces).
- [x] Documentación base: `README.md`, `AGENTS.md`, `docs/`.
- [x] Paquete `packages/geometry-core` (motor puro, sin dependencias runtime).
- [x] Modelos tipados: `Wardrobe`, `Module`, `Panel`, `Material`, `GeometryResult`.
- [x] Contrato de configuración versionado (`schemaVersion: 1`) + validación de entrada.
- [x] Función pura de anchos útiles y distribución de módulos (determinista).
- [x] Generación de paneles estructurales (laterales, superior, inferior,
      divisiones, entrepaños).
- [x] Pruebas unitarias: cálculos, límites y entradas inválidas (Vitest).

## Fase 1 — Visualizador 3D y app de configuración ✅

- [x] `apps/web` con React 19 + TypeScript + Vite.
- [x] Visualización con Three.js + React Three Fiber consumiendo
      `GeometryResult` (un `Panel` = un `Box`), conversiones mm → m
      solo en la capa de renderizado.
- [x] OrbitControls (Drei), iluminación, sombras, cuadrícula y cámara
      determinista según el tamaño del clóset.
- [x] UI de configuración: dimensiones, número y tipo de módulos,
      entrepaños, espesores (15/18 mm), materiales y acabados,
      botón de restablecer.
- [x] Recalculo inmediato; errores de validación y errores geométricos
      del motor visibles en la interfaz (estado inválido controlado).
- [x] Panel de medidas y resumen geométrico (dimensiones, anchos útiles,
      paneles por tipo, volumen de tableros).
- [x] Pruebas: conversión de unidades, transformación de paneles,
      configuraciones válidas/inválidas, cambios de dimensiones y
      módulos, no mutación, renderizado básico y manejo de errores.
- [x] Geometrías y materiales de Three.js reutilizados (memoizados
      por tamaño y `materialId`, con `dispose`).
- [x] Visualizador con carga diferida (`React.lazy`).
- **Pendiente (bloqueante para cotizaciones):** validar con carpintería
  los límites provisionales (`docs/product-rules.md` §2–3).

## Fase 2 — Segundas familias de mueble

- Muebles para TV, armarios y cocinas.
- Refactor: motor genérico + "perfiles" por familia (reglas propias de
  paneles, restricciones y validadores).
- Guardar el contrato por familia con su propio `schemaVersion`.

## Fase 3 — Backend y persistencia

- API en Laravel; MariaDB; persistencia de proyectos y configuraciones.
- Portar o exponer el motor (evaluar: reimplementación en PHP vs. servicio
  independiente). El motor TS puro facilita ambos caminos.
- PHPUnit para reglas de negocio del backend.

## Fase 4 — Producto SaaS

- Autenticación, multi-tenant (carpinterías), cotizaciones a partir de
  `GeometryResult` (volumen de paneles, materiales).
- Pagos (integración a definir; sin APIs de pago hasta que el producto lo pida).
- Pruebas end-to-end con Playwright.

## Hitos transversales

- **Validación con carpinterías** (pendiente desde Fase 0): ver
  `docs/product-rules.md` §6. Bloquea cotizaciones reales.
- Playwright solo se activa en Fase 4, cuando exista la app completa.
