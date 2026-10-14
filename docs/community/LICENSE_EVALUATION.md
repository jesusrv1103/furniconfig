# Evaluación de Licencia para FurniConfig

## Resumen ejecutivo

Se recomienda **MIT License** como licencia principal para FurniConfig, con una excepción explícita para el motor geométrico (`@furniconfig/geometry-core`) que se mantendrá bajo una licencia compatible (MIT) para permitir su uso en proyectos comerciales y derivados.

## Criterios de evaluación

| Criterio | MIT | Apache 2.0 | AGPLv3 |
|----------|-----|------------|--------|
| Uso comercial | ✅ Permitido | ✅ Permitido | ⚠️ Requiere abrir código si se usa como SaaS |
| Distribución de versiones modificadas | ✅ Permitido | ✅ Permitido (con notificación) | ✅ Permitido (debe abrir fuente) |
| Uso como servicio SaaS | ✅ Sin restricciones | ✅ Sin restricciones | ❌ Requiere abrir código completo |
| Patentes | ❌ Sin cláusula | ✅ Cláusula de patentes | ✅ Cláusula de patentes |
| Compatibilidad con dependencias | ✅ Compatible con MIT, Apache, BSD | ✅ Compatible | ⚠️ Incompatible con MIT/BSD en algunos casos |
| Obligaciones para colaboradores | Mínimas (mantener licencia) | Mantener notificaciones | Deben licenciar bajo AGPLv3 |
| Adopción en ecosistema TypeScript/React/Three.js | ✅ Estándar de facto | Común | Raro |

## Análisis de dependencias

Todas las dependencias directas e indirectas son compatibles con MIT:
- **MIT (88 paquetes)**: React, Three.js, React Three Fiber, Vite, Vitest, TypeScript, etc.
- **Apache-2.0 (10 paquetes)**: @dimforge/rapier3d-compat, @mediapipe/tasks-vision, draco3d, detect-libc
- **MPL-2.0 (3 paquetes)**: Compatible con MIT
- **BSD-3-Clause (2 paquetes)**: Compatible con MIT
- **ISC (4 paquetes)**: Compatible con MIT

**No hay dependencias GPL/AGPL** que obliguen a cambiar la licencia.

## Recomendación: MIT License

### Justificación

1. **Máxima adopción**: MIT es la licencia estándar en el ecosistema TypeScript/React/Three.js. Facilita contribuciones y adopción comercial.

2. **Compatibilidad total**: Todas las dependencias son compatibles con MIT. No hay conflictos de licencia.

3. **SaaS-friendly**: Permite usar FurniConfig como servicio SaaS sin obligación de abrir el código del servicio (a diferencia de AGPLv3).

4. **Simplicidad**: Texto corto, fácil de entender, pocas obligaciones para colaboradores.

5. **Protección de patentes**: Aunque MIT no tiene cláusula explícita de patentes, la simplicidad y adopción generalizada compensan. Si se requiere protección de patentes explícita, se puede añadir una excepción Apache-2.0 para el motor geométrico.

### Texto propuesto (MIT License)

```
MIT License

Copyright (c) 2024 Jesús Ramírez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Excepción para el motor geométrico (opcional)

Si se desea mayor protección para el motor geométrico (`@furniconfig/geometry-core`), se puede dual-licenciar bajo **Apache-2.0** (que incluye cláusula de patentes) manteniendo el resto bajo MIT.

## Decisión pendiente

- [ ] Aprobación del propietario para MIT License
- [ ] Decisión sobre excepción Apache-2.0 para geometry-core
- [ ] Añadir archivo LICENSE al repositorio tras aprobación
- [ ] Actualizar package.json con campo "license": "MIT"

## Referencias

- [Choose a License](https://choosealicense.com/)
- [MIT vs Apache 2.0](https://choosealicense.com/licenses/mit/)
- [Licencias compatibles con MIT](https://github.com/github/choosealicense.com/blob/gh-pages/_licenses/mit.txt)