import { describe, expect, it } from 'vitest';
import {
  calculateGeometry,
  validateWardrobeConfig,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import { DEFAULT_CONFIG } from '../src/lib/config.js';
import {
  LAYOUT_TEMPLATES,
  applyLayoutTemplate,
} from '../src/lib/studio/templates.js';

describe('plantillas de distribución (Fase 3D)', () => {
  it('el catálogo contiene las cuatro plantillas iniciales', () => {
    expect(LAYOUT_TEMPLATES.map((t) => t.id)).toEqual([
      'basico',
      'colgar',
      'cajonera',
      'mixto',
    ]);
  });

  it('toda plantilla produce una configuración válida', () => {
    for (const template of LAYOUT_TEMPLATES) {
      const config = applyLayoutTemplate(DEFAULT_CONFIG, template);
      expect(validateWardrobeConfig(config).ok).toBe(true);
      expect(() => calculateGeometry(config)).not.toThrow();
    }
  });

  it('son válidas también con espesor de tablero de 15 mm', () => {
    const thin: WardrobeConfig = {
      ...DEFAULT_CONFIG,
      materials: {
        ...DEFAULT_CONFIG.materials,
        structure: { name: 'Roble', thicknessMm: 15, finish: 'mate' },
      },
    };
    for (const template of LAYOUT_TEMPLATES) {
      const config = applyLayoutTemplate(thin, template);
      expect(validateWardrobeConfig(config).ok).toBe(true);
      expect(() => calculateGeometry(config)).not.toThrow();
    }
  });

  it('aplicar cambia dimensiones y módulos y conserva materiales y opciones', () => {
    const user: WardrobeConfig = {
      ...DEFAULT_CONFIG,
      materials: {
        ...DEFAULT_CONFIG.materials,
        structure: { name: 'Nogal', thicknessMm: 18, finish: 'brillo' },
      },
      doors: { leaves: 1 },
    };
    const template = LAYOUT_TEMPLATES.find((t) => t.id === 'cajonera');
    if (template === undefined) {
      throw new Error('falta la plantilla cajonera');
    }
    const config = applyLayoutTemplate(user, template);
    expect(config.dimensions).toEqual(template.dimensions);
    expect(config.modules).toHaveLength(3);
    expect(config.modules.map((m) => m.kind)).toEqual([
      'drawers',
      'hanging',
      'shelves',
    ]);
    expect(config.materials.structure.name).toBe('Nogal');
    expect(config.doors).toEqual({ leaves: 1 });
  });

  it('la plantilla mixto fija un ancho y reparte el resto automáticamente', () => {
    const template = LAYOUT_TEMPLATES.find((t) => t.id === 'mixto');
    if (template === undefined) {
      throw new Error('falta la plantilla mixto');
    }
    const config = applyLayoutTemplate(DEFAULT_CONFIG, template);
    const geometry = calculateGeometry(config);
    // 2.600 − 2·18 − 3·18 = 2.510; fijado 900; sobrante
    // 1.610 entre 3 automáticos: 537, 537, 536 (residuo a
    // los primeros automáticos, de izquierda a derecha).
    expect(geometry.wardrobe.modules.map((m) => m.widthMm)).toEqual([
      900, 537, 537, 536,
    ]);
  });

  it('conserva los identificadores deterministas de los módulos', () => {
    for (const template of LAYOUT_TEMPLATES) {
      const config = applyLayoutTemplate(DEFAULT_CONFIG, template);
      const geometry = calculateGeometry(config);
      expect(geometry.wardrobe.modules.map((m) => m.id)).toEqual(
        template.modules.map((_, index) => `module-${index + 1}`),
      );
    }
  });

  it('no muta la configuración de entrada ni el catálogo', () => {
    const before = JSON.stringify(DEFAULT_CONFIG);
    const template = LAYOUT_TEMPLATES[0];
    if (template === undefined) {
      throw new Error('catálogo vacío');
    }
    const config = applyLayoutTemplate(DEFAULT_CONFIG, template);
    expect(config.modules).not.toBe(DEFAULT_CONFIG.modules);
    expect(JSON.stringify(DEFAULT_CONFIG)).toBe(before);
  });
});
