# Política de Seguridad — FurniConfig

> **Versión:** 1.0 | **Fecha:** 2024-10-14 | **Idioma principal:** Español

---

## 🔒 Reporte de vulnerabilidades

**NO abras un issue público** para reportar vulnerabilidades de seguridad.

### Cómo reportar

Envía un email privado a: **security@furniconfig.example.com** (placeholder — actualizar con email real)

Incluye en tu reporte:

1. **Descripción clara** de la vulnerabilidad.
2. **Pasos para reproducir** (si es posible).
3. **Impacto estimado** (qué datos/sistemas afecta).
5. **Prueba de concepto** (si la tienes, opcional).
6. **Versión/Commit** afectado (hash o versión).

### Qué esperar

| Plazo | Acción |
|-------|--------|
| **≤ 48h** | Confirmación de recepción + evaluación inicial. |
| **≤ 7 días** | Análisis de impacto + plan de mitigación. |
| **≤ 30 días** | Fix + release (si es crítico, antes). |
| **Post-fix** | Publicación de aviso de seguridad (CVE si aplica). |

### Confidencialidad

- Tratamos todos los reportes como **confidenciales**.
- No divulgamos detalles hasta que haya fix disponible.
- Coordinamos divulgación responsable (CVE si procede).
- Agradecemos públicamente al reportero (si lo desea) tras el fix.

---

## 🛡️ Alcance de seguridad

### En alcance (in-scope)

- Código del motor geométrico (`packages/geometry-core`).
- Aplicación web (`apps/web`): React, Three.js, Vite.
- Dependencias directas (`package.json` de cada workspace).
- Configuración CI/CD (`.github/workflows/`).
- Datos de usuario en `localStorage` (diseños guardados).
- Contratos de configuración versionados (`geometry-core/contract/`).

### Fuera de alcance (out-of-scope)

- Infraestructura de GitHub (GitHub Actions, Pages, etc.).
- Navegador del usuario (configuración de seguridad del navegador).
- `localStorage` del navegador (gobierno del usuario).
- Dependencias transitorias sin vulnerabilidad conocida.
- Servicios de terceros (npm registry, GitHub Actions runners).

---

## 🛡️ Medidas de seguridad actuales

### Código

- **Sin secrets en repo**: `.gitignore` incluye `.env*`, `*.key`, `*.pem`, `secrets/`.
- **No hay backend** (Fase 0): sin autenticación, base de datos, API expuesta.
- **Sin datos sensibles**: Solo diseños de muebles en `localStorage` del usuario.
- **Dependencias**: `npm audit` en CI; `package-lock.json` versionado.

### CI/CD (GitHub Actions)

- **Permisos mínimos**: `contents: read` solo.
- **Sin secretos en CI**: No hay `secrets` configurados en el repo.
- **Node 22 LTS** fijado en CI.
- **npm ci** para instalaciones reproducibles.

### Dependencias

| Tipo | Acción |
|------|--------|
| Directas | Revisadas manualmente en cada PR. |
| Transitorias | `npm audit` en CI (fallo en `high`/`critical`). |
| Licencias | MIT/Apache-2.0/BSD/MPL/ISC — compatibles. |
| Actualizaciones | `npm outdated` mensual; actualizaciones menores automáticas via Dependabot (configurar). |

---

## 📦 Dependencias — Auditoría de licencias (resumen)

| Licencia | Paquetes | Compatible MIT |
|----------|----------|----------------|
| MIT | 88 | ✅ |
| Apache-2.0 | 10 | ✅ |
| MPL-2.0 | 3 | ✅ |
| BSD-3-Clause | 2 | ✅ |
| ISC | 4 | ✅ |
| UNLICENSED (propios) | 3 | — |

**No hay dependencias GPL/AGPL/SSPL** que obliguen a cambiar licencia.

Dependencias Apache-2.0 notables:
- `@dimforge/rapier3d-compat` (física)
- `@mediapipe/tasks-vision` (MediaPipe)
- `draco3d` (compresión mallas)
- `detect-libc` (detección libc)

Todas compatibles con MIT.

---

## 🚫 Fuera de alcance para el programa de seguridad

- **Ingeniería social / phishing** dirigido a mantenedores.
- **Ataques a la cadena de suministro** en npm registry / GitHub (fuera de nuestro control).
- **Vulnerabilidades en el navegador** del usuario final.
- **Pérdida de datos** por borrado accidental del usuario en `localStorage`.
- **Uso malicioso** de la herramienta para diseñar estructuras inseguras (responsabilidad del usuario/carpintero).

---

## 📋 Checklist de seguridad para PRs

Antes de mergear, verifica:

- [ ] No hay secrets/tokens en código ni tests.
- [ ] `npm audit` pasa (sin `high`/`critical` nuevos).
- [ ] Dependencias nuevas tienen licencia compatible (MIT/Apache/BSD/MPL/ISC).
- [ ] No se introduce backend/API sin revisión de seguridad.
- [ ] No se exponen datos de usuario sin consentimiento.
- [ ] TypeScript `strict` pasa sin `any` injustificado.

---

## 📞 Contacto de seguridad

**Email**: security@furniconfig.example.com (placeholder — actualizar con email real)

**Clave PGP**: (pendiente — añadir clave pública del mantenedor)

**Tiempo de respuesta**: ≤ 48h laborables.

---

## 📜 Divulgación responsable

Seguimos el modelo de **divulgación coordinada**:

1. Recibimos reporte → confirmamos ≤ 48h.
2. Investigamos + desarrollamos fix.
3. Coordinamos fecha de publicación con reportero.
3. Publicamos aviso + release con fix.
4. Agradecemos públicamente (si reportero lo desea).
5. Solicitamos CVE si aplica (MITRE/GitHub Security Advisories).

---

## 📜 Historial de seguridad

| Fecha | CVE / ID | Severidad | Descripción | Estado |
|-------|----------|-----------|-------------|--------|
| — | — | — | Sin incidencias conocidas | — |

---

## 📞 Contacto de seguridad

**Email**: security@furniconfig.example.com (placeholder — actualizar con email real)

**Clave PGP**: (pendiente — añadir clave pública del mantenedor)

**Horario de respuesta**: Lunes–Viernes, 9:00–18:00 CET (zona horaria Madrid).

---

> **¿Dudas sobre si algo es una vulnerabilidad?** Reporta de todas formas. Preferimos falsos positivos a vulnerabilidades no reportadas.