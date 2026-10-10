import { describe, expect, it } from 'vitest';
import {
  CONFIG_TAB_IDS,
  CONFIG_TAB_LABELS,
  isConfigTabId,
  nextTabOnArrowKey,
} from '../src/lib/studio/tabs.js';

describe('nextTabOnArrowKey (navegación por teclado de pestañas)', () => {
  it('ArrowRight avanza en el orden visual y circula al final', () => {
    expect(nextTabOnArrowKey('medidas', 'ArrowRight')).toBe('interior');
    expect(nextTabOnArrowKey('interior', 'ArrowRight')).toBe('apariencia');
    expect(nextTabOnArrowKey('apariencia', 'ArrowRight')).toBe('disenos');
    expect(nextTabOnArrowKey('disenos', 'ArrowRight')).toBe('medidas');
  });

  it('ArrowLeft retrocede y circula al principio', () => {
    expect(nextTabOnArrowKey('medidas', 'ArrowLeft')).toBe('disenos');
    expect(nextTabOnArrowKey('disenos', 'ArrowLeft')).toBe('apariencia');
    expect(nextTabOnArrowKey('apariencia', 'ArrowLeft')).toBe('interior');
    expect(nextTabOnArrowKey('interior', 'ArrowLeft')).toBe('medidas');
  });

  it('Home y End saltan a los extremos', () => {
    expect(nextTabOnArrowKey('interior', 'Home')).toBe('medidas');
    expect(nextTabOnArrowKey('interior', 'End')).toBe('disenos');
    expect(nextTabOnArrowKey('disenos', 'Home')).toBe('medidas');
    expect(nextTabOnArrowKey('medidas', 'End')).toBe('disenos');
  });

  it('otras teclas no mueven la selección', () => {
    expect(nextTabOnArrowKey('medidas', 'Enter')).toBeNull();
    expect(nextTabOnArrowKey('medidas', ' ')).toBeNull();
    expect(nextTabOnArrowKey('medidas', 'ArrowUp')).toBeNull();
    expect(nextTabOnArrowKey('medidas', 'Tab')).toBeNull();
  });

  it('un id inválido devuelve null', () => {
    expect(nextTabOnArrowKey('otra' as never, 'ArrowRight')).toBeNull();
  });
});

describe('catálogo de pestañas (Fase 3E)', () => {
  it('las cuatro categorías están definidas en orden con etiqueta', () => {
    expect(CONFIG_TAB_IDS).toEqual([
      'medidas',
      'interior',
      'apariencia',
      'disenos',
    ]);
    expect(CONFIG_TAB_LABELS).toEqual({
      medidas: 'Medidas',
      interior: 'Interior',
      apariencia: 'Apariencia',
      disenos: 'Mis diseños',
    });
  });

  it('isConfigTabId acepta los ids del catálogo y rechaza otros', () => {
    expect(CONFIG_TAB_IDS.every(isConfigTabId)).toBe(true);
    expect(isConfigTabId('cocinas')).toBe(false);
    expect(isConfigTabId('')).toBe(false);
  });
});
