import { describe, expect, it } from 'vitest';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { DEFAULT_CONFIG, setModuleWidth, equalizeAllWidths } from '../src/lib/config.js';
import {
  computeDragResult,
  quantizeDelta,
  type SeparatorDragResult,
} from '../src/lib/studio/separators.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const geometry = deepFreeze(calculateGeometry(DEFAULT_CONFIG));

describe('quantizeDelta (cuantización de paso)', () => {
  it('step10: redondea a múltiplos de 10', () => {
    expect(quantizeDelta(7, 'step10')).toBe(10);
    expect(quantizeDelta(13, 'step10')).toBe(10);
    expect(quantizeDelta(15, 'step10')).toBe(20);
    expect(quantizeDelta(-7, 'step10')).toBe(-10);
    expect(quantizeDelta(-15, 'step10')).toBe(-20);
  });

  it('precise1: redondea a entero (sin cambio efectivo)', () => {
    expect(quantizeDelta(7.3, 'precise1')).toBe(7);
    expect(quantizeDelta(7.8, 'precise1')).toBe(8);
    expect(quantizeDelta(-3.2, 'precise1')).toBe(-3);
  });
});

describe('computeDragResult (arrastre de separador)', () => {
  it('sin geometría no cambia nada', () => {
    const result = computeDragResult(null, DEFAULT_CONFIG, 0, 100, 'precise1');
    expect(result.changed).toBe(false);
    expect(result.appliedDeltaMm).toBe(0);
  });

  it('delta 0 no cambia nada', () => {
    const result = computeDragResult(geometry, DEFAULT_CONFIG, 0, 0, 'precise1');
    expect(result.changed).toBe(false);
    expect(result.appliedDeltaMm).toBe(0);
  });

  it('dos módulos automáticos: mover divisor reparte el delta', () => {
    // DEFAULT_CONFIG: 3 módulos automáticos (776 cada uno)
    const result = computeDragResult(geometry, DEFAULT_CONFIG, 0, 50, 'precise1');
    expect(result.changed).toBe(true);
    expect(result.appliedDeltaMm).toBe(50);
    expect(result.leftWidthMm).toBe(826); // 776 + 50
    expect(result.rightWidthMm).toBe(726); // 776 - 50
    // Ambos módulos quedan fijados
    expect(result.config.modules[0]!.widthMm).toBe(826);
    expect(result.config.modules[1]!.widthMm).toBe(726);
    // El tercer módulo no cambia
    expect(result.config.modules[2]!.widthMm).toBeUndefined();
  });

  it('módulo izquierdo fijado, derecho automático', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 900);
    const geo = calculateGeometry(config);
    // Con módulo 0 en 900, el módulo 1 (auto) queda en 714
    const result = computeDragResult(geo, config, 0, -100, 'precise1');
    expect(result.changed).toBe(true);
    expect(result.leftWidthMm).toBe(800); // 900 - 100
    expect(result.rightWidthMm).toBe(814); // 714 + 100
    // Derecho era auto, ahora fijado
    expect(result.config.modules[1]!.widthMm).toBe(814);
  });

  it('respeta mínimo del módulo derecho al mover a la derecha', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 900);
    const geo = calculateGeometry(config);
    // Intentar mover divisor muy a la derecha (rightModule -> min 200)
    const result = computeDragResult(geo, config, 0, 1000, 'precise1', true);
    expect(result.clamped).toBe(true);
    // rightModule no baja de 200 (min provisional)
    expect(result.rightWidthMm).toBeGreaterThanOrEqual(200);
  });

  it('respeta máximo provisional (2000 mm) del módulo izquierdo', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 1900);
    const geo = calculateGeometry(config);
    // Intentar crecer más allá de 2000
    const result = computeDragResult(geo, config, 0, 500, 'precise1', true);
    expect(result.clamped).toBe(true);
    expect(result.leftWidthMm).toBeLessThanOrEqual(2000);
  });

  it('sin clamp: rechaza fuera de límites y no cambia config', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 900);
    const geo = calculateGeometry(config);
    const result = computeDragResult(geo, config, 0, 1000, 'precise1', false);
    expect(result.changed).toBe(false);
    expect(result.appliedDeltaMm).toBe(0);
    expect(result.config.modules[0]!.widthMm).toBe(900);
  });

  it('cuantiza a pasos de 10 en modo step10', () => {
    const result = computeDragResult(geometry, DEFAULT_CONFIG, 0, 53, 'step10');
    expect(result.appliedDeltaMm).toBe(50);
    expect(result.leftWidthMm).toBe(826);
    expect(result.rightWidthMm).toBe(726);
  });

  it('no muta la geometría de entrada', () => {
    const frozen = deepFreeze(calculateGeometry(DEFAULT_CONFIG));
    computeDragResult(frozen, DEFAULT_CONFIG, 0, 50, 'precise1');
    // Si mutara, deepFreeze lo habría lanzado
    expect(frozen.wardrobe.modules[0]!.widthMm).toBe(776);
  });

  it('aplica delta negativo (divisor a la izquierda)', () => {
    const result = computeDragResult(geometry, DEFAULT_CONFIG, 0, -30, 'precise1');
    expect(result.changed).toBe(true);
    expect(result.appliedDeltaMm).toBe(-30);
    expect(result.leftWidthMm).toBe(746); // 776 - 30
    expect(result.rightWidthMm).toBe(806); // 776 + 30
  });

  it('cuatro módulos: solo afecta a los dos adyacentes', () => {
    const config = equalizeAllWidths(DEFAULT_CONFIG); // 3 módulos
    const geo = calculateGeometry(config);
    const result = computeDragResult(geo, config, 1, 40, 'precise1');
    expect(result.changed).toBe(true);
    expect(result.config.modules[0]!.widthMm).toBeUndefined(); // no cambia
    expect(result.config.modules[1]!.widthMm).toBe(776 + 40);
    expect(result.config.modules[2]!.widthMm).toBe(776 - 40);
  });

  it('módulo derecho fijado en mínimo provisional (300), no puede menguar más', () => {
    const config = setModuleWidth(DEFAULT_CONFIG, 1, 300);
    const geo = calculateGeometry(config);
    // Intentar mover divisor a la derecha (right mengua)
    const result = computeDragResult(geo, config, 0, 50, 'precise1', true);
    expect(result.clamped).toBe(true);
    expect(result.rightWidthMm).toBe(300);
  });

  it('delta 1 mm en modo precise1', () => {
    const result = computeDragResult(geometry, DEFAULT_CONFIG, 0, 1, 'precise1');
    expect(result.appliedDeltaMm).toBe(1);
    expect(result.leftWidthMm).toBe(777);
    expect(result.rightWidthMm).toBe(775);
  });

  it('módulos automáticos se fijan al primer movimiento', () => {
    const result = computeDragResult(geometry, DEFAULT_CONFIG, 0, 10, 'precise1');
    expect(result.config.modules[0]!.widthMm).not.toBeUndefined();
    expect(result.config.modules[1]!.widthMm).not.toBeUndefined();
    expect(result.config.modules[2]!.widthMm).toBeUndefined(); // tercero sin tocar
  });

  it('fijar ambos y luego mover: respeta anchos declarados', () => {
    let config = setModuleWidth(DEFAULT_CONFIG, 0, 800);
    config = setModuleWidth(config, 1, 700);
    const geo = calculateGeometry(config);
    const result = computeDragResult(geo, config, 0, -50, 'precise1');
    expect(result.leftWidthMm).toBe(750);
    expect(result.rightWidthMm).toBe(750);
    expect(result.config.modules[0]!.widthMm).toBe(750);
    expect(result.config.modules[1]!.widthMm).toBe(750);
  });
});