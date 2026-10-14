# Issue #125: Video tutoriales

## Descripción
Videos cortos (2-5 min) para features clave, con subtítulos ES/EN.

## Descripción técnica

### Lista de videos (5-8 videos, 2-5 min cada uno)

| # | Título | Duración | Contenido |
|---|--------|----------|-----------|
| 1 | **Primeros pasos** | 3 min | Instalación, `npm install`, `npm run dev`, tour UI |
| 2 | **Medidas y módulos** | 4 min | Ancho/alto/profundidad, añadir/quitar módulos, fijar anchos |
| 3 | **Distribución flexible** | 5 min | Fijar/liberar, Igualar, Repartir, Plantilla mixto, arrastre visual |
| 4 | **Interior: cajones, repisas, barra** | 4 min | Cajones por módulo, repisas, barra de colgado, materiales |
| 5 | **Puertas y acabados** | 4 min | 1/2 hojas, materiales, tiradores, panel trasero |
| 6 | **Cotas y arrastre visual (3F.1/3F.2)** | 4 min | Control Cotas, mm/cm, arrastre separadores, teclado |
| 7 | **Proyectos: guardar, exportar, importar** | 3 min | Crear diseño, autosave, exportar JSON, importar, duplicar |
| 8 | **Accesibilidad y teclado** | 3 min | Navegación Tab, flechas, atajos Ctrl+Z, focus visible |

### Especificaciones técnicas

- **Duración**: 2-5 min por video.
- **Resolución**: 1920x1080 (Full HD), 30 fps.
- **Audio**: Voz en español (locutor nativo), micrófono calidad.
- **Subtítulos**: `.srt` ES + EN (incluidos en video + archivo aparte).
- **Formato**: MP4 (H.264, 8-12 Mbps).
- **Branding**: Intro/outro con logo FurniConfig, versión, fecha.
- **Capturas**: Grabación de pantalla (OBS) + voz en off.
- **Subtítulos**: Archivos `.srt` separados (ES/EN) + embebidos en YouTube.

### Publicación

- **YouTube**: Canal FurniConfig (playlist "Tutoriales").
- **GitHub**: Releases + `docs/tutorials/` (embeds + enlaces).
- **README**: Enlace a playlist en README.
- **Subtítulos**: Archivos `.srt` en `docs/tutorials/subtitles/`.

## Criterios de aceptación

- [ ] 8 videos publicados (2-5 min cada uno).
- [ ] Audio español nativo, calidad profesional.
- [ ] Subtítulos ES/EN (`.srt` separados + embebidos).
- [ ] Resolución 1080p, 30 fps, bitrate 8-12 Mbps.
- [ ] Branding consistente (intro/outro logo, versión, fecha).
- [ ] Subtítulos `.srt` ES/EN en `docs/tutorials/subtitles/`.
- [ ] Embeds en `docs/tutorials/` + enlaces en README.
- [ ] Playlist YouTube "FurniConfig Tutoriales".
- [ ] Metadatos: título, descripción, tags, capítulos (timestamps).

## Áreas afectadas

- `docs/tutorials/` (nuevo directorio con embeds + subtítulos)
- `docs/tutorials/subtitles/` (archivos `.srt` ES/EN)
- YouTube: canal FurniConfig + playlist
- README.md (enlaces a tutoriales)
- Video assets (MP4 + SRT) - almacenados externamente (YouTube/GitHub Releases)

## Etiquetas sugeridas

`documentation`, `help wanted`, `phase-3n`

## Prioridad

Baja