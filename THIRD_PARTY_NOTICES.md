# THIRD_PARTY_NOTICES — Avisos de terceros

FurniConfig se distribuye bajo **MIT** (ver [`LICENSE`](./LICENSE)). Este
archivo lista las dependencias de terceros incorporadas al monorepo y las
obligaciones de atribución que conllevan.

> **Estado:** generado en la rama de la **FASE-4B-0** (prueba de viabilidad del
> kernel), a partir del `package-lock.json` real de esta rama. Datos verificados
> el **15/10/2026**.

---

## 1. Dependencia directa (experimental)

| Paquete | Versión (fijada) | Licencia | Workspace | Propósito |
|---------|------------------|----------|-----------|-----------|
| [`manifold-3d`](https://github.com/elalish/manifold) | `3.5.4` | **Apache-2.0** | `packages/kernel-adapter` | Kernel geométrico (WASM) para la prueba de viabilidad FASE-4B-0 |

Características declaradas por el proveedor y verificadas aquí:

- **Licencia del paquete:** `Apache-2.0` (campo `license` de `manifold-3d@3.5.4`).
- **Incluye `NOTICE` upstream:** **no**. El desempaquetado contiene únicamente
  `LICENSE`; en consecuencia, la atribución exigida por Apache-2.0 se deja
  consignada en este documento.
- **Aislamiento:** la dependencia está declarada **solo** en
  `packages/kernel-adapter/package.json`. Ningún otro workspace la declara.
- **Qué llega al bundle web** (experimento V1, build con Vite + Chromium):
  - `manifold.wasm` — 541 470 B (gzip 205 699 B; brotli 158 724 B).
  - El *glue* JavaScript de Manifold dentro del bundle de aplicación
    (49 783 B totales de JS, gzip 16 598 B).
  - **No se empaquetan** `sharp`, `@gltf-transform/*` ni `esbuild-wasm`: el
    adaptador no los importa (evidencia: `experiments/results/4b0-results.json`,
    solo se sirven 3 recursos, todos `200`).

### Obligaciones Apache-2.0 asumidas (resumen; detalle en `ADR-001-GEOMETRY-ENGINE.md`, A1–A7)

1. Conservar el `LICENSE` de `manifold-3d` en las distribuciones binarias.
2. Declarar la atribución (este archivo).
3. Marcar los archivos modificados; el código de este repositorio no modifica
   `manifold-3d` (se consume como dependencia intacta).
4. No usar la marca «Manifold» para productos derivados (nombre comercial
   propio: FurniConfig).
5. Documentar los cambios cuando aplique.
6. Incluir el aviso de terceros en la distribución (este archivo).
7. Mantener el registro de versiones (versión fija exacta en `package.json` y
   `package-lock.json`).

---

## 2. Dependencias transitivas del kernel

`manifold-3d@3.5.4` declara **11 dependencias directas** (`dependencies`).
El cierre transitivo alcanzable (`dependencies` + `optionalDependencies` +
`peerDependencies`) es de **64 paquetes** incluido él mismo; contando solo
`dependencies` estrictas son 35. Instalación real observada en `node_modules`:
**≈ 54,13 MB en 38 paquetes** presentes en disco (Linux x64); el resto son
binarios de otras plataformas (opcionales multiplataforma de `sharp`) no
instalados. **Ninguna de esas 11 directas es reachable desde el *entry* que
consumimos** (ver §3). Reproducible con
`node -e` sobre `package-lock.json` (método: recorrido de `dependencies` +
`optionalDependencies` + `peerDependencies` desde `manifold-3d`).

### Distribución por licencia

| Licencia | Paquetes | Notas |
|----------|---------:|-------|
| MIT | 29 | `@gltf-transform/*`, `commander`, `fast-xml-parser`, `esbuild-wasm`, `ndarray-*`, etc. |
| Apache-2.0 | 14 | `manifold-3d`, `sharp` y binarios `@img/sharp-*` de otras plataformas |
| **LGPL-3.0-or-later** | 10 | binarios `@img/sharp-libvips-*` (libvips) |
| Apache-2.0 AND LGPL-3.0-or-later | 3 | `@img/sharp-win32-*` |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 | `@img/sharp-wasm32` |
| ISC | 1 | `semver` |
| 0BSD | 1 | `tslib` |

### ⚠ Copyleft transitivo: `sharp` / `libvips`

Cadena de dependencia observada (`npm ls sharp`):

```
manifold-3d → @gltf-transform/functions → ndarray-pixels → sharp → @img/sharp-libvips-*
```

- Licencia: **LGPL-3.0-or-later** (binarios `@img/sharp-libvips-*`,
  `@img/sharp-libvips-linux-x64@1.3.4` = 17,84 MB instalados).
- **No es una dependencia del kernel que consumimos**: `sharp` solo lo usan las
  utilidades de exportación glTF/3MF de Manifold, que este repositorio no
  invoca. El adaptador importa exclusivamente `manifold-3d/manifold`, y el
  experimento V1 demuestra que esas rutas **no entran en el bundle**.
- Implicación: los binarios LGPL residen en `node_modules` y en el árbol de
  dependencias del *lockfile*, pero **no se distribuyen** con el build web.
  Riesgo registrado para la fase 4B (evaluar reducción del árbol o aislamiento
  en contenedor/CLI aparte antes de cualquier empaquetado de escritorio).

### Pesos instalados principales (Linux x64)

| Paquete | Tamaño | Licencia |
|---------|-------:|----------|
| `@img/sharp-libvips-linux-x64` | 17,84 MB | LGPL-3.0-or-later |
| `esbuild-wasm` | 13,45 MB | MIT |
| `@img/sharp-wasm32` | 8,89 MB | Apache-2.0 AND LGPL-3.0-or-later AND MIT |
| `manifold-3d` | 3,10 MB | Apache-2.0 |
| `@gltf-transform/extensions` | 1,97 MB | MIT |
| `@gltf-transform/functions` | 1,89 MB | MIT |

---

## 3. Categorías de distribución (qué viaja y dónde)

La distinción importa porque las obligaciones legales dependen de **qué se
distribuye**, no de lo que hay en `node_modules`. Basada en evidencia verificada
el 15/10/2026:

- El *entry* de `manifold-3d` (`manifold.js`) referencia **únicamente built-ins
  de Node** (`node:fs`, `node:path`, `node:url`, `node:module`). No importa
  ningún paquete de terceros. (Los cruces aparentes con `sharp` son la variable
  local `sharp` de la API `smooth()`, no el paquete `sharp`.)
- Las 11 dependencias directas de `manifold-3d` las usan solo `lib/*` y
  `bin/*` (utilidades de importación/exportación glTF y 3MF), que este
  repositorio **no importa**.
- El experimento V1 (build real + Chromium) sirve **3 recursos** (HTML, JS, WASM)
  y **0** de esas rutas.

| # | Categoría | Contenido | Obligaciones |
|---|-----------|-----------|--------------|
| 1 | **Dependencias de desarrollo** | `typescript`, `vitest`, `playwright`, `vite`, `@types/*` y afines (del monorepo). | No se distribuyen con ningún artefacto. Solo rigen sus propias licencias para el uso/uso interno. |
| 2 | **Dependencias de runtime del kernel (sí distribuidas al navegador)** | `manifold-3d@3.5.4` → únicamente `manifold.js` (glue) + `manifold.wasm`. | **Apache-2.0**: conservar `LICENSE`, declarar atribución (este archivo), no modificar el código ni usar la marca «Manifold» para derivados. |
| 3 | **Dependencias transitivas NO distribuidas al navegador** | Las 11 directas de `manifold-3d` (`@gltf-transform/*`, `@jscadui/3mf-export`, `commander`, `fast-xml-parser`, `fflate`, `magic-string`, `convert-source-map`, `@jridgewell/*`) y su subárbol, que incluye `sharp` → `@img/sharp-libvips-*` (**LGPL-3.0-or-later**). | **Ninguna mientras no se distribuyan.** Residen en `node_modules` y en el *lockfile*, pero no entran en el bundle web (evidencia arriba). |
| 4 | **Dependencias que podrían acompañar paquetes de escritorio o CLI** | Si en el futuro se empaqueta una app de escritorio (p. ej. Electron) o una CLI que lleve `node_modules`, **viajarían** `sharp`/`@img/sharp-libvips-*` (LGPL) y las utilidades glTF/3MF. | **Evaluar antes de empaquetar**: la LGPL pasaría a ser relevante (copyleft de binario, requiere ofrecer el código fuente de la LGPL o mecanismo de sustitución de la biblioteca). Ver `RISKS.md`. |

> **Cautela legal:** este documento recoge la auditoría técnica de dependencias
> y licencias practicada en esta rama; **no constituye asesoramiento legal**.
> La afirmación «compatible» se limita a lo evidenciado (el build web no
> distribuye código LGPL). Cualquier decisión de empaquetado de escritorio o
> CLI debe pasar por una revisión legal antes de publicarse.

---

## 4. Otras dependencias del monorepo

El resto de dependencias (`apps/web`, `packages/geometry-core`) permanecen **sin
cambios** en esta rama y se rigen por sus propias licencias (MIT/Apache-2.0/ISC
según `package-lock.json`). Este documento se actualizará en cada incorporación
de una dependencia nueva.

---

*Generado para FASE-4B-0. Actualizar al promover `manifold-3d` de candidato a
motor definitivo (decisión que corresponde a la Fase 4B, no a esta etapa).*
