import { describe, expect, it } from 'vitest';
import { WARDROBE_LIMITS } from '../src/contract/limits.js';
import { distributeModules } from '../src/engine/distribute.js';
import { GeometryError } from '../src/errors.js';

const T18 = 18;
const T15 = 15;

function errorOf(fn: () => unknown): GeometryError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GeometryError);
    return error as GeometryError;
  }
  throw new Error('Se esperaba que la función lanzara un GeometryError');
}

describe('distributeModules', () => {
  describe('casos nominales', () => {
    it('reparte exacto cuando el ancho es divisible', () => {
      const d = distributeModules({
        totalWidthMm: 3000,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
      });
      expect(d.usableWidthMm).toBe(3000 - 2 * T18); // 2964
      expect(d.dividerTotalMm).toBe(2 * T18); // 36
      expect(d.availableWidthMm).toBe(2964 - 36); // 2928
      expect(d.moduleWidthsMm).toEqual([976, 976, 976]);
    });

    it('distribuye el residuo de izquierda a derecha (determinismo)', () => {
      const d = distributeModules({
        totalWidthMm: 3001,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
      });
      expect(d.availableWidthMm).toBe(2929);
      expect(d.moduleWidthsMm).toEqual([977, 976, 976]);
    });

    it('un solo módulo ocupa todo el ancho útil, sin divisiones', () => {
      const d = distributeModules({
        totalWidthMm: 2000,
        moduleCount: 1,
        sideThicknessMm: T15,
        dividerThicknessMm: T15,
      });
      expect(d.usableWidthMm).toBe(1970);
      expect(d.dividerTotalMm).toBe(0);
      expect(d.moduleWidthsMm).toEqual([1970]);
    });

    it('acepta el máximo de 4 módulos con espesor de 15 mm', () => {
      const d = distributeModules({
        totalWidthMm: 4000,
        moduleCount: 4,
        sideThicknessMm: T15,
        dividerThicknessMm: T15,
      });
      expect(d.usableWidthMm).toBe(3970);
      expect(d.dividerTotalMm).toBe(45);
      expect(d.availableWidthMm).toBe(3925);
      // 3925 / 4 = 981 con residuo 1 → [982, 981, 981, 981]
      expect(d.moduleWidthsMm).toEqual([982, 981, 981, 981]);
    });

    it('es determinista: dos llamadas producen el mismo resultado', () => {
      const input = {
        totalWidthMm: 2837,
        moduleCount: 3,
        sideThicknessMm: T18,
        dividerThicknessMm: T15,
      };
      expect(distributeModules(input)).toEqual(distributeModules(input));
    });
  });

  describe('límites', () => {
    it('rechaza número de módulos fuera de 1–4', () => {
      for (const moduleCount of [0, -1, 5, 10]) {
        const error = errorOf(() =>
          distributeModules({
            totalWidthMm: 3000,
            moduleCount,
            sideThicknessMm: T18,
            dividerThicknessMm: T18,
          }),
        );
        expect(error.code).toBe('ERR_INVALID_MODULE_COUNT');
      }
    });

    it('rechaza número de módulos no entero', () => {
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 3000,
          moduleCount: 2.5,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
        }),
      );
      expect(error.code).toBe('ERR_INVALID_MODULE_COUNT');
    });

    it('rechaza espesores fuera de 15/18 mm', () => {
      for (const sideThicknessMm of [12, 16, 20, 0, -18]) {
        const error = errorOf(() =>
          distributeModules({
            totalWidthMm: 3000,
            moduleCount: 2,
            sideThicknessMm,
            dividerThicknessMm: T18,
          }),
        );
        expect(error.code).toBe('ERR_INVALID_THICKNESS');
      }
    });

    it('rechaza espesor de división no soportado', () => {
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 3000,
          moduleCount: 2,
          sideThicknessMm: T18,
          dividerThicknessMm: 22,
        }),
      );
      expect(error.code).toBe('ERR_INVALID_THICKNESS');
    });

    it('rechaza ancho total no positivo o no entero', () => {
      for (const totalWidthMm of [0, -3000, 3000.5]) {
        const error = errorOf(() =>
          distributeModules({
            totalWidthMm,
            moduleCount: 2,
            sideThicknessMm: T18,
            dividerThicknessMm: T18,
          }),
        );
        expect(error.code).toBe('ERR_INVALID_DIMENSION');
      }
    });

    it('rechaza ancho que no deja hueco para módulos', () => {
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 30,
          moduleCount: 1,
          sideThicknessMm: T15,
          dividerThicknessMm: T15,
        }),
      );
      expect(error.code).toBe('ERR_WIDTH_INSUFFICIENT');
      expect(error.details.availableWidthMm).toBe(0);
    });

    it('rechaza ancho insuficiente para el ancho mínimo por módulo', () => {
      // 800 − 30 (laterales) − 45 (divisiones) = 725 < 4 × 300
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 800,
          moduleCount: 4,
          sideThicknessMm: T15,
          dividerThicknessMm: T15,
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_TOO_SMALL');
      expect(error.details.availableWidthMm).toBe(725);
      expect(error.details.requiredWidthMm).toBe(
        4 * WARDROBE_LIMITS.moduleWidthMm.min,
      );
    });

    it('respeta el ancho mínimo por módulo configurable', () => {
      // 1000 − 36 − 18 = 946 < 2 × 600
      const error = errorOf(() =>
        distributeModules({
          totalWidthMm: 1000,
          moduleCount: 2,
          sideThicknessMm: T18,
          dividerThicknessMm: T18,
          minModuleWidthMm: 600,
        }),
      );
      expect(error.code).toBe('ERR_MODULE_WIDTH_TOO_SMALL');
      expect(error.details.minModuleWidthMm).toBe(600);
    });

    it('acepta ancho exacto para el mínimo por módulo', () => {
      // 4 módulos × 300 + 3 × 18 + 2 × 18 = 1290
      const d = distributeModules({
        totalWidthMm: 1290,
        moduleCount: 4,
        sideThicknessMm: T18,
        dividerThicknessMm: T18,
      });
      expect(d.moduleWidthsMm).toEqual([300, 300, 300, 300]);
    });
  });
});
