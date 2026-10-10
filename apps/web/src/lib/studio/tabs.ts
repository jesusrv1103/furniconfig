/**
 * Categorías de edición del panel de configuración
 * (Fase 3E: experiencia de diseño simplificada).
 *
 * El panel se organiza en cuatro pestañas temáticas —
 * Medidas, Interior, Apariencia y Mis diseños — para que
 * una persona sin experiencia en CAD encuentre las
 * herramientas sin recorrer un formulario largo. Todas
 * las herramientas existentes siguen disponibles: esto es
 * organización, no recorte de funcionalidad.
 *
 * La lógica de navegación es pura y determinista para
 * poderse probar sin navegador.
 */

/** Ids de pestaña, en orden visual (izquierda a derecha). */
export const CONFIG_TAB_IDS = [
  'medidas',
  'interior',
  'apariencia',
  'disenos',
] as const;

export type ConfigTabId = (typeof CONFIG_TAB_IDS)[number];

/** Etiquetas visibles (lenguaje sencillo). */
export const CONFIG_TAB_LABELS: Readonly<Record<ConfigTabId, string>> = {
  medidas: 'Medidas',
  interior: 'Interior',
  apariencia: 'Apariencia',
  disenos: 'Mis diseños',
};

/** Textos de ayuda breves, bajo la barra de pestañas. */
export const CONFIG_TAB_HINTS: Readonly<Record<ConfigTabId, string>> = {
  medidas: 'Tamaño del mueble y reparto del espacio entre módulos.',
  interior: 'Contenido de cada módulo: repisas, cajones y espacio para colgar.',
  apariencia: 'Materiales, acabados, puertas y panel trasero.',
  disenos: 'Guarda, abre, duplica o exporta tus proyectos.',
};

/** Comprueba que un id de pestaña es válido. */
export function isConfigTabId(value: string): value is ConfigTabId {
  return (CONFIG_TAB_IDS as readonly string[]).includes(value);
}

/**
 * Siguiente pestaña según una pulsación de teclado en la
 * barra de pestañas (patrón accesible WAI-ARIA): las
 * flechas circulan por el orden visual y Home/End van al
 * principio o al final. Devuelve `null` si la tecla no
 * mueve la selección.
 */
export function nextTabOnArrowKey(
  current: ConfigTabId,
  key: string,
): ConfigTabId | null {
  const index = CONFIG_TAB_IDS.indexOf(current);
  if (index === -1) {
    return null;
  }
  const count = CONFIG_TAB_IDS.length;
  let nextIndex: number;
  switch (key) {
    case 'ArrowRight':
      nextIndex = (index + 1) % count;
      break;
    case 'ArrowLeft':
      nextIndex = (index - 1 + count) % count;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = count - 1;
      break;
    default:
      return null;
  }
  // `noUncheckedIndexedAccess`: el índice siempre está en
  // rango (módulo sobre la longitud), pero el compilador
  // no lo deduce; se resuelve de forma explícita.
  const next = CONFIG_TAB_IDS[nextIndex];
  return next === undefined ? null : next;
}
