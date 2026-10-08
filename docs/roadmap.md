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

## Fase 2A — Barras de colgado y estabilidad 3D ✅

- [x] Componente geométrico `HangingRod` en el motor
      (cilindro por módulo "hanging": eje, longitud,
      diámetro, posición, material metálico, id estable).
- [x] Reglas provisionales explícitas: eje X, longitud =
      ancho útil del módulo, montaje a 100 mm del
      superior, diámetro 18–60 mm (default 30 mm),
      material "Acero/brillo" por defecto.
- [x] Extensión backward compatible del contrato v1
      (`hangingRod?: HangingRodSpec`, campos opcionales).
- [x] `GeometryResult` extendido de forma aditiva
      (`rods`, `totals.rodCount`, `totals.rodLengthMm`).
- [x] Validaciones: diámetro (`ERR_HANGING_ROD_DIAMETER`)
      y compatibilidad de altura (`ERR_HANGING_ROD_HEIGHT`).
- [x] Visualizador: cilindros (`CylinderGeometry`
      reutilizado por eje+longitud+diámetro), orientación
      según eje, material metálico, ciclo de vida de
      recursos revisado (memoización + `dispose` de
      boxes, cilindros y materiales).
- [x] UI: diámetro, material y acabado de barra; resumen
      con longitud total; restablecer a defaults del
      motor.
- [x] Estado derivado centralizado y puro
      (`deriveGeometryState`).
- [x] Pruebas unitarias: longitud/posición de barras,
      unidades y orientación, dimensiones inválidas,
      determinismo, no mutación, compatibilidad de
      contratos, regresiones de paneles, gestión de
      recursos compartidos, cambios rápidos de
      configuración.
- [x] Pruebas visuales reales con Playwright + Chromium
      (rotación de órbita, zoom con rueda, actualización
      de dimensiones y módulos, aparición/desaparición
      de la barra, estado de error controlado).
- [x] Commit de referencia de Fases 0+1 (`86d9692`).

## Fase 2B — Cajoneras paramétricas ✅

- [x] Cajoneras en el motor: `DrawerAssembly` (frente,
      2 laterales, trasera, fondo) como paneles con
      roles `drawer-*` + ensamblaje identificable
      (`partIds`).
- [x] Reglas PROVISIONALES: 1–8 cajones (default 3),
      bandas de altura con residuo de abajo hacia
      arriba, holguras de 3 mm (vertical y lateral),
      cajón a toda la profundidad interior, material
      "Blanco / 15 mm / mate".
- [x] Contrato v1 backward compatible: `drawers`
      opcional (ausencia = default 3; las configuraciones
      Fase 0–2A siguen validando) y `materials.drawer`
      opcional.
- [x] `GeometryResult` extendido de forma aditiva
      (`drawers`, `totals.drawerCount`,
      `totals.drawerPartCount`).
- [x] Validaciones: `ERR_INVALID_DRAWER_COUNT` y
      `ERR_DRAWER_DIMENSIONS` (compatibilidad física
      de la caja).
- [x] Visualizador: cajones cerrados (Boxes del
      pipeline de paneles), control de cantidad por
      módulo, tarjeta de material de cajón, resumen
      de ensamblajes y piezas.
- [x] Pruebas unitarias: distribución de alturas,
      anchos útiles, profundidades, espesores,
      holguras, dimensiones imposibles, determinismo,
      no mutación, IDs únicos, compatibilidad,
      intersecciones, integridad de materiales,
      unidades, renderizado, cambios rápidos.
- [x] Pruebas visuales Playwright + Chromium: cajones
      por defecto, cambio 3→5 con recalculo de la
      escena, escena estable (cajones cerrados, con
      umbral de antialiasing), 30/30 verificaciones.

## Fase 2C — Segundas familias de mueble

- Muebles para TV, armarios y cocinas.
- Refactor: motor genérico + "perfiles" por familia (reglas propias de
  paneles, restricciones y validadores).
- Guardar el contrato por familia con su propio `schemaVersion`.
- Cajoneras: **completado en Fase 2B** (quedan las
  guías comerciales y la validación con carpintería).

## Fase 3 — Backend y persistencia

- API en Laravel; MariaDB; persistencia de proyectos y configuraciones.
- Portar o exponer el motor (evaluar: reimplementación en PHP vs. servicio
  independiente). El motor TS puro facilita ambos caminos.
- PHPUnit para reglas de negocio del backend.

## Fase 4 — Producto SaaS

- Autenticación, multi-tenant (carpinterías), cotizaciones a partir de
  `GeometryResult` (volumen de paneles, materiales, longitud de barras).
- Pagos (integración a definir; sin APIs de pago hasta que el producto lo pida).
- Pruebas end-to-end con Playwright.

## Hitos transversales

- **Validación con carpinterías** (pendiente desde Fase 0): ver
  `docs/product-rules.md` §6. Bloquea cotizaciones reales.
- Playwright solo se activa en Fase 4, cuando exista la app completa.
