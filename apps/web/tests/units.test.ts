import { describe, expect, it } from 'vitest';
import {
  MM_PER_M,
  formatCubicMeters,
  formatMm,
  mmToM,
  mToMm,
} from '../src/lib/units.js';

describe('conversión de unidades (mm ↔ m)', () => {
  it('convierte milímetros a metros', () => {
    expect(mmToM(0)).toBe(0);
    expect(mmToM(1)).toBe(0.001);
    expect(mmToM(18)).toBe(0.018);
    expect(mmToM(1000)).toBe(1);
    expect(mmToM(1500)).toBe(1.5);
    expect(mmToM(2400)).toBe(2.4);
  });

  it('convierte metros a milímetros', () => {
    expect(mToMm(0)).toBe(0);
    expect(mToMm(1)).toBe(1000);
    expect(mToMm(0.018)).toBeCloseTo(18, 10);
    expect(mToMm(2.4)).toBeCloseTo(2400, 10);
  });

  it('la conversión es consistente con la constante', () => {
    expect(MM_PER_M).toBe(1000);
    expect(mmToM(MM_PER_M)).toBe(1);
    expect(mToMm(1 / MM_PER_M)).toBeCloseTo(1, 10);
  });

  it('es idempotente en el redondeo (ida y vuelta)', () => {
    for (const mm of [1, 15, 18, 600, 2200, 3000]) {
      expect(mToMm(mmToM(mm))).toBeCloseTo(mm, 10);
    }
  });
});

describe('formato de medidas', () => {
  it('formatea milímetros con separador de miles', () => {
    expect(formatMm(0)).toBe('0 mm');
    expect(formatMm(18)).toBe('18 mm');
    expect(formatMm(999)).toBe('999 mm');
    expect(formatMm(1000)).toBe('1.000 mm');
    expect(formatMm(2400)).toBe('2.400 mm');
    expect(formatMm(1234567)).toBe('1.234.567 mm');
  });

  it('formatea volúmenes de mm³ a m³', () => {
    expect(formatCubicMeters(0)).toBe('0.000 m³');
    expect(formatCubicMeters(1_000_000_000)).toBe('1.000 m³');
    expect(formatCubicMeters(184_636_800)).toBe('0.185 m³');
  });
});
