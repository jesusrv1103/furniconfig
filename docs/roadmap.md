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

## Fase 3B — Persistencia local y gestión de diseños ✅

- [x] Contrato `DesignRepository` + `SessionStore` con
      adaptador `localStorage` (claves `furniconfig.designs`
      y `furniconfig.session`; `storageVersion` propio,
      independiente del `schemaVersion` del motor —
      ADR-023).
- [x] Operaciones: crear, guardar, guardado automático con
      debounce (1 s), abrir, renombrar, duplicar, eliminar
      con confirmación, nuevo proyecto sin sobrescribir el
      anterior, exportar/importar JSON versionado
      (`furniconfig-design`).
- [x] Recuperación de sesión tras recargar (borrador +
      diseño activo + cambios pendientes) y gestión
      explícita del diseño activo y de los cambios sin
      guardar.
- [x] Integridad: validación con `validateWardrobeConfig`
      en todo lo leído y escrito; versiones desconocidas
      incompatibles sin migración silenciosa ni pisado de
      datos; registros corruptos en cuarentena; errores de
      cuota/almacenamiento bloqueado con mensajes
      comprensibles; ids deterministas sin colisiones;
      importación siempre con id nuevo; duplicados
      independientes (deep clone); ninguna operación muta
      la configuración recibida.
- [x] UI: sección "Proyectos" al final del panel
      (búsqueda por nombre, `role="status"` para mensajes,
      confirmaciones nativas); el visor 3D sigue siendo el
      elemento principal.
- [x] Pruebas: 37 unitarias nuevas (adaptador, biblioteca,
      debounce, sección) + escenario Playwright en Chromium
      real: crear → autosave → recarga → renombrar →
      duplicar → exportar/importar → buscar → eliminar con
      confirmación → nuevo proyecto, verificando que
      dimensiones, módulos, materiales, cajones, barras,
      puertas y panel trasero sobreviven el ciclo
      guardar/reabrir.

## Fase 3C — FurniConfig Studio ✅

- [x] Disposición Studio (ADR-024): barra superior (nombre
      del proyecto, nuevo diseño, guardar, deshacer/
      rehacer, estado de guardado, acceso a proyectos),
      panel izquierdo (estructura + diseños), visor 3D
      central, panel derecho contextual y barra inferior
      (dimensiones, módulos, validación, guardado).
- [x] Selección directa de módulos: clic en el modelo (con
      umbral anti-drag y deselección en el vacío) y desde
      la lista del panel izquierdo; resaltado con copias
      emisivas auxiliares de material; ids deterministas
      del motor (`module-N`), estables entre recálculos y
      limpieza automática si el módulo desaparece.
- [x] Panel contextual editable: tipo de módulo, repisas,
      cajones y diámetro de barra (compartido), con
      dimensiones resueltas en solo lectura; el resumen y
      los errores siguen visibles sin selección.
- [x] Deshacer/rehacer: historial acotado (50 pasos) solo
      de configuraciones, integrado con el guardado
      automático de la Fase 3B, reiniciado al cambiar de
      proyecto, con atajos Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z y
      Ctrl/Cmd+Y.
- [x] Vistas: isométrica/frontal/lateral + "Ajustar"
      (encuadre a pantalla) + "Encuadrar módulo"
      (cámara al módulo seleccionado).
- [x] Paneles laterales colapsables (en ≤760 px arrancan
      contraídos) y modo sencillo (predeterminado) /
      avanzado como organización de herramientas reales.
- [x] Persistencia 3B íntegra: CRUD, autosave, sesión e
      import/export sin cambios de formato.
- [x] Pruebas: 36 unitarias nuevas (historial, selección,
      paneles del Studio) + escenario Playwright con ~30
      verificaciones nuevas y 10 capturas de evidencia.

## Fase 3D — Diseño paramétrico flexible ✅

- [x] Motor de distribución flexible (ADR-025):
      `ModuleConfig.widthMm?` (ancho interior libre en mm
      enteros, opcional) con reparto uniforme idéntico al
      histórico cuando no hay declaraciones; anchos
      parciales (los declarados se respetan y los
      automáticos reparten el sobrante con residuo 1 mm
      izq→der), suma exacta cuando todos declaran, límites
      (mínimo 300 mm, máximo provisional 2.000 mm solo para
      declarados) y códigos nuevos `ERR_MODULE_WIDTH_INVALID`
      y `ERR_MODULE_WIDTH_SUM`. Paneles, barras, cajones,
      puertas e ids se recalculan con los algoritmos
      existentes.
- [x] Edición desde el Studio: ancho real en el panel
      contextual con control numérico preciso (borrador con
      previsualización de los módulos afectados, límite
      máximo informado y confirmación al salir/Enter),
      liberar ancho, chips de ancho en las tarjetas y
      sección "Distribución de anchos" con Igualar anchos,
      Repartir espacio restante e indicador de "sin espacio
      por repartir". Lenguaje sencillo; sin espesores ni
      coordenadas para el usuario.
- [x] Plantillas locales: 4 distribuciones prediseñadas
      (básico, colgar, cajonera, mixto con ancho declarado)
      sobre los contratos existentes, siempre válidas, que
      conservan materiales y opciones y son deshacerables.
- [x] Persistencia e integridad: los diseños antiguos siguen
      abriendo (reparto uniforme); los nuevos con anchos
      individuales se guardan, importan/exportan y
      sobreviven a deshacer/rehacer; cambios de dimensión o
      de conteo conservan los fijados si siguen encajando y
      si no vuelven a reparto uniforme (nunca dejan la
      configuración inválida por los anchos).
- [x] CI en GitHub: workflow de PRs hacia `main` con `npm
      ci`, typecheck, pruebas unitarias y build (Node 22,
      sin secretos ni despliegues). Las pruebas visuales
      siguen siendo locales.
- [x] Pruebas: 27 unitarias nuevas en el motor, ~30 en la
      web (helpers, plantillas, persistencia, historial,
      panel contextual) y 21 verificaciones visuales nuevas
      con 3 capturas de evidencia.

## Fase 3E — Experiencia de diseño simplificada ✅

- [x] Navegación por cuatro categorías (ADR-026): Medidas,
      Interior, Apariencia y Mis diseños, con pestañas
      accesibles WAI-ARIA (flechas/Home/End, roving tabindex)
      y lógica pura en `lib/studio/tabs.ts`. Todas las
      herramientas existentes se conservan; los paneles
      inactivos quedan montados con `hidden` (sin duplicar
      estado).
- [x] Visor central estable: altura de ventana completa,
      scroll interno en los paneles, visor que nunca
      desplaza la página; en ≤1200 px el visor va primero.
      Cámara, selección 3D, resaltado y reencuadre intactos
      (verificado con píxeles).
- [x] Lenguaje sencillo: textos de ayuda por categoría;
      notas provisionales visibles pero de-emphasizadas;
      modo avanzado conservado.
- [x] Pruebas: 15 unitarias nuevas (lógica de pestañas +
      estructura SSR) y 17 verificaciones visuales nuevas
      con 10 capturas de evidencia (editor, medidas,
      interior, apariencia, mis diseños, módulo
      seleccionado, modo avanzado, móvil, puertas abiertas
      y diseño recuperado).
- [x] Iluminación verificada con evidencia: sin defectos
      que corregir (interior legible, sin sobreexposiciones).

## Fase 2D — Segundas familias de mueble (pendiente)

- Muebles para TV, armarios y cocinas.
- Refactor: motor genérico + "perfiles" por familia (reglas propias de
  paneles, restricciones y validadores).
- Guardar el contrato por familia con su propio `schemaVersion`.
- **Estrategia incremental preparada por la Fase 3C**: cada
  familia nueva aportará (1) su contrato de configuración
  versionado, (2) su función de derivación pura equivalente a
  `deriveGeometryState` y (3) su mapeo de selección
  pieza → elemento editable (equivalente a `lib/studio/selection.ts`);
  el historial del Studio, las barras y la capa de presentación
  son agnósticos a la familia y no se tocan.
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
