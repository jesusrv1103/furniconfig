> Auditoría de uso real del modelador (WAVE-02 Bloque B) sobre `main @ a557517`.
> Capturas `a01…a10` y `hallazgos.json`: `/tmp/opencode/w02/audit/`.

# WAVE-02 — Bloque B · Auditoría de uso real del modelador

- **Perfil**: Chromium (Playwright) 1440×900, **localStorage limpio** (usuario nuevo), `http://localhost:5173/#/modeler`.
- **Evidencia**: capturas `a01…a10` + `hallazgos.json` en este directorio.
- **Fecha**: 2026-10-21 (sobre `main @ a557517`, WAVE-01 integrada).

## Veredictos por pregunta

| # | Pregunta | Veredicto | Evidencia |
|---|---|---|---|
| 1 | ¿Se entiende cómo comenzar sin instrucciones? | **NO** | `a01` |
| 2 | ¿Se identifica cómo insertar un clóset? | **PARCIAL** | `a02` |
| 3 | ¿La cámara muestra bien el primer mueble? | **PARCIAL** | `a03` |
| 4 | ¿Rejilla/ejes dificultan entender la escena? | **PARCIAL** | `a04` |
| 5 | ¿Fácil seleccionar y cambiar medidas? | **PARCIAL** | `a05`, `a05b` |
| 6 | ¿Es evidente cómo mover un mueble? | **NO** | `a06` |
| 7 | ¿El usuario entiende cómo guardar? | **PARCIAL** | `a07` |
| 8 | ¿Puede recuperar diseño sin conocimientos técnicos? | **NO** | `a08a`, `a08b` |
| 9 | ¿Los paneles están demasiado cargados? | **SÍ** | `a09` |
| 10 | ¿Controles pequeños/ambiguos/poco accesibles? | **MENOR** | `a10` |

## Problemas concretos (reproducibles)

### P-01 · La primera experiencia es una escena técnica vacía (Q1)
Reproducir: abrir `#/modeler` con perfil limpio. Se ve: lienzo vacío dominado por rejilla + ejes
coloreados con letras X/Y/Z, topbar «Escena libre · 0 objetos · rejilla 100 mm · Motor geométrico:
en reposo (sin cálculos)» y un sidebar de 7 secciones. No hay pantalla de bienvenida, ni acción
primaria destacada, ni guía de primer paso. La única CTA de color es «Volver al configurador».

### P-02 · «Insertar clóset» queda enterrado bajo gestión de proyectos (Q2)
El botón (112×34 px) está en la sección «Añadir» a **y=719 px**, DESPUÉS de la sección «Diseños»
(299 px: selector + 6 botones CRUD + párrafo técnico sobre namespaces). La acción de creación —lo
único que quiere hacer un usuario nuevo— es la quinta sección del panel.

### P-03 · Sin auto-encuadre del primer mueble (Q3)
Insertado el clóset (esquina [0,0,0]), se proyecta en (852,583)→(745,373): **visible pero pegado a
la esquina superior derecha**, no centrado. La cámara no se mueve nunca. Un segundo clóset se inserta
en x=2600 mm y queda **fuera del encuadre** (invisible hasta que el usuario descubre el «Ajustar»).

### P-04 · Rejilla y ejes siempre activos, sin modo sencillo (Q4)
La rejilla densa ocupa todo el lienzo vacío; los ejes X (rojo), Y (verde) y Z (azul) con letras
gizmo atraviesan los muebles. No existe forma de fondo neutro sin ejes. La pista inferior acumula
422 caracteres de texto técnico («snap 100 mm · Y arriba · X rojo…»).

### P-05 · Medida incoherente → estado ERROR con malla fantasma y pista contradictoria (Q5)
Reproducir: insertar clóset (ancho 2400, 4 módulos) → Propiedades → Ancho = **900** → Enter.
Resultado: la fila del objeto pasa a «Error», el mueble se dibuja como **caja gris translúcida** con
un plano gris en el suelo, y el panel de posición muestra «**Generando geometría: el arrastre se
habilita al completarse**» — que es **falso** (la generación falló, no está en curso). No se explica
por qué (900 < 4 módulos × 600). Recuperable con Deshacer o corrigiendo, pero el estado asusta.

### P-06 · Mover depende de leer texto; no hay gizmo ni affordance visual (Q6)
Los métodos son: arrastrar (descrito solo por una pista de texto) y los botones «X ±100 / Z ±100».
No hay indicador visual de arrastre sobre el mueble seleccionado, ni flechas en escena. Para un
usuario sin vocabulario X/Z, los botones no dicen «hacia la izquierda/derecha».

### P-07 · Guardar exige «Guardar como» + prompt nativo; sin indicador de cambios antes del primer guardado (Q7)
- El nombre lo pide un `window.prompt` del navegador (marcado de confianza, sin explicar que es
  guardado LOCAL en el navegador).
- **`dirty` solo se calcula con diseño activo**: hasta el primer guardado, las ediciones no generan
  ninguna señal de «cambios sin guardar» (medido: `dirty=false` con 1 clóset modificado).

### P-08 · Tras recargar, la escena vacía parece que se perdió todo (Q8) — el más grave
Reproducir: guardar «Cocina Norte» → F5. Se ve **exactamente la misma pantalla vacía de la primera
visita** («Escena libre · 0 objetos»); el diseño solo se revela al desplegar «Diseño guardado»
(«— escena sin diseño — | Cocina Norte»). Nada dice «tu diseño sigue aquí». Alto riesgo de abandono.

### P-09 · Sidebar cargado: 7 secciones, scroll necesario, texto técnico expuesto (Q9)
Medido: secciones Vista(160) / Herramientas(119) / **Diseños(299)** / Añadir(154) / Objetos(77) /
Propiedades(94) / Documento(91) = scrollHeight **1121 px vs 848 px** de viewport. 13 botones y
párrafos que hablan de «namespace», «historial» y «regeneración de geometría» dirigidos al usuario.

### P-10 · Tamaños correctos; ambigüedad semántica en textos (Q10)
0 botones <32 px (bien); el select de Diseños mide 30 px (marginal, ≥24 px WCAG). La ambigüedad es
léxica: «Motor geométrico: en reposo», «rejilla (snap)», «X (mm)/Z (mm)» sin referenciar el plano
del suelo ni el usuario. «Volver al configurador» domina la barra superior en azul.

## Resumen ejecutivo
La **potencia está toda ahí** (WAVE-01 incluida) pero el modelador habla en lenguaje de CAD desde el
primer segundo. Los cuatro problemas de mayor daño: escena vacía como inicio (P-01), diseño no
restaurado tras recargar (P-08), acción primaria enterrada (P-02) y estado de error sin explicación
(P-05). Todos tienen solución de UX sin tocar contratos ni el motor.
