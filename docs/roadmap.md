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

## Fase 2C — Puertas abatibles y panel trasero ✅

- [x] Puertas en el motor: `Door` (hoja) y
      `DoorHandle` (tirador) como componentes
      separados (`buildDoors`), montadas sobre
      el frente (`z ∈ [−espesor, 0]`): montaje
      puramente aditivo, sin alterar paneles,
      barras ni cajones.
- [x] Reglas PROVISIONALES: 1–2 hojas por
      módulo (con 2, bisagras en los extremos
      exteriores), holgura 0–10 mm (default 3,
      residuo de 1 mm al borde derecho),
      bisagra configurable con 1 hoja (default
      izquierda), tirador cilíndrico horizontal
      contra la cara frontal (40% del ancho de
      hoja, 40–120 mm; diámetro 18 mm; a 30 mm
      del borde libre, centrado verticalmente).
- [x] Apertura como transformación pura de
      presentación: `doorOpeningTransform`
      (eje de bisagra + ángulo firmado 0–110°);
      el motor genera las hojas cerradas y la
      capa de presentación aplica `rotation.y`
      sobre un group en el eje; el ángulo es
      estado de UI, no de configuración.
- [x] Contrato v1 backward compatible: `doors`
      y `backPanel` opcionales (ausencia = sin
      puertas / sin panel trasero; las
      configuraciones Fase 0–2B siguen
      validando).
- [x] `GeometryResult` extendido de forma
      aditiva (`doors`, `handles`,
      `totals.doorCount`, `totals.handleCount`;
      el panel trasero entra en `panels` con
      role `back`).
- [x] Panel trasero por encaje (PROVISIONAL):
      `panel-back` entre laterales y tableros;
      con el trasero activado, entrepaños,
      divisiones, cajones y barra se acortan a
      la profundidad útil.
- [x] Validaciones: `ERR_INVALID_DOOR_LEAVES`,
      `ERR_INVALID_HINGE_SIDE`,
      `ERR_INVALID_DOOR_CLEARANCE`,
      `ERR_DOOR_OPEN_ANGLE`,
      `ERR_DOOR_WIDTH_INSUFFICIENT` y
      `ERR_BACK_PANEL_DEPTH` (las dos últimas
      defensivas con los límites actuales).
- [x] Visualizador: activación de puertas,
      hojas (1/2), lado de bisagra, holgura,
      material de puerta; slider de apertura
      0–110° (clic real sobre la pista);
      interruptor de panel trasero con espesor
      (15/18 mm); resumen de puertas,
      tiradores y panel trasero.
- [x] Pruebas unitarias: geometría de hojas y
      tiradores, reparto de ancho con residuo,
      bisagras y firma del ángulo, transformación
      de apertura (rango y pureza), materiales
      resueltos, panel trasero y encaje de
      interiores, validaciones, adaptación
      mm → m, helpers de configuración puros,
      renderizado, cambios rápidos.
- [x] Pruebas visuales Playwright + Chromium:
      activación, dos hojas, apertura/cierre
      con estabilidad de escena (umbral de
      antialiasing), panel trasero, cambio de
      dimensión con puertas y trasero activos,
      material de puerta; 48/48 verificaciones.

## Fase 3A — Interfaz profesional de taller ✅

- [x] Auditoría visual (Paso 1): cámara en frontal
      por defecto, panel trasero visible, metales
      iluminados con IBL y sombras proyectadas con
      suelo receptor.
- [x] Módulo de cámara puro `lib/camera-views.ts`
      (`VIEW_DIRECTIONS`, `fitDistance`,
      `viewPosition`, `reframe`, `boxCenter`) con
      pruebas unitarias (cierre analítico,
      monotonía, pureza, casos degenerados).
- [x] Escena: `CameraRig` (isométrica al montar,
      vistas predefinidas Isométrica/Frontal/
      Lateral y reencuadre automático al cambiar
      dimensiones, `useLayoutEffect` sin fotograma
      desencadrado), luces clave+relleno,
      sombras 2048 con bias, `RoomEnvironment`
      (procedural, de three; sin dependencias
      nuevas), fondo `#e7e9ed` y rejilla.
- [x] Verificación de puertas con evidencia (SAT +
      recorte Sutherland–Hodgman): **defecto
      corregido** — el eje de bisagra estaba en el
      plano frontal (`z = 0`) y las hojas de módulos
      adyacentes se interpenetraban desde ~44°; el
      eje pasa al plano medio del canto
      (`−espesor/2`). Documentado en `doors.ts` y
      `door.ts`; contrato actualizado con evidencia.
- [x] Zona de bloqueo mutuo entre módulos vecinos
      (~88–92°) acotada en tests; el límite común
      ≤90° queda **PROVISIONAL** (carpintería).
- [x] UI: secciones colapsables del panel
      (`aria-expanded`/`aria-controls`), etiqueta
      de fase, favicon sin 404, barra de vistas +
      interruptor "Puertas visibles" (estado de
      presentación que no muta `WardrobeConfig`)
      y slider de apertura en el visor.
- [x] Corrección CSS del contenedor del visor
      (caja absoluta): antes la cadena
      `height:100%` no resolvía contra
      `min-height` y el lienzo quedaba en su tamaño
      intrínseco 2:1 (359 de 648 px en escritorio;
      182 de 506 px en móvil).
- [x] Pruebas: unitarias de `camera-views` y
      `materials` (presets, rugosidades, hash
      determinista); suite Playwright ampliada con
      encuadre medido, panel trasero por píxel
      central, secciones, ángulos y móvil;
      83/83 verificaciones visuales.

## Fase 2D — Segundas familias de mueble (pendiente)

- Muebles para TV, armarios y cocinas.
- Refactor: motor genérico + "perfiles" por familia (reglas propias de
  paneles, restricciones y validadores).
- Guardar el contrato por familia con su propio `schemaVersion`.
- Cajoneras: **completado en Fase 2B** (quedan las
  guías comerciales y la validación con carpintería).
- Puertas corredizas y herrajes comerciales:
  pendientes de validación con carpintería.

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
- Playwright: verificaciones visuales reales desde Fase 2A
  (rotación, zoom, apertura de puertas, estabilidad de escena);
  Fase 3A añade encuadre de vistas medido, panel trasero en
  frontal, secciones colapsables y móvil (83/83);
  la suite end-to-end completa llega en Fase 4.
