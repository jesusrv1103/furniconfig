# Reglas de producto — FurniConfig (Fase 0)

> ⚠️ Todo lo marcado como **PROVISIONAL** es una hipótesis de trabajo: **debe
> validarse con carpinterías antes de usarlo en cotizaciones o fabricación.**
> No se inventaron reglas de fabricación; las que no vienen del brief se
> documentan aquí como pendientes.

## 1. Reglas confirmadas (del brief de producto)

| Regla | Valor | Estado |
|---|---|---|
| Tipo de mueble | Clóset **recto** (sin esquinas ni inclinaciones) | Confirmado |
| Módulos verticales | Entre **1 y 4** | Confirmado |
| Dimensiones | Ancho, alto y profundidad configurables | Confirmado |
| Espesores de tablero | **15 mm y 18 mm** (únicos soportados) | Confirmado |
| Paneles estructurales | Laterales, superior e inferior | Confirmado |
| Divisiones interiores | Sí, entre módulos | Confirmado |
| Tipos de módulo | Entrepaños (`shelves`), colgado (`hanging`), cajones (`drawers`) | Confirmado |
| Materiales y acabados | Configurables (nombre, espesor, acabado) | Confirmado |

| Ancho por módulo (Fase 3D) | Ancho interior libre declarable en mm enteros; sin declaración, reparto automático | Confirmado (producto: anchos independientes) |
| Ancho mínimo de módulo | 300 mm por módulo (resuelto o declarado) | **PROVISIONAL** |
| Ancho máximo de módulo declarado | 2.000 mm, SOLO para anchos declarados (los repartos uniformes del motor no se acotan, así los diseños antiguos siguen válidos) | **PROVISIONAL** (deflexión/colapso de tableros anchos) |
| Reparto del sobrante | Los módulos automáticos comparten por igual el espacio que queda; el residuo entero (1 mm) va a los primeros automáticos, de izquierda a derecha | Confirmado (ADR-006/ADR-025) |

| Barras de colgado | 1 por módulo "hanging" (Fase 2A) | Confirmado (producto) |
| Diámetro de barra | 18–60 mm, default 30 mm | **PROVISIONAL** |
| Montaje de barra | 100 mm bajo el superior, centrada en Z | **PROVISIONAL** |
| Longitud de barra | Ancho interior útil del módulo | **PROVISIONAL** (sin holguras) |
| Material de barra | Metálico, default "Acero / brillo" | **PROVISIONAL** (cosmético) |

| Cajones (Fase 2B) | 1–8 por módulo "drawers", default 3 | **PROVISIONAL** (rango) |
| Cajón: piezas | Frente, 2 laterales, trasera, fondo (Fase 2B) | Confirmado (producto) |
| Holgura vertical | 3 mm arriba de cada cajón | **PROVISIONAL** |
| Holgura lateral del frente | 3 mm por lado | **PROVISIONAL** |
| Profundidad del cajón | Toda la profundidad interior del módulo | **PROVISIONAL** (guías futuras) |
| Material de cajón | Default "Blanco / 15 mm / mate" | **PROVISIONAL** |

| Puertas (Fase 2C) | 1–2 hojas por módulo, activables por presencia de `doors` | **PROVISIONAL** (rango) |
| Hoja de puerta | Abertura menos holgura (default 3 mm por lado) | **PROVISIONAL** |
| Bisagra | 1 hoja: lado configurable (default izquierda); 2 hojas: extremos exteriores | **PROVISIONAL** |
| Montaje de puerta | Sobre el frente: `z ∈ [−espesor, 0]` | **PROVISIONAL** |
| Apertura | 0–110°, rotación pura de presentación sobre el eje de bisagra | **PROVISIONAL** (ángulo máx.) |
| Eje de bisagra (Fase 3A) | Plano medio del canto de la hoja, `z = −espesor/2` (con el eje en el plano frontal `z = 0` las hojas de módulos adyacentes se interpenetraban desde ~44°; defecto verificado con SAT y corregido) | **PROVISIONAL** (herraje real) |
| Apertura entre módulos vecinos | Bloqueo mutuo de hojas/tiradores desde ~88–92° en la columna del divisor (bloqueo físico real, acotado en tests); decidir si el ángulo común se limita a ≤90° | **PROVISIONAL** |
| Tirador | Cilindro horizontal contra la cara frontal, a 30 mm del borde libre; 40% del ancho de hoja (40–120 mm); diámetro 18 mm | **PROVISIONAL** |
| Material de puerta | Default = estructura (`material-door`) | **PROVISIONAL** |
| Material de tirador | Metálico fijo "Acero / brillo" (`material-handle`) | **PROVISIONAL** (cosmético) |

| Panel trasero (Fase 2C) | Opcional (`backPanel.enabled`), espesor 15 | 18 mm | **PROVISIONAL** |
| Montaje del trasero | Por encaje: plano posterior entre laterales y tableros (role `back`) | **PROVISIONAL** |
| Efecto en interiores | Entrepaños, divisiones, cajones y barra se acortan a la profundidad útil | **PROVISIONAL** |
| Material del trasero | Default = estructura (`material-back`) | **PROVISIONAL** |

## 2. Límites operativos — PROVISIONAL (validar con carpintería)

Centralizados en `packages/geometry-core/src/contract/limits.ts`.

| Límite | Valor provisional | Nota |
|---|---|---|
| Ancho total | 400 – 4000 mm | ¿Ancho máx. de tablero disponible? ¿transporte? |
| Alto total | 1000 – 2800 mm | ¿Altura de transporte / montaje en obra? |
| Profundidad | 400 – 700 mm | Típico de clóset; ¿colgado necesita ≥ 550 mm? |
| Ancho mínimo por módulo | 300 mm | ¿Cajones necesitan más? ¿colgado doble? |
| Entrepaños por módulo | 1 – 8 | ¿Límite constructivo real? |
| Cajones por módulo | 1 – 8 | ¿Límite constructivo real? ¿apilación? |
| Unidad | milímetros **enteros** | ¿Se aceptan medios milímetros? |

## 3. Supuestos geométricos — PROVISIONAL (validar con carpintería)

1. **Divisiones interiores de espesor completo** (15 o 18 mm) entre módulos
   adyacentes. Algunas carpinterías usan media división o sistema de rieles.
2. **Entrepaños distribuidos uniformemente** en la altura interior del módulo
   (huecos iguales arriba y abajo; redondeo `Math.round` a mm).
3. **Panel trasero (Fase 2C)**: opcional, montado
   **por encaje** en el plano posterior entre
   laterales y entre superior e inferior: tamaño
   `(ancho − 2t, alto − 2t, espesor)`, posición
   `(t, t, profundidad − espesor)`, role `back`,
   id `panel-back`, incluido en `panels`. Con el
   trasero activado, los interiores se acortan a
   la **profundidad útil** (`profundidad −
   espesor trasero`): entrepaños y divisiones a
   `depthMm − th`; cajones con
   `innerDepth = depthMm − 2t − th`; barras
   centradas en la profundidad útil. Reglas
   PROVISIONALES pendientes de validar:
   - Espesor 15 | 18 mm (típica trasera de
     melamina 15–18 mm; muchas carpinterías usan
     3–6 mm de fibra o anclaje a pared:
     confirmar sistema constructivo).
   - **Compatibilidad**: la profundidad debe
     admitir el encaje (`ERR_BACK_PANEL_DEPTH`,
     defensivo con los límites actuales).
4. **Barras de colgado (Fase 2A)**: una barra cilíndrica por módulo
   "hanging". Reglas PROVISIONALES pendientes de validar:
   - Orientación horizontal (eje X, a lo ancho del módulo).
   - **Longitud = ancho interior útil del módulo** (sin holguras de
     montaje: las holguras están por confirmar).
   - **Centro a 100 mm** por debajo de la cara inferior del tablero
     superior (típico 100–150 mm; confirmar altura de montaje).
   - **Centrada en la profundidad** (Z).
   - **Diámetro configurable: 18–60 mm, default 30 mm** (típico
     25–32 mm; confirmar con proveedor de herrajes).
   - **Material metálico** por defecto ("Acero", acabado "brillo"):
     nombre y acabado son cosméticos, no afectan geometría.
   - **Compatibilidad**: la barra (radio incluido) debe caber entre
     los tableros superior e inferior; si no, el motor rechaza la
     configuración (`ERR_HANGING_ROD_HEIGHT`).
5. **Sin herrajes**: guías de cajón, conectores, anclajes.
   **Pendiente**; añadirán espesores/restas que hoy no existen.
6. **Cajoneras (Fase 2B)**: un módulo "drawers" genera
   entre 1 y 8 cajones (default 3). Reglas PROVISIONALES
   pendientes de validar:
   - **Altura**: el alto interior se reparte en bandas
     iguales; el residuo (mm) se asigna de abajo hacia
     arriba (`distributeDrawerBands`).
   - **Holguras**: 3 mm arriba de cada cajón y 3 mm por
     lado del frente (típicas 2–5 mm; confirmar
     tolerancias de fabricación).
   - **Profundidad**: el cajón ocupa toda la profundidad
     interior; las guías comerciales restarán espacio
     cuando se implementen (pendiente de herrajes).
   - **Caja**: frente a toda altura de la caja; laterales
     apoyados sobre el fondo; trasera a toda altura
     contra el fondo del módulo.
   - **Compatibilidad**: la caja (ancho entre laterales,
     profundidad entre frente y trasera, altura de
     laterales sobre el fondo) debe caber; si no, el
     motor rechaza la configuración
     (`ERR_DRAWER_DIMENSIONS`).
7. **Laterales a toda altura** (el superior e inferior quedan *entre* laterales,
   no al revés). Confirmar sistema constructivo con carpintería.
8. **Puertas abatibles (Fase 2C)**: activables por
   presencia de `doors` en la configuración (ausencia
   = sin puertas). Reglas PROVISIONALES pendientes
   de validar:
   - **Hojas**: 1 o 2 por módulo. Con 2, las
     bisagras van en los extremos exteriores
     (apertura simétrica hacia afuera).
   - **Holguras**: `clearanceMm` (default 3,
     rango 0–10) entre hojas y bordes del
     módulo, y entre hojas (el residuo de 1 mm
     del reparto queda como holgura extra en el
     borde derecho).
   - **Montaje sobre el frente**: la hoja cerrada
     ocupa `z ∈ [−espesor, 0]` (por delante del
     plano frontal del cuerpo; puramente aditivo,
     no altera paneles, barras ni cajones).
     Confirmar si el montaje es sobre el frente,
     empotrado o al ras.
   - **Apertura**: transformación pura de
     presentación (`doorOpeningTransform`) sobre
     el eje de bisagra vertical **en el plano medio
     del canto de la hoja** (`z = −espesor/2`;
     Fase 3A: con el eje en el plano frontal `z = 0`
     las hojas de módulos adyacentes se
     interpenetraban desde ~44°, verificado con SAT
     y corregido); el motor genera
     las hojas cerradas y la capa de presentación
     aplica `rotation.y` (bisagra izquierda →
     ángulo positivo; derecha → negativo; el
     borde libre se aleja del frente hacia el
     observador). Ángulo máximo 110°
     (`ERR_DOOR_OPEN_ANGLE`).
   - **Bloqueo mutuo entre módulos adyacentes**
     (Fase 3A): más allá de ~88–92°, las hojas y
     tiradores internas de módulos vecinos se
     solapan en la columna del divisor — es el
     bloqueo físico real de puertas que se abren
     en exceso. Acotado en tests (área y extensión
     en X). **PROVISIONAL**: decidir con carpintería
     si el visor debe limitar la apertura común a
     ≤90°.
   - **Tirador**: cilindro horizontal (eje X)
     contra la cara frontal de la hoja, a 30 mm
     del borde libre (opuesto a la bisagra),
     centrado verticalmente; longitud = 40% del
     ancho de hoja acotada entre 40 y 120 mm;
     diámetro 18 mm. Confirmar tipo de tirador
     (perfil, asa, invisible) y su geometría.
   - **Materiales**: hoja default = estructura
     (`material-door`); tirador metálico fijo
     "Acero / brillo" (`material-handle`).
   - **Compatibilidad**: la abertura debe admitir
     hojas con la holgura (`ERR_DOOR_WIDTH_
     INSUFFICIENT`, defensivo con los límites
     actuales).

## 4. Módulos

- `shelves` (entrepaños): requiere `shelves` (cantidad de tabiques horizontales).
- `hanging` (colgado): espacio libre; genera la barra de colgado (Fase 2A).
- `drawers` (cajones): `drawers` opcional (cantidad de cajones, 1–8,
  default 3; ausencia = default para compatibilidad con el contrato v1);
  genera cajoneras —frentes, laterales, traseras, fondos— desde Fase 2B.
- Todos los tipos de módulo admiten puertas abatibles (Fase 2C) cuando
  la configuración declara `doors`; la configuración de puertas es
  global (hojas, bisagra y holgura para todo el clóset).

## 5. Validaciones implementadas

- Contrato: `schemaVersion` debe ser `1`.
- Dimensiones: enteros positivos dentro de límites provisionales.
- Módulos: 1–4, tipo válido, `shelves` coherente con el tipo,
  `drawers` entero 1–8 cuando se declara (opcional: default 3),
  `widthMm` opcional (entero, 300–2.000 mm) = ancho interior libre
  declarado (`ERR_MODULE_WIDTH_INVALID`).
- Materiales: nombre y acabado no vacíos; espesor ∈ {15, 18} mm;
  material de cajón (`materials.drawer`), de puerta (`materials.door`)
  y de panel trasero (`materials.back`) válidos cuando se declaran.
- Puertas (`doors`, opcional): `leaves` ∈ {1, 2}; `hingeSide` ∈
  {left, right}; `clearanceMm` entero 0–10 (`ERR_INVALID_DOOR_LEAVES`,
  `ERR_INVALID_HINGE_SIDE`, `ERR_INVALID_DOOR_CLEARANCE`).
- Panel trasero (`backPanel`, opcional): `enabled` booleano;
  `thicknessMm` ∈ {15, 18} (`ERR_INVALID_THICKNESS`).
- Motor: ancho total suficiente para laterales + divisiones + ancho mínimo de
  módulo (`ERR_WIDTH_INSUFFICIENT`, `ERR_MODULE_WIDTH_TOO_SMALL`);
  con anchos declarados: suma exacta cuando todos declaran
  (`ERR_MODULE_WIDTH_SUM`) y sobrante suficiente para los módulos
  automáticos; caja de cajón físicamente viable (`ERR_DRAWER_DIMENSIONS`);
  altura de módulo "hanging" suficiente para la barra
  (`ERR_HANGING_ROD_HEIGHT`); ángulo de apertura de puertas
  dentro de 0–110° (`ERR_DOOR_OPEN_ANGLE`).

## 6. Pendientes de validación con carpinterías (bloquean fases posteriores)

- [ ] Rangos reales de ancho/alto/profundidad y ancho mínimo de módulo.
- [ ] Sistema de divisiones (espesor completo vs. rieles).
- [ ] Panel trasero: sistema constructivo confirmado (encaje de
      15–18 mm vs. trasera fina de 3–6 mm vs. anclaje a pared),
      fijación y si resta profundidad útil.
- [ ] Herrajes: barra de colgado (altura mínima del módulo colgado) y
      guías de cajón (restarán profundidad a la caja del cajón).
- [ ] Cajoneras: holguras (3 mm), altura mínima de cajón, material de
      caja y sistema constructivo (caja vista vs. frente a toda altura).
- [ ] Puertas: sistema de montaje (sobre el frente vs. empotrado vs.
      al ras), holguras reales (3 mm), cantidad máxima de hojas por
      módulo, lado y tipo de bisagra comercial, tirador real (perfil,
      asa o invisible) y su geometría, y ángulo máximo de apertura
      (110°).
- [ ] Tolerancias de fabricación y si se restan del ancho útil.
- [ ] Distribución de entrepaños: uniforme o a gusto del usuario.
