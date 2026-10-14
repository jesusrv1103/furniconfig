# Issue #123: Guía de migración de versiones

## Descripción
Documento para migrar configs entre versiones de contrato (WardrobeConfig versionado).

## Descripción técnica

### Contexto
- `WardrobeConfig` tiene campo `version: number` (contrato versionado).
- Cambios breaking → nueva versión mayor.
- Cambios compatibles → versión menor (migración automática).
- Necesitamos documentar migración entre versiones.

### Contenido del documento
`docs/migration-guide.md`:

1. **Tabla de versiones**
   | Versión | Fecha | Cambios breaking | Migración automática |
   |---------|-------|------------------|---------------------|
   | 1.0     | 2024-01 | Initial | N/A |
   | 1.1     | 2024-03 | Added `doors.leavesPerModule` | Auto (default: 1) |
   | 2.0     | 2024-06 | `modules` → array de objetos | Script requerido |

2. **Detalle de cambios por versión**
   - Qué cambió (campos añadidos/eliminados/renombrados).
   - Qué valores por defecto se asumen.
   - Qué validaciones nuevas se aplican.

3. **Script de migración automática**
   ```typescript
   // src/lib/migration.ts
   export function migrateConfig(config: unknown, fromVersion: number): WardrobeConfig {
     let current = config as any;
     
     // v1.0 → 1.1: añadir doors.leavesPerModule = 1
     if (fromVersion < 1.1) {
       current.doors = current.doors || {};
       current.doors.leavesPerModule = current.doors.leavesPerModule ?? 1;
     }
     
     // v1.x → 2.0: restructurar modules
     if (fromVersion < 2.0) {
       current.modules = migrateModulesV1toV2(current.modules);
     }
     
     current.version = CURRENT_VERSION;
     return validateWardrobeConfig(current);
   }
   ```

4. **CLI de migración**
   ```bash
   npm run migrate:config -- --input=config.json --from=1.0 --output=migrated.json
   ```

5. **Guía para desarrolladores**
   - Cómo añadir nueva versión de contrato.
   - Cómo escribir función de migración.
   - Testing de migraciones (round-trip: migrate → validate → same result).

## Criterios de aceptación

- [ ] Documento `docs/migration-guide.md` completo.
- [ ] Tabla de versiones con cambios breaking.
- [ ] Script de migración `src/lib/migration.ts` funcional.
- [ ] CLI `npm run migrate:config` funcional.
- [ ] Tests: round-trip (migra → valida → mismo resultado semántico).
- [ ] Documentación para desarrolladores (cómo añadir versión).

## Áreas afectadas

- `docs/migration-guide.md` (nuevo documento)
- `apps/web/src/lib/migration.ts` (nuevo módulo)
- `apps/web/package.json` (script `migrate:config`)
- Tests unitarias (round-trip migración)

## Etiquetas sugeridas

`documentation`, `good first issue`, `phase-3n`

## Prioridad

Media