# Cuantización de la geometría — 4 alternativas medidas (FASE-4B-C)

> **Estado: política aprobada (16/10/2026).** Se mantiene la **alternativa A**
> (status quo) como política actual: las entradas de `SceneDocument` siguen
> en milímetros **enteros** (I8: ver `SCENE_DOCUMENT.md`) y **no se redondean
> silenciosamente** los resultados geométricos. Las alternativas **B** (1/10 mm)
> y **D** (floats sin cuantizar) quedan **documentadas para evaluación futura**;
> la **C** (redondeo de salidas) queda **descartada** por degradar la forma.
> Este documento conserva la medición completa y la recomendación técnica en la
> que se apoyó la decisión.
>
> Medición: `packages/kernel-adapter/experiments/quantization-probe.mjs` →
> `packages/kernel-adapter/experiments/results/4b1-quantization.json`
> (WASM real de `manifold-3d@3.5.4`, Node 22, 16/10/2026). Escenario base:
> placa 1 200 × 600 × 18 mm con hueco pasante 200 × 200 mm, más cadenas de
> transformaciones (traslación entera, giro 90° y 30°, escala ×2 y ×1,5).

## Las cuatro alternativas

| # | Alternativa | Qué hace |
|---|-------------|----------|
| A | **Status quo** | Entradas en mm enteros (I8); salidas en float nativo, sin redondeos ocultos. |
| B | **Rejilla de 1/10 mm** | La geometría se expresa en décimas de mm (enteras); operaciones y resultados ÷10. |
| C | **Cuantizar salidas** | Se redondean **todos** los vértices de la malla resultante a mm enteros y se reconstruye el sólido. |
| D | **Floats sin cuantizar** | Entradas fraccionarias arbitrarias (giros no alineados, escalas fraccionarias), sin cuantizar nada. |

## Resultados medidos

| Métrica | A (status quo) | B (1/10 mm) | C (redondeo salidas) | D (floats) |
|---|---|---|---|---|
| Error de volumen vs analítico (cadena alineada) | **0** (exacto) | **0** (exacto) | — | **0** (exacto, ×1,5³) |
| Error de volumen tras giro 30° + redondeo | n/a (sin redondeo) | n/a | **+6 318 mm³ (rel. 0,00052)** sobre 12 240 000 | n/a |
| Error máximo de bounds vs analítico | **0** | **0** (idénticos a A) | **0,38 mm** | **< 1e-6 mm** |
| Offset de 0,5 mm | **imposible** (entero; error mínimo 0,5 mm) | **exacto** (5 décimas) | n/a | exacto |
| Degeneraciones observadas | ninguna | ninguna | 0 colapsos exactos en el caso medido, pero **la forma se deforma hasta 0,38 mm** y el constructor de Manifold colapsa triángulos degenerados cuando existen (riesgo de topología no garantizada) | ninguna |
| Determinismo byte a byte | **sí** | **sí** | reconstrucción válida en este caso (no garantizada en general) | **sí** |
| Conservación de I8 (documento en mm enteros) | **sí** | sí (redondeo de entrada a décimas) | sí (salida redondeada) | **no** (si se propagara al documento) |

Notas de la medición:

- Manifold v3 trabaja internamente en **doble precisión** en este escenario:
  los bounds y volúmenes de A/B/D coinciden con los valores analíticos en
  doble; la frontera de malla es `Float32Array` (`MeshData`). No hay error
  numérico significativo en la representación actual.
- El caso límite de C (0 colapsos exactos) es contingente: el giro de 30°
  reparte los vértices y ninguno cayó exactamente sobre la misma coordenada
  entera. Cualquier otra geometría puede producir colapsos; el constructor de
  Manifold los elimina alterando malla y volumen (medido: +0,052 % de volumen
  y hasta 0,38 mm de desviación de forma **sin** ningún colapso).
- La determinismo byte a byte se verificó repitiendo cada cadena completa y
  comparando posiciones e índices (A y D idénticos).

## Recomendación técnica → decisión tomada

La decisión aprobada sigue la recomendación 1-4 de abajo:

- **Política vigente**: alternativa **A** (mm enteros en `SceneDocument`, sin
  redondeos ocultos de resultados).
- **Evaluación futura**: alternativas **B** y **D** documentadas aquí.
- **Descartada**: alternativa **C**.

Razones (medidas en este documento):

1. **Mantener los mm enteros de `SceneDocument` como contrato (I8)**: es lo
   que garantiza serialización exacta, comandos deterministas y la
   inmutabilidad del sobre; A es exacta y determinista para toda la
   geometría alineada al eje, que es la realidad del mueble paramétrico.
2. Si el modelador necesita precisión fina (giros arbitrarios, desplazamientos
   de media pieza), preferir la **rejilla de 1/10 mm en la entrada (B)**:
   reproduce exactamente la geometría entera y admite offsets de 0,5 mm sin
   error. El costo es ×10 en los valores intermedios (irrelevante en dobles).
3. **No adoptar el redondeo de salidas (C)**: degrada la forma (hasta 0,38 mm
   medido), altera el volumen y no garantiza la reconstrucción manifold.
   Contradice además la regla de no redondeos ocultos.
4. La precisión de salida en float (A/D) es **suficiente** para render y
   medidas: error < 1e-6 mm y determinismo byte a byte. No se proponen
   cuantizaciones de representación.

Referencias: `packages/kernel-adapter/README.md` §"Kernel Worker (FASE-4B-C)",
`RISKS.md` (fila "Cuantización (4 alternativas)"),
`SCENE_DOCUMENT.md` (I8).
