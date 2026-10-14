# Pull Request

## Descripción

<!-- Descripción clara de los cambios. Qué problema resuelve o qué funcionalidad añade. -->

## Tipo de cambio

- [ ] Bug fix (corrección de error)
- [ ] New feature (nueva funcionalidad)
- [ ] Breaking change (cambio incompatible)
- [ ] Documentation update (actualización de docs)
- [ ] Refactor (refactor sin cambio funcional)
- [ ] Test (añadir/actualizar pruebas)
- [ ] Chore (mantenimiento, dependencias, CI)

## Áreas afectadas

- [ ] `packages/geometry-core` (motor geométrico)
- [ ] `apps/web` (visualizador React/Three.js)
- [ ] `docs/` (documentación)
- [ ] `.github/` (CI, plantillas, configs)
- [ ] Tests (unitarias / visuales)

## Descripción técnica

<!-- Detalles de implementación: qué archivos cambian, qué funciones se modifican, por qué se tomó esta decisión. -->

## Testing

### Pruebas ejecutadas localmente

- [ ] `npm run typecheck` — 0 errores
- [ ] `npm test` — 343/343 tests pasan
- [ ] `npm run build` — Build exitoso
- [ ] `npm run test:visual --workspace @furniconfig/web` — 200/200 checks visuales

### Casos de prueba cubiertos

<!-- Qué casos de prueba nuevos/actualizados cubren este cambio. -->

## Capturas de pantalla / Video

<!-- Si hay cambios visuales, adjunta capturas o video (arrastra y suelta aquí). -->

## Checklist

- [ ] Código sigue convenciones del proyecto (TypeScript strict, ESLint, Prettier).
- [ ] Tests unitarias añadidas/actualizadas para nueva funcionalidad.
- [ ] Documentación actualizada (README, CHANGELOG, docs/ si aplica).
- [ ] CHANGELOG.md actualizado (sección [Unreleased]).
- [ ] Commits siguen Conventional Commits (`fix:`, `feat:`, `docs:`, `refactor:`, `test:`, `chore:`).
- [ ] No hay secrets/tokens en el código.
- [ ] `npm run typecheck` pasa (0 errores).
- [ ] `npm test` pasa (343/343).
- [ ] `npm run build` pasa.
- [ ] (Si cambios visuales) `npm run test:visual` pasa 200/200.

## Checklist de revisión (para revisores)

- [ ] Código legible, bien nombrado, sin `any` injustificado.
- [ ] Tests cubren casos nominales, límites y entradas inválidas.
- [ ] No hay regresiones en funcionalidad existente.
- [ ] Cambios en `geometry-core` mantienen pureza (sin Three.js/React/I/O).
- [ ] Cambios en `web` respetan separación motor/presentación.
- [ ] CHANGELOG.md actualizado correctamente.

## Contexto adicional

<!-- Issues relacionados, discusiones previas, referencias externas. -->

---

> **Nota**: Los merges a `main` se hacen via **merge commit** (preserva historial). No squash, no rebase, no force push.