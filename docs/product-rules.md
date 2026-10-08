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
3. **Sin panel trasero** en Fase 0 (el brief no lo incluye). Muchos clósets
   llevan trasera de 3–6 mm o anclaje a pared: **pendiente**.
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

## 4. Módulos

- `shelves` (entrepaños): requiere `shelves` (cantidad de tabiques horizontales).
- `hanging` (colgado): espacio libre; genera la barra de colgado (Fase 2A).
- `drawers` (cajones): `drawers` opcional (cantidad de cajones, 1–8,
  default 3; ausencia = default para compatibilidad con el contrato v1);
  genera cajoneras —frentes, laterales, traseras, fondos— desde Fase 2B.

## 5. Validaciones implementadas

- Contrato: `schemaVersion` debe ser `1`.
- Dimensiones: enteros positivos dentro de límites provisionales.
- Módulos: 1–4, tipo válido, `shelves` coherente con el tipo,
  `drawers` entero 1–8 cuando se declara (opcional: default 3).
- Materiales: nombre y acabado no vacíos; espesor ∈ {15, 18} mm;
  material de cajón (`materials.drawer`) válido cuando se declara.
- Motor: ancho total suficiente para laterales + divisiones + ancho mínimo de
  módulo (`ERR_WIDTH_INSUFFICIENT`, `ERR_MODULE_WIDTH_TOO_SMALL`);
  caja de cajón físicamente viable (`ERR_DRAWER_DIMENSIONS`).

## 6. Pendientes de validación con carpinterías (bloquean fases posteriores)

- [ ] Rangos reales de ancho/alto/profundidad y ancho mínimo de módulo.
- [ ] Sistema de divisiones (espesor completo vs. rieles).
- [ ] Panel trasero: sí/no, espesor, cómo se fija.
- [ ] Herrajes: barra de colgado (altura mínima del módulo colgado) y
      guías de cajón (restarán profundidad a la caja del cajón).
- [ ] Cajoneras: holguras (3 mm), altura mínima de cajón, material de
      caja y sistema constructivo (caja vista vs. frente a toda altura).
- [ ] Tolerancias de fabricación y si se restan del ancho útil.
- [ ] Distribución de entrepaños: uniforme o a gusto del usuario.
